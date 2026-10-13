-- M2.1 Access rules (RLS) for the core schema. Deny by default.
-- ADDITIVE. Rollback: supabase/rollbacks/20261013120100_access_rules.down.sql

-- Helpers live in a schema PostgREST does not expose, so they can be used in
-- policies but not called over the API. SECURITY DEFINER avoids RLS recursion
-- on staff; search_path is pinned.
create schema if not exists private;
grant usage on schema private to authenticated;

-- The caller's active staff record (null if none, or deactivated).
create or replace function private.current_staff() returns public.staff
language sql stable security definer set search_path = '' as $$
  select s.* from public.staff s
  where s.user_id = auth.uid() and s.status = 'active'
  limit 1
$$;

create or replace function private.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select (private.current_staff()).organization_id
$$;

create or replace function private.current_staff_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select (private.current_staff()).id
$$;

create or replace function private.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select (private.current_staff()).role
$$;

create or replace function private.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_org_id() = org and private.current_staff_role() = 'admin', false)
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Table privileges: nothing for anon; the minimum for signed-in users.
-- (Supabase grants ALL on new public tables by default.)
revoke all on public.organizations, public.staff, public.work_sites,
  public.attendance_events, public.audit_log from anon, authenticated;

grant select on public.organizations to authenticated;
grant select on public.staff to authenticated;
grant select, insert, update on public.work_sites to authenticated;
grant select, insert on public.attendance_events to authenticated;
grant select on public.audit_log to authenticated;

alter table public.organizations enable row level security;
alter table public.staff enable row level security;
alter table public.work_sites enable row level security;
alter table public.attendance_events enable row level security;
alter table public.audit_log enable row level security;

-- organizations: members see their own organisation. Changes go through
-- update_org_settings() (admins) or the platform owner.
create policy "Members read own organisation" on public.organizations
  for select to authenticated
  using (id = private.current_org_id());

-- staff: everyone sees their own record; admins and supervisors see their
-- organisation. Writes go through admin Edge Functions (service role).
create policy "Read own staff record" on public.staff
  for select to authenticated
  using (user_id = auth.uid() and status = 'active');
create policy "Admins and supervisors read organisation staff" on public.staff
  for select to authenticated
  using (
    organization_id = private.current_org_id()
    and private.current_staff_role() in ('admin', 'supervisor')
  );

-- work_sites: members see active sites; admins see and manage all.
create policy "Members read active sites" on public.work_sites
  for select to authenticated
  using (organization_id = private.current_org_id() and active);
create policy "Admins read all sites" on public.work_sites
  for select to authenticated
  using (private.is_org_admin(organization_id));
create policy "Admins create sites" on public.work_sites
  for insert to authenticated
  with check (private.is_org_admin(organization_id) and created_by = auth.uid());
create policy "Admins update sites" on public.work_sites
  for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

-- attendance_events: workers insert and read their own; supervisors insert for
-- workers in their organisation (crew mode); admins and supervisors read the
-- organisation. No update/delete privileges at all.
create policy "Workers read own events" on public.attendance_events
  for select to authenticated
  using (staff_id = private.current_staff_id());
create policy "Admins and supervisors read organisation events" on public.attendance_events
  for select to authenticated
  using (
    organization_id = private.current_org_id()
    and private.current_staff_role() in ('admin', 'supervisor')
  );
create policy "Workers record own events" on public.attendance_events
  for insert to authenticated
  with check (
    organization_id = private.current_org_id()
    and staff_id = private.current_staff_id()
    and captured_by = auth.uid()
  );
create policy "Supervisors record events for their organisation" on public.attendance_events
  for insert to authenticated
  with check (
    organization_id = private.current_org_id()
    and private.current_staff_role() = 'supervisor'
    and captured_by = auth.uid()
  );

-- audit_log: admins read their organisation's entries. Written only by
-- SECURITY DEFINER functions.
create policy "Admins read organisation audit log" on public.audit_log
  for select to authenticated
  using (private.is_org_admin(organization_id));
