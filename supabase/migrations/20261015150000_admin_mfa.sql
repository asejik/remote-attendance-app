-- P04 fix M2: admins must complete two-step login (TOTP, Supabase MFA) before
-- they have any admin power.
-- REPLACES private.current_staff_role() (no data changed).
-- Rollback: supabase/rollbacks/20261015150000_admin_mfa.down.sql
--
-- An admin whose session is not AAL2 (password only) resolves to no role: every
-- policy and RPC that checks for admin or supervisor (staff list, events, photos,
-- sites, audit log, review_event, update_org_settings) refuses them. They can
-- still read their own staff record, so the app knows to ask for the code.
-- Workers and supervisors (PIN sign-in) are unchanged. The admin-staff Edge
-- Function checks the same AAL2 claim.

create or replace function private.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select case
    when s.role = 'admin' and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then null
    else s.role
  end
  from private.current_staff() s
$$;
