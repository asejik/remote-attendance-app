-- Rollback for 20261015150000_admin_mfa.sql (run by hand on dev).
-- Restores current_staff_role() as in 20261013120100 (admins need only a password).
create or replace function private.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select (private.current_staff()).role
$$;
