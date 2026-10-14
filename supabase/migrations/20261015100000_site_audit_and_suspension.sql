-- P03 fixes M1 + M2: audit work-site changes; define what a suspended organisation can do.
-- ADDITIVE (new column, helpers, triggers) with REPLACED policies/functions (stricter; no data changed).
-- Rollback: supabase/rollbacks/20261015100000_site_audit_and_suspension.down.sql
--
-- Suspension (owner sets organizations.status = 'suspended', e.g. for non-payment):
--   * admins keep read access (review list, reports, exports) but can't change anything:
--     sites, reviews, settings (and admin-staff already refuses non-active organisations);
--   * workers and supervisors can still sign in and clock in for 7 days, then clock-ins are refused.

alter table public.organizations add column suspended_at timestamptz;

-- Owner changes to status: stamp suspended_at and audit it.
create or replace function private.organization_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.suspended_at := case when new.status = 'suspended' then now() else null end;
    insert into public.audit_log (organization_id, actor_user_id, action, target_table, target_id, details)
    values (new.id, auth.uid(), case when new.status = 'suspended' then 'suspend_org' else 'reactivate_org' end,
            'organizations', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;
create trigger organizations_status_change before update of status on public.organizations
  for each row execute function private.organization_status_change();

create or replace function private.org_is_active(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select o.status = 'active' from public.organizations o where o.id = org), false)
$$;

-- Clock-ins are accepted while active, and for 7 days after suspension.
create or replace function private.org_accepts_clockins(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select o.status = 'active' or (o.status = 'suspended' and o.suspended_at > now() - interval '7 days')
      from public.organizations o where o.id = org
  ), false)
$$;

revoke all on function private.organization_status_change(), private.org_is_active(uuid), private.org_accepts_clockins(uuid) from public, anon;
grant execute on function private.org_is_active(uuid), private.org_accepts_clockins(uuid) to authenticated;
revoke all on function private.organization_status_change() from authenticated;

-- Sites: admins change them only while the organisation is active.
drop policy "Admins create sites" on public.work_sites;
create policy "Admins create sites" on public.work_sites
  for insert to authenticated
  with check (private.is_org_admin(organization_id) and created_by = auth.uid() and private.org_is_active(organization_id));
drop policy "Admins update sites" on public.work_sites;
create policy "Admins update sites" on public.work_sites
  for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id) and private.org_is_active(organization_id));

-- Clock-ins: refused once the 7-day grace after suspension is over.
drop policy "Workers record own events" on public.attendance_events;
create policy "Workers record own events" on public.attendance_events
  for insert to authenticated
  with check (
    organization_id = private.current_org_id() and staff_id = private.current_staff_id()
    and captured_by = auth.uid() and private.org_accepts_clockins(organization_id)
  );
drop policy "Supervisors record events for their organisation" on public.attendance_events;
create policy "Supervisors record events for their organisation" on public.attendance_events
  for insert to authenticated
  with check (
    organization_id = private.current_org_id() and private.current_staff_role() = 'supervisor'
    and captured_by = auth.uid() and private.org_accepts_clockins(organization_id)
  );

-- Work-site changes decide which later clock-ins are flagged "outside site",
-- so every create and change is audited with the before and after values.
create or replace function private.work_site_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fields text[] := array['name', 'latitude', 'longitude', 'radius_m', 'address', 'active'];
  v_before jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_after jsonb := to_jsonb(new);
  changed jsonb := '{}'::jsonb;
  f text;
begin
  foreach f in array fields loop
    if tg_op = 'INSERT' or v_before -> f is distinct from v_after -> f then
      changed := changed || jsonb_build_object(f, jsonb_build_object('from', v_before -> f, 'to', v_after -> f));
    end if;
  end loop;
  if changed <> '{}'::jsonb then
    insert into public.audit_log (organization_id, actor_user_id, action, target_table, target_id, details)
    values (new.organization_id, auth.uid(), case when tg_op = 'INSERT' then 'create_site' else 'update_site' end,
            'work_sites', new.id, changed);
  end if;
  return null;
end;
$$;
revoke all on function private.work_site_audit() from public, anon, authenticated;
create trigger work_sites_audit after insert or update on public.work_sites
  for each row execute function private.work_site_audit();

-- Reviews and settings: same as 20261013120200, plus "organisation is active".
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
  if not private.org_is_active(ev.organization_id) then
    raise exception 'organisation suspended (read-only)' using errcode = '42501';
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
  if not private.org_is_active(org_id) then
    raise exception 'organisation suspended (read-only)' using errcode = '42501';
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

-- PIN sign-in: same as 20261014090000, but allowed during the 7-day grace.
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
