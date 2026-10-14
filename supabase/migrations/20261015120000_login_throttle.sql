-- P04 fix H2: harden worker PIN sign-in against enumeration, lockout abuse and PIN spraying.
-- ADDITIVE (new table, columns, functions) with REPLACED staff_pin_set / staff_pin_verify (no data changed).
-- Rollback: supabase/rollbacks/20261015120000_login_throttle.down.sql
--
--   * Per-address throttle: the staff-login function passes a keyed hash of the
--     caller's IP (never the IP itself). 30 failed sign-ins from one address in
--     15 minutes block that address for 15 minutes, whatever codes it tried.
--   * Progressive lockout per account: the 5th wrong PIN locks for 15 minutes,
--     a second lock within 24 hours for 1 hour, then 24 hours. A correct PIN or
--     an admin PIN reset clears the history.
--   * The function now answers "locked" exactly like a wrong PIN (done in the
--     Edge Function), so lockouts can't be used to discover staff codes.

alter table private.staff_pins
  add column lock_count integer not null default 0,
  add column last_locked_at timestamptz;

create table private.login_throttle (
  key text primary key check (length(key) between 8 and 128),
  failures integer not null default 0,
  window_start timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on private.login_throttle from public, anon, authenticated;

-- When is this address blocked until (null = not blocked)? Service role only.
create or replace function public.login_throttle_blocked(p_key text) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select t.blocked_until from private.login_throttle t where t.key = p_key and t.blocked_until > now()
$$;

-- Count a failed sign-in for this address. Returns true when this failure
-- started a block (the caller reports it). Service role only.
create or replace function public.login_throttle_record_failure(
  p_key text, p_limit integer default 30, p_window interval default '15 minutes', p_block interval default '15 minutes'
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  t private.login_throttle;
begin
  delete from private.login_throttle where updated_at < now() - interval '1 day'; -- keep the table tiny
  insert into private.login_throttle as lt (key, failures, window_start, updated_at)
  values (p_key, 1, now(), now())
  on conflict (key) do update
    set failures = case when lt.window_start < now() - p_window then 1 else lt.failures + 1 end,
        window_start = case when lt.window_start < now() - p_window then now() else lt.window_start end,
        updated_at = now()
  returning * into t;
  if t.failures >= p_limit and (t.blocked_until is null or t.blocked_until <= now()) then
    update private.login_throttle set blocked_until = now() + p_block, failures = 0, window_start = now() where key = p_key;
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.login_throttle_blocked(text) from public, anon, authenticated;
revoke all on function public.login_throttle_record_failure(text, integer, interval, interval) from public, anon, authenticated;
grant execute on function public.login_throttle_blocked(text) to service_role;
grant execute on function public.login_throttle_record_failure(text, integer, interval, interval) to service_role;

-- Set (or reset) a PIN: as in 20261014090000, and also clears the lockout history.
create or replace function public.staff_pin_set(p_staff_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be 6 digits' using errcode = '22023';
  end if;
  insert into private.staff_pins (staff_id, pin_hash)
  values (p_staff_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (staff_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null,
        lock_count = 0, last_locked_at = null, updated_at = now();
end;
$$;

-- PIN sign-in: as in 20261015100000, with progressive lockout.
create or replace function public.staff_pin_verify(p_org_slug text, p_staff_code text, p_pin text)
returns table (result text, staff_id uuid, user_id uuid, locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  s public.staff;
  p private.staff_pins;
  locks integer;
begin
  select st.* into s
    from public.staff st join public.organizations o on o.id = st.organization_id
   where o.slug = lower(p_org_slug) and upper(st.staff_code) = upper(p_staff_code)
     and private.org_accepts_clockins(o.id);
  if s.id is null then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10)); -- similar timing
    return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select * into p from private.staff_pins where private.staff_pins.staff_id = s.id for update;
  if p.staff_id is null then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10));
    return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;
  if p.locked_until is not null and p.locked_until > now() then
    return query select 'locked'::text, null::uuid, null::uuid, p.locked_until;
    return;
  end if;

  if p.pin_hash = extensions.crypt(coalesce(p_pin, ''), p.pin_hash) then
    update private.staff_pins
       set failed_attempts = 0, locked_until = null, lock_count = 0, last_locked_at = null
     where private.staff_pins.staff_id = s.id;
    if s.status <> 'active' or s.user_id is null then
      return query select 'deactivated'::text, null::uuid, null::uuid, null::timestamptz;
      return;
    end if;
    return query select 'ok'::text, s.id, s.user_id, null::timestamptz;
    return;
  end if;

  if p.failed_attempts + 1 >= 5 then
    -- Repeat lockouts within a day last longer: 15 minutes, 1 hour, then 24 hours.
    locks := case when p.last_locked_at > now() - interval '24 hours' then p.lock_count + 1 else 1 end;
    update private.staff_pins
       set failed_attempts = 0, lock_count = locks, last_locked_at = now(),
           locked_until = now() + case locks when 1 then interval '15 minutes' when 2 then interval '1 hour' else interval '24 hours' end
     where private.staff_pins.staff_id = s.id
    returning * into p;
    insert into public.audit_log (organization_id, actor_user_id, action, target_table, target_id, details)
    values (s.organization_id, null, 'pin_locked', 'staff', s.id, jsonb_build_object('lock', locks, 'until', p.locked_until));
    return query select 'locked'::text, null::uuid, null::uuid, p.locked_until;
    return;
  end if;

  update private.staff_pins set failed_attempts = failed_attempts + 1 where private.staff_pins.staff_id = s.id;
  return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz;
end;
$$;
