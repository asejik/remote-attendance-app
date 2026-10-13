-- Rollback of 20261015090000_photo_retention. Leaves the pg_cron / pg_net
-- extensions installed (harmless); drop them manually if nothing else uses them.
select cron.unschedule('purge-expired-photos');
drop function if exists public.orphan_event_photos(interval, integer);
drop function if exists public.mark_reference_photo_deleted(uuid[]);
drop function if exists public.reference_photos_to_purge(integer);
drop function if exists public.mark_photos_deleted(uuid[]);
drop function if exists public.photos_to_purge(integer);
