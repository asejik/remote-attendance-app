-- Rollback of 20261014100000_legacy_photos_private: restores public legacy photos.
drop policy if exists "Legacy admins read attendance photos" on storage.objects;
create policy "Anyone can view photos" on storage.objects
  for select to public using (bucket_id = 'attendance-photos');
update storage.buckets set public = true where id = 'attendance-photos';
