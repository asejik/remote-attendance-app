-- Rollback of 20261013120200_event_logic.
drop function if exists public.update_org_settings(integer, boolean, public.geofence_mode);
drop function if exists public.review_event(uuid, public.review_status, text);
drop trigger if exists attendance_events_before_insert on public.attendance_events;
drop function if exists private.attendance_event_before_insert();
drop function if exists private.distance_m(double precision, double precision, double precision, double precision);
