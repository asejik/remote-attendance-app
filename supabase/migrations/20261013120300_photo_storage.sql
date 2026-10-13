-- M2.3 Private photo storage. ADDITIVE (the legacy public bucket
-- `attendance-photos` is untouched and retired after M4).
-- Rollback: supabase/rollbacks/20261013120300_photo_storage.down.sql
--
-- Paths carry no names or user IDs:
--   event-photos:     {organization_id}/{event_id}/face.jpg | site.jpg
--   reference-photos: {organization_id}/{staff_id}.jpg
-- Evidence is write-once: no update or delete policies on event photos.
-- Admins/supervisors view through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('event-photos', 'event-photos', false, 2097152, array['image/jpeg']),
  ('reference-photos', 'reference-photos', false, 2097152, array['image/jpeg']);

create policy "Members upload event photos to own organisation" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-photos'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(face|site)\.jpg$'
    and split_part(name, '/', 1) = private.current_org_id()::text
  );

create policy "Admins and supervisors read organisation event photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) = private.current_org_id()::text
    and private.current_staff_role() in ('admin', 'supervisor')
  );

create policy "Admins upload reference photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reference-photos'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and (split_part(name, '/', 1) = private.current_org_id()::text and private.current_staff_role() = 'admin')
  );

create policy "Admins replace reference photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'reference-photos' and (split_part(name, '/', 1) = private.current_org_id()::text and private.current_staff_role() = 'admin'))
  with check (bucket_id = 'reference-photos' and (split_part(name, '/', 1) = private.current_org_id()::text and private.current_staff_role() = 'admin'));

create policy "Admins read reference photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'reference-photos' and (split_part(name, '/', 1) = private.current_org_id()::text and private.current_staff_role() = 'admin'));
