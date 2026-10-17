-- P04 (2026-10-17) fix M1: lock an admin after repeated wrong two-step codes.
-- ADDITIVE (new table, functions, one scheduled job) with REPLACED
-- private.current_staff_role() (no data changed).
-- Rollback: supabase/rollbacks/20261015170000_admin_mfa_lockout.down.sql
--
-- Supabase limits two-step (TOTP) guesses per IP address only; its per-user
-- hook needs the Teams plan. Someone holding an admin's password could keep
-- guessing from several addresses. Every guess leaves an unverified row in
-- auth.mfa_challenges, so a job every 5 minutes counts them: 20 or more in
-- 24 hours locks the admin. A locked admin has no admin power, even with a
-- correctly guessed code. The owner clears the lock after checking with the
-- admin (RUNBOOK: "Admin locked out after wrong codes"). The daily purge run
-- reports new locks to Sentry.

create table private.admin_lockouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  failures integer not null,
  locked_at timestamptz not null default now(),
  cleared_at timestamptz, -- set by the owner to unlock
  reported_at timestamptz -- set when the purge run has reported it to Sentry
);
create unique index admin_lockouts_active_idx on private.admin_lockouts (user_id) where cleared_at is null;
revoke all on private.admin_lockouts from public, anon, authenticated;

-- Admins whose session isn't AAL2, or who are locked, have no role.
create or replace function private.current_staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select case
    when s.role = 'admin' and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
      or exists (select 1 from private.admin_lockouts l where l.user_id = s.user_id and l.cleared_at is null)
    ) then null
    else s.role
  end
  from private.current_staff() s
$$;

-- Lock admins with 20+ wrong codes in the last 24 hours (only counting codes
-- after their last unlock). Returns how many were locked. Service role / cron
-- only; p_only_user limits it to one user (tests).
create or replace function public.lock_guessed_admins(p_threshold integer default 20, p_only_user uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  locked integer;
begin
  with failures as (
    select f.user_id, count(*)::integer as n
      from auth.mfa_challenges c
      join auth.mfa_factors f on f.id = c.factor_id
     where c.verified_at is null
       and (p_only_user is null or f.user_id = p_only_user)
       and c.created_at > greatest(
         now() - interval '24 hours',
         coalesce((select max(l.cleared_at) from private.admin_lockouts l where l.user_id = f.user_id), '-infinity')
       )
     group by f.user_id
    having count(*) >= p_threshold
  ), admins as (
    select fl.user_id, fl.n, s.id as staff_id, s.organization_id
      from failures fl
      join public.staff s on s.user_id = fl.user_id and s.role = 'admin'
     where not exists (select 1 from private.admin_lockouts l where l.user_id = fl.user_id and l.cleared_at is null)
  ), inserted as (
    insert into private.admin_lockouts (user_id, failures)
    select user_id, n from admins
    returning user_id
  )
  insert into public.audit_log (organization_id, actor_user_id, action, target_table, target_id, details)
  select a.organization_id, null, 'admin_locked_wrong_codes', 'staff', a.staff_id, jsonb_build_object('wrong_codes_24h', a.n)
    from admins a join inserted i using (user_id);
  get diagnostics locked = row_count;
  return locked;
end $$;

-- Is the signed-in admin locked? (The two-step screen explains it.)
create or replace function public.my_admin_lockout() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admin_lockouts l where l.user_id = auth.uid() and l.cleared_at is null)
$$;

-- Is this user locked? For the admin-staff Edge Function. Service role only.
create or replace function public.admin_locked(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admin_lockouts l where l.user_id = p_user_id and l.cleared_at is null)
$$;

-- New locks not yet reported to Sentry; marks them reported. Service role only.
create or replace function public.admin_lockouts_to_report() returns table (organization_id uuid, failures integer, locked_at timestamptz)
language sql security definer set search_path = '' as $$
  with marked as (
    update private.admin_lockouts set reported_at = now()
     where reported_at is null and cleared_at is null
    returning user_id, failures, locked_at
  )
  select s.organization_id, m.failures, m.locked_at
    from marked m left join public.staff s on s.user_id = m.user_id
$$;

revoke all on function public.lock_guessed_admins(integer, uuid) from public, anon, authenticated;
revoke all on function public.admin_locked(uuid) from public, anon, authenticated;
revoke all on function public.admin_lockouts_to_report() from public, anon, authenticated;
revoke all on function public.my_admin_lockout() from public, anon;
grant execute on function public.lock_guessed_admins(integer, uuid) to service_role;
grant execute on function public.admin_locked(uuid) to service_role;
grant execute on function public.admin_lockouts_to_report() to service_role;
grant execute on function public.my_admin_lockout() to authenticated;

select cron.schedule('lock-guessed-admins', '*/5 * * * *', $job$ select public.lock_guessed_admins() $job$);
