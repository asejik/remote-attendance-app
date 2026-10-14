-- Rollback for 20261015100000_site_audit_and_suspension.sql (run by hand on dev).
-- Restores the earlier policies and functions, removes the triggers, helpers and
-- organizations.suspended_at. Audit rows already written are kept.
begin;

drop trigger if exists work_sites_audit on public.work_sites;
drop function if exists private.work_site_audit();
drop trigger if exists organizations_status_change on public.organizations;
drop function if exists private.organization_status_change();

drop policy "Admins create sites" on public.work_sites;
create policy "Admins create sites" on public.work_sites
  for insert to authenticated
  with check (private.is_org_admin(organization_id) and created_by = auth.uid());
drop policy "Admins update sites" on public.work_sites;
create policy "Admins update sites" on public.work_sites
  for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy "Workers record own events" on public.attendance_events;
create policy "Workers record own events" on public.attendance_events
  for insert to authenticated
  with check (organization_id = private.current_org_id() and staff_id = private.current_staff_id() and captured_by = auth.uid());
drop policy "Supervisors record events for their organisation" on public.attendance_events;
create policy "Supervisors record events for their organisation" on public.attendance_events
  for insert to authenticated
  with check (organization_id = private.current_org_id() and private.current_staff_role() = 'supervisor' and captured_by = auth.uid());

-- Functions as in 20261013120200 and 20261014090000.
create or replace function public.review_event(event_id uuid, decision public.review_status, note text default null)
returns public.attendance_events
language plpgsql security definer set search_path = '' as $$
declare
  ev public.attendance_events;
begin
  if decision = 'pending' then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  if note is not null and length(note) > 500 then
    raise exception 'note too long (max 500 characters)' using errcode = '22023';
  end if;

  select * into ev from public.attendance_events where id = event_id;
  if ev.id is null or not private.is_org_admin(ev.organization_id) then
    raise exception 'event not found' using errcode = '42501';
  end if;

  update public.attendance_events
     set review_status = decision, review_note = note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = event_id
  returning * into ev;

  insert into public.audit_log (organization_id, actor_user_id, action, target_table, target_id, details)
  values (ev.organization_id, auth.uid(), 'review_event', 'attendance_events', ev.id,
          jsonb_build_object('decision', decision, 'note', note));
  return ev;
end;
$$;

create or replace function public.update_org_settings(
  photo_retention_days integer default null,
  site_photo_required boolean default null,
  geofence_mode public.geofence_mode default null
) returns public.organizations
language plpgsql security definer set search_path = '' as $$
declare
  org_id uuid := private.current_org_id();
  org public.organizations;
begin
  if org_id is null or not private.is_org_admin(org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.organizations o
     set photo_retention_days = coalesce(update_org_settings.photo_retention_days, o.photo_retention_days),
         site_photo_required = coalesce(update_org_settings.site_photo_required, o.site_photo_required),
         geofence_mode = coalesce(update_org_settings.geofence_mode, o.geofence_mode)
   where o.id = org_id
  returning * into org;

  insert into public.audit_log (organization_id, actor_user_id, action, target_table, target_id, details)
  values (org_id, auth.uid(), 'update_org_settings', 'organizations', org_id,
          jsonb_build_object('photo_retention_days', update_org_settings.photo_retention_days,
                             'site_photo_required', update_org_settings.site_photo_required,
                             'geofence_mode', update_org_settings.geofence_mode));
  return org;
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

drop function if exists private.org_accepts_clockins(uuid);
drop function if exists private.org_is_active(uuid);
alter table public.organizations drop column if exists suspended_at;

commit;
