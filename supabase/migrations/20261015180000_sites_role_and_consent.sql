-- P04 (2026-10-17) fixes L1 and L2. REPLACES three policies (no data changed).
-- Rollback: supabase/rollbacks/20261015180000_sites_role_and_consent.down.sql
--
-- L1: an admin signed in with only a password (no two-step code yet) could read
--     the organisation's active sites. Reading sites now needs a role, which
--     such an admin doesn't have (migration 20261015150000). Workers and
--     supervisors are unchanged.
-- L2: the privacy notice was enforced only by the app. Clock-ins are now
--     accepted only from someone who has accepted it. Phones are unaffected:
--     the clock-in screen can't be reached before accepting, so even records
--     queued offline were made after it.

drop policy "Members read active sites" on public.work_sites;
create policy "Members read active sites" on public.work_sites
  for select to authenticated
  using (organization_id = private.current_org_id() and active and private.current_staff_role() is not null);

drop policy "Workers record own events" on public.attendance_events;
create policy "Workers record own events" on public.attendance_events
  for insert to authenticated
  with check (
    organization_id = private.current_org_id()
    and staff_id = private.current_staff_id()
    and captured_by = auth.uid()
    and private.org_accepts_clockins(organization_id)
    and (private.current_staff()).consent_accepted_at is not null
  );

drop policy "Supervisors record events for their organisation" on public.attendance_events;
create policy "Supervisors record events for their organisation" on public.attendance_events
  for insert to authenticated
  with check (
    organization_id = private.current_org_id()
    and private.current_staff_role() = 'supervisor'
    and captured_by = auth.uid()
    and private.org_accepts_clockins(organization_id)
    and (private.current_staff()).consent_accepted_at is not null
  );
