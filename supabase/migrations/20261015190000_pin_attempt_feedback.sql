-- Owner test feedback (2026-10-17): tell workers how many PIN tries are left
-- and when their account is locked, instead of the same "not correct" answer.
-- ADDITIVE (new table) with REPLACED staff_pin_verify (new return column; no data changed).
-- Rollback: supabase/rollbacks/20261015190000_pin_attempt_feedback.down.sql
--
-- Showing "4 tries left" or "locked" for real staff codes only would let a
-- stranger find which codes exist (P04 H2). So codes that don't exist (or have
-- no PIN, or belong to an organisation that no longer accepts clock-ins) are
-- counted the same way in private.code_attempts: the same 5 tries, the same
-- 15 min / 1 h / 24 h locks. Real and made-up codes answer identically until
-- the right PIN is entered. Real accounts keep their state in staff_pins, so an
-- admin PIN reset still unlocks at once.

create table private.code_attempts (
  key text primary key check (length(key) = 64), -- sha256 of organisation slug and staff code
  failed_attempts integer not null default 0,
  lock_count integer not null default 0,
  last_locked_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on private.code_attempts from public, anon, authenticated;

drop function public.staff_pin_verify(text, text, text);

-- PIN sign-in: as in 20261015120000, plus attempts_left for every code.
create function public.staff_pin_verify(p_org_slug text, p_staff_code text, p_pin text)
returns table (result text, staff_id uuid, user_id uuid, locked_until timestamptz, attempts_left integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  max_tries constant integer := 5;
  s public.staff;
  p private.staff_pins;
  a private.code_attempts;
  k text := encode(extensions.digest(lower(coalesce(p_org_slug, '')) || '/' || upper(coalesce(p_staff_code, '')), 'sha256'), 'hex');
  locks integer;
begin
  select st.* into s
    from public.staff st join public.organizations o on o.id = st.organization_id
   where o.slug = lower(p_org_slug) and upper(st.staff_code) = upper(p_staff_code)
     and private.org_accepts_clockins(o.id);
  if s.id is not null then
    select * into p from private.staff_pins where private.staff_pins.staff_id = s.id for update;
  end if;

  -- No usable account: count the attempt exactly as a wrong PIN would be.
  if p.staff_id is null then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10)); -- similar timing
    delete from private.code_attempts where updated_at < now() - interval '2 days'; -- keep the table small
    insert into private.code_attempts (key) values (k) on conflict (key) do nothing;
    select * into a from private.code_attempts where key = k for update;
    if a.locked_until is not null and a.locked_until > now() then
      return query select 'locked'::text, null::uuid, null::uuid, a.locked_until, 0;
      return;
    end if;
    if a.failed_attempts + 1 >= max_tries then
      locks := case when a.last_locked_at > now() - interval '24 hours' then a.lock_count + 1 else 1 end;
      update private.code_attempts
         set failed_attempts = 0, lock_count = locks, last_locked_at = now(), updated_at = now(),
             locked_until = now() + case locks when 1 then interval '15 minutes' when 2 then interval '1 hour' else interval '24 hours' end
       where key = k
      returning * into a;
      return query select 'locked'::text, null::uuid, null::uuid, a.locked_until, 0;
      return;
    end if;
    update private.code_attempts set failed_attempts = failed_attempts + 1, updated_at = now() where key = k returning * into a;
    return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz, max_tries - a.failed_attempts;
    return;
  end if;

  if p.locked_until is not null and p.locked_until > now() then
    return query select 'locked'::text, null::uuid, null::uuid, p.locked_until, 0;
    return;
  end if;

  if p.pin_hash = extensions.crypt(coalesce(p_pin, ''), p.pin_hash) then
    update private.staff_pins
       set failed_attempts = 0, locked_until = null, lock_count = 0, last_locked_at = null
     where private.staff_pins.staff_id = s.id;
    if s.status <> 'active' or s.user_id is null then
      return query select 'deactivated'::text, null::uuid, null::uuid, null::timestamptz, null::integer;
      return;
    end if;
    return query select 'ok'::text, s.id, s.user_id, null::timestamptz, null::integer;
    return;
  end if;

  if p.failed_attempts + 1 >= max_tries then
    -- Repeat lockouts within a day last longer: 15 minutes, 1 hour, then 24 hours.
    locks := case when p.last_locked_at > now() - interval '24 hours' then p.lock_count + 1 else 1 end;
    update private.staff_pins
       set failed_attempts = 0, lock_count = locks, last_locked_at = now(),
           locked_until = now() + case locks when 1 then interval '15 minutes' when 2 then interval '1 hour' else interval '24 hours' end
     where private.staff_pins.staff_id = s.id
    returning * into p;
    insert into public.audit_log (organization_id, actor_user_id, action, target_table, target_id, details)
    values (s.organization_id, null, 'pin_locked', 'staff', s.id, jsonb_build_object('lock', locks, 'until', p.locked_until));
    return query select 'locked'::text, null::uuid, null::uuid, p.locked_until, 0;
    return;
  end if;

  update private.staff_pins set failed_attempts = failed_attempts + 1 where private.staff_pins.staff_id = s.id returning * into p;
  return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz, max_tries - p.failed_attempts;
end;
$$;

revoke all on function public.staff_pin_verify(text, text, text) from public, anon, authenticated;
grant execute on function public.staff_pin_verify(text, text, text) to service_role;
