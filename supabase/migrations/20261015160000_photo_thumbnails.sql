-- P02 E3 Photo thumbnails. ADDITIVE (widens two upload rules; no data change).
-- Rollback: supabase/rollbacks/20261015160000_photo_thumbnails.down.sql
--
-- Admin lists show small copies instead of full photos, which cuts photo
-- downloads by about 80-90%. Phones make them when they upload:
--   event-photos:     {organization_id}/{event_id}/face_thumb.jpg | site_thumb.jpg
--   reference-photos: {organization_id}/{staff_id}_thumb.jpg
-- Read rules are unchanged (by organisation and role). Event photos stay
-- write-once. Retention and data-request delete thumbnails with their photo.

drop policy "Members upload event photos to own organisation" on storage.objects;
create policy "Members upload event photos to own organisation" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-photos'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(face|site)(_thumb)?\.jpg$'
    and split_part(name, '/', 1) = private.current_org_id()::text
  );

drop policy "Admins upload reference photos" on storage.objects;
create policy "Admins upload reference photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reference-photos'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(_thumb)?\.jpg$'
    and (split_part(name, '/', 1) = private.current_org_id()::text and private.current_staff_role() = 'admin')
  );
