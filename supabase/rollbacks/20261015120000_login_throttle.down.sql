-- Rollback for 20261015120000_login_throttle.sql (run by hand on dev).
-- Restores staff_pin_set / staff_pin_verify as in 20261014090000 / 20261015100000
-- and removes the throttle table and lockout-history columns.
begin;

drop function if exists public.login_throttle_record_failure(text, integer, interval, interval);
drop function if exists public.login_throttle_blocked(text);
drop table if exists private.login_throttle;

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
   where o.slug = lower(p_org_slug) and upper(st.staff_code) = upper(p_staff_code)
     and private.org_accepts_clockins(o.id);
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

alter table private.staff_pins drop column if exists lock_count, drop column if exists last_locked_at;

commit;
