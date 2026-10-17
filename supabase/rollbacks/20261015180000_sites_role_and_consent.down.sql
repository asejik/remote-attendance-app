-- Rollback for 20261015180000_sites_role_and_consent.sql (run by hand on dev).
-- Restores the policies as in 20261013120100 / 20261015100000.
drop policy "Members read active sites" on public.work_sites;
create policy "Members read active sites" on public.work_sites
  for select to authenticated
  using (organization_id = private.current_org_id() and active);

drop policy "Workers record own events" on public.attendance_events;
create policy "Workers record own events" on public.attendance_events
  for insert to authenticated
  with check (
    organization_id = private.current_org_id()
    and staff_id = private.current_staff_id()
    and captured_by = auth.uid()
    and private.org_accepts_clockins(organization_id)
  );

drop policy "Supervisors record events for their organisation" on public.attendance_events;
create policy "Supervisors record events for their organisation" on public.attendance_events
  for insert to authenticated
  with check (
    organization_id = private.current_org_id()
    and private.current_staff_role() = 'supervisor'
    and captured_by = auth.uid()
    and private.org_accepts_clockins(organization_id)
  );
