-- M2.2 Server-side clock-in logic and admin functions.
-- ADDITIVE. Rollback: supabase/rollbacks/20261013120200_event_logic.down.sql

-- Great-circle distance in metres.
create or replace function private.distance_m(lat1 double precision, lon1 double precision,
                                              lat2 double precision, lon2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ))
$$;

-- Runs on every insert. The device cannot set computed or review columns; the
-- server works out distance, geofence and flags. Flags never reject an event:
-- an offline worker's real clock-in must not be lost.
create or replace function private.attendance_event_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  site public.work_sites;
  org public.organizations;
begin
  new.received_at := now();
  new.created_at := now();
  new.updated_at := now();
  new.distance_m := null;
  new.within_radius := null;
  new.flags := '{}';
  new.photos_deleted_at := null;
  new.review_status := 'pending';
  new.review_note := null;
  new.reviewed_by := null;
  new.reviewed_at := null;

  select * into org from public.organizations where id = new.organization_id;

  if new.site_id is null then
    new.flags := array_append(new.flags, 'no_site');
  else
    select * into site from public.work_sites where id = new.site_id;
    new.site_name_snapshot := site.name;
  end if;

  if new.latitude is null or new.longitude is null then
    new.flags := array_append(new.flags, 'no_location');
  elsif site.id is not null then
    new.distance_m := private.distance_m(site.latitude, site.longitude, new.latitude, new.longitude);
    new.within_radius := new.distance_m <= site.radius_m;
    if not new.within_radius then
      new.flags := array_append(new.flags, 'outside_radius');
    end if;
  end if;

  if new.accuracy_m > 100 then
    new.flags := array_append(new.flags, 'low_accuracy');
  end if;
  if new.captured_at > new.received_at + interval '5 minutes'
     or new.captured_at < new.received_at - interval '14 days' then
    new.flags := array_append(new.flags, 'time_skew');
  end if;
  if new.face_photo_path is null then
    new.flags := array_append(new.flags, 'no_face_photo');
  end if;
  if new.site_photo_path is null and org.site_photo_required then
    new.flags := array_append(new.flags, 'no_site_photo');
  end if;
  if not new.liveness_passed then
    new.flags := array_append(new.flags, 'liveness_failed');
  end if;

  return new;
end;
$$;

create trigger attendance_events_before_insert before insert on public.attendance_events
  for each row execute function private.attendance_event_before_insert();

-- Admin review of one event. Writes the audit log.
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

-- Admin changes to their organisation's settings. Writes the audit log.
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

revoke all on function public.review_event(uuid, public.review_status, text) from public, anon;
grant execute on function public.review_event(uuid, public.review_status, text) to authenticated;
revoke all on function public.update_org_settings(integer, boolean, public.geofence_mode) from public, anon;
grant execute on function public.update_org_settings(integer, boolean, public.geofence_mode) to authenticated;
revoke all on function private.attendance_event_before_insert() from public, anon, authenticated;
