-- Rollback of 20261013120300_photo_storage. Run newest-first.
-- Buckets must be empty first (delete objects via the Storage API/dashboard).
drop policy if exists "Members upload event photos to own organisation" on storage.objects;
drop policy if exists "Admins and supervisors read organisation event photos" on storage.objects;
drop policy if exists "Admins upload reference photos" on storage.objects;
drop policy if exists "Admins replace reference photos" on storage.objects;
drop policy if exists "Admins read reference photos" on storage.objects;
delete from storage.buckets where id in ('event-photos', 'reference-photos');
