-- P04 fixes L1 + L4.
-- DESTRUCTIVE only for the unused GraphQL extension (no data); otherwise privilege changes.
-- Rollback: supabase/rollbacks/20261015140000_security_hardening.down.sql

-- L1: the app never uses GraphQL. The extension showed table and column names
-- to signed-in users (and legacy tables to anyone). Remove it.
drop extension if exists pg_graphql;

-- L4: plan fields (seats, price per seat) are for the platform owner, not for
-- workers. Signed-in users may read every other column of their organisation
-- (rows are still limited by RLS). Admins see the full row through
-- update_org_settings(), which is unchanged.
revoke select on public.organizations from authenticated;
grant select (id, name, slug, timezone, photo_retention_days, site_photo_required, geofence_mode,
              status, suspended_at, created_at, updated_at)
  on public.organizations to authenticated;
