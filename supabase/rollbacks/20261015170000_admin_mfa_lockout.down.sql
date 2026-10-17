-- Rollback for 20261015170000_admin_mfa_lockout.sql (run by hand on dev).
-- Restores current_staff_role() as in 20261015150000 (AAL2 only, no lock).
select cron.unschedule('lock-guessed-admins');
create or replace function private.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select case
    when s.role = 'admin' and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then null
    else s.role
  end
  from private.current_staff() s
$$;
drop function if exists public.admin_lockouts_to_report();
drop function if exists public.admin_locked(uuid);
drop function if exists public.my_admin_lockout();
drop function if exists public.lock_guessed_admins(integer, uuid);
drop table if exists private.admin_lockouts;
