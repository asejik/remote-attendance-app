-- Rollback of 20261013120000_core_schema. DESTRUCTIVE: deletes all new-schema data.
drop table if exists public.audit_log;
drop table if exists public.attendance_events;
drop table if exists public.work_sites;
drop table if exists public.staff;
drop table if exists public.organizations;
drop function if exists public.set_updated_at();
drop type if exists public.geofence_mode;
drop type if exists public.review_status;
drop type if exists public.event_type;
drop type if exists public.staff_status;
drop type if exists public.staff_role;
