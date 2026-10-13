-- M6.2 Automatic photo deletion (data minimisation, NDPA).
-- ADDITIVE (new extensions, functions, one scheduled job; no data change on apply).
-- Rollback: supabase/rollbacks/20261015090000_photo_retention.down.sql
--
-- A daily pg_cron job calls the `purge-expired-photos` Edge Function, which
-- deletes storage objects through the Storage API and then records it here.
-- Per-environment values live in Vault (set once per project, see runbook):
--   project_url  e.g. https://<ref>.supabase.co
--   cron_secret  must equal the function secret CRON_SECRET

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Event photos past their organisation's retention period.
create or replace function public.photos_to_purge(p_limit integer default 200)
returns table (event_id uuid, face_photo_path text, site_photo_path text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.face_photo_path, e.site_photo_path
    from public.attendance_events e
    join public.organizations o on o.id = e.organization_id
   where e.photos_deleted_at is null
     and (e.face_photo_path is not null or e.site_photo_path is not null)
     and e.captured_at < now() - make_interval(days => o.photo_retention_days)
   order by e.captured_at
   limit p_limit
$$;

create or replace function public.mark_photos_deleted(p_event_ids uuid[]) returns integer
language sql security definer set search_path = '' as $$
  with done as (
    update public.attendance_events set photos_deleted_at = now()
     where id = any(p_event_ids) and photos_deleted_at is null
    returning 1
  )
  select count(*)::integer from done
$$;

-- Reference photos of staff deactivated more than 30 days ago.
create or replace function public.reference_photos_to_purge(p_limit integer default 200)
returns table (staff_id uuid, reference_photo_path text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.reference_photo_path
    from public.staff s
   where s.status = 'deactivated'
     and s.reference_photo_path is not null
     and s.deactivated_at < now() - interval '30 days'
   limit p_limit
$$;

create or replace function public.mark_reference_photo_deleted(p_staff_ids uuid[]) returns integer
language sql security definer set search_path = '' as $$
  with done as (
    update public.staff set reference_photo_path = null
     where id = any(p_staff_ids) and status = 'deactivated'
    returning 1
  )
  select count(*)::integer from done
$$;

-- Event photos whose event row never arrived (an upload interrupted between
-- the photo and the record) and that are older than p_min_age.
create or replace function public.orphan_event_photos(p_min_age interval default interval '7 days', p_limit integer default 200)
returns table (name text)
language sql stable security definer set search_path = '' as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'event-photos'
     and o.created_at < now() - p_min_age
     and not exists (
       select 1 from public.attendance_events e where e.id::text = split_part(o.name, '/', 2)
     )
   limit p_limit
$$;

revoke all on function public.photos_to_purge(integer) from public, anon, authenticated;
revoke all on function public.mark_photos_deleted(uuid[]) from public, anon, authenticated;
revoke all on function public.reference_photos_to_purge(integer) from public, anon, authenticated;
revoke all on function public.mark_reference_photo_deleted(uuid[]) from public, anon, authenticated;
revoke all on function public.orphan_event_photos(interval, integer) from public, anon, authenticated;
grant execute on function public.photos_to_purge(integer) to service_role;
grant execute on function public.mark_photos_deleted(uuid[]) to service_role;
grant execute on function public.reference_photos_to_purge(integer) to service_role;
grant execute on function public.mark_reference_photo_deleted(uuid[]) to service_role;
grant execute on function public.orphan_event_photos(interval, integer) to service_role;

-- Daily at 02:15 UTC (03:15 in Lagos). Does nothing until the Vault secrets exist.
select cron.schedule(
  'purge-expired-photos',
  '15 2 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/purge-expired-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
  $job$
);
