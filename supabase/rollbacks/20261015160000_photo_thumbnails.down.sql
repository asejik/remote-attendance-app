-- Rollback for 20261015160000_photo_thumbnails.sql (run by hand on dev).
-- Restores the upload rules from 20261013120300. Existing thumbnails stay in
-- storage (harmless; retention still removes them).
drop policy "Members upload event photos to own organisation" on storage.objects;
create policy "Members upload event photos to own organisation" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-photos'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(face|site)\.jpg$'
    and split_part(name, '/', 1) = private.current_org_id()::text
  );

drop policy "Admins upload reference photos" on storage.objects;
create policy "Admins upload reference photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reference-photos'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and (split_part(name, '/', 1) = private.current_org_id()::text and private.current_staff_role() = 'admin')
  );
