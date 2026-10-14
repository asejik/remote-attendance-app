-- Rollback for 20261015130000_recorded_by_other_flag.sql (run by hand on dev).
-- Restores the insert trigger function as in 20261013120200. Flags already set stay.

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
