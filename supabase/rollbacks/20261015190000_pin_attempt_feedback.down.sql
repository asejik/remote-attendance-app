-- Rollback for 20261015190000_pin_attempt_feedback.sql (run by hand on dev).
-- Restores staff_pin_verify as in 20261015120000 (same answer for locked and wrong).
drop function if exists public.staff_pin_verify(text, text, text);
-- PIN sign-in: as in 20261015100000, with progressive lockout.
create function public.staff_pin_verify(p_org_slug text, p_staff_code text, p_pin text)
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
revoke all on function public.staff_pin_verify(text, text, text) from public, anon, authenticated;
grant execute on function public.staff_pin_verify(text, text, text) to service_role;
drop table if exists private.code_attempts;
