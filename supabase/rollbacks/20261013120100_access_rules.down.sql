-- Rollback of 20261013120100_access_rules (policies drop with the tables in the
-- core rollback; this removes the helpers and RLS if the tables are kept).
alter table if exists public.organizations disable row level security;
alter table if exists public.staff disable row level security;
alter table if exists public.work_sites disable row level security;
alter table if exists public.attendance_events disable row level security;
alter table if exists public.audit_log disable row level security;
drop schema if exists private cascade; -- helpers and every policy that uses them
