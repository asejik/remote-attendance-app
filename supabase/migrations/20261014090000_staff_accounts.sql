-- M3 Staff accounts: PIN login with lockout, consent, reference photos.
-- ADDITIVE. Rollback: supabase/rollbacks/20261014090000_staff_accounts.down.sql
--
-- Workers sign in with organisation slug + staff code + 6-digit PIN through the
-- `staff-login` Edge Function. Their Supabase Auth password is a random secret
-- nobody knows, so PINs cannot be guessed against the Auth API directly. PINs
-- are bcrypt-hashed here, in a schema the API does not expose.

create table private.staff_pins (
  staff_id uuid primary key references public.staff (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on private.staff_pins from public, anon, authenticated;

-- Set (or reset) a staff member's PIN; clears any lockout. Service role only.
create or replace function public.staff_pin_set(p_staff_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be 6 digits' using errcode = '22023';
  end if;
  insert into private.staff_pins (staff_id, pin_hash)
  values (p_staff_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (staff_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end;
$$;

-- Check a PIN with lockout: 5 wrong tries lock the account for 15 minutes.
-- Returns one row: result is 'ok' | 'invalid' | 'locked' | 'deactivated'.
-- Unknown organisation/code returns 'invalid' (no account enumeration).
-- Service role only.
create or replace function public.staff_pin_verify(p_org_slug text, p_staff_code text, p_pin text)
returns table (result text, staff_id uuid, user_id uuid, locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  s public.staff;
  p private.staff_pins;
begin
  select st.* into s
    from public.staff st join public.organizations o on o.id = st.organization_id
   where o.slug = lower(p_org_slug) and upper(st.staff_code) = upper(p_staff_code) and o.status = 'active';
  if s.id is null then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10)); -- similar timing
    return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select * into p from private.staff_pins where private.staff_pins.staff_id = s.id for update;
  if p.staff_id is null then
    return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;
  if p.locked_until is not null and p.locked_until > now() then
    return query select 'locked'::text, null::uuid, null::uuid, p.locked_until;
    return;
  end if;

  if p.pin_hash = extensions.crypt(coalesce(p_pin, ''), p.pin_hash) then
    update private.staff_pins set failed_attempts = 0, locked_until = null where private.staff_pins.staff_id = s.id;
    if s.status <> 'active' or s.user_id is null then
      return query select 'deactivated'::text, null::uuid, null::uuid, null::timestamptz;
      return;
    end if;
    return query select 'ok'::text, s.id, s.user_id, null::timestamptz;
    return;
  end if;

  update private.staff_pins
     set failed_attempts = failed_attempts + 1,
         locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
   where private.staff_pins.staff_id = s.id
  returning * into p;
  if p.locked_until is not null then
    insert into public.audit_log (organization_id, actor_user_id, action, target_table, target_id, details)
    values (s.organization_id, null, 'pin_locked', 'staff', s.id, jsonb_build_object('failed_attempts', p.failed_attempts));
    return query select 'locked'::text, null::uuid, null::uuid, p.locked_until;
    return;
  end if;
  return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz;
end;
$$;

revoke all on function public.staff_pin_set(uuid, text) from public, anon, authenticated;
revoke all on function public.staff_pin_verify(text, text, text) from public, anon, authenticated;
grant execute on function public.staff_pin_set(uuid, text) to service_role;
grant execute on function public.staff_pin_verify(text, text, text) to service_role;

-- A signed-in staff member accepts the privacy notice (first login).
create or replace function public.accept_consent() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  accepted timestamptz;
begin
  update public.staff
     set consent_accepted_at = coalesce(consent_accepted_at, now())
   where id = private.current_staff_id()
  returning consent_accepted_at into accepted;
  if accepted is null then
    raise exception 'no active staff record' using errcode = '42501';
  end if;
  return accepted;
end;
$$;
revoke all on function public.accept_consent() from public, anon;
grant execute on function public.accept_consent() to authenticated;
