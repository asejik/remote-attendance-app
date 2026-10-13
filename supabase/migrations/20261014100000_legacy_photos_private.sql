-- Make the legacy prototype photo bucket private (decision 2A, M4).
-- Type: restricts access; no data change. The legacy tables and bucket are
-- removed entirely at M6. Rollback: supabase/rollbacks/20261014100000_legacy_photos_private.down.sql
--
-- Effect on the legacy prototype (main): public photo URLs stop working, so its
-- admin page no longer shows photos. Clock-in and uploads keep working.

update storage.buckets set public = false where id = 'attendance-photos';

-- Previously anyone (including anonymous) could read every legacy photo.
drop policy if exists "Anyone can view photos" on storage.objects;
create policy "Legacy admins read attendance photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'attendance-photos' and public.is_admin());
