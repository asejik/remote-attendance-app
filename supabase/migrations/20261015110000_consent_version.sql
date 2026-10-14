-- P03 fix M9: version the privacy notice so workers accept it again when it changes.
-- ADDITIVE (new column; existing acceptances backfilled as version 1; new RPC overload).
-- Rollback: supabase/rollbacks/20261015110000_consent_version.down.sql

alter table public.staff add column consent_version integer check (consent_version is null or consent_version > 0);
update public.staff set consent_version = 1 where consent_accepted_at is not null and consent_version is null;

-- Older app versions call accept_consent() with no arguments: that is version 1.
create or replace function public.accept_consent() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  accepted timestamptz;
begin
  update public.staff
     set consent_accepted_at = coalesce(consent_accepted_at, now()),
         consent_version = coalesce(consent_version, 1)
   where id = private.current_staff_id()
  returning consent_accepted_at into accepted;
  if accepted is null then
    raise exception 'no active staff record' using errcode = '42501';
  end if;
  return accepted;
end;
$$;

-- The signed-in staff member accepts version p_version of the notice. Each
-- acceptance is written to the audit log; the staff row keeps the latest.
create or replace function public.accept_consent(p_version integer) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  s public.staff;
begin
  if p_version is null or p_version < 1 or p_version > 1000 then
    raise exception 'invalid notice version' using errcode = '22023';
  end if;
  update public.staff
     set consent_accepted_at = now(), consent_version = greatest(coalesce(consent_version, 0), p_version)
   where id = private.current_staff_id()
  returning * into s;
  if s.id is null then
    raise exception 'no active staff record' using errcode = '42501';
  end if;
  insert into public.audit_log (organization_id, actor_user_id, action, target_table, target_id, details)
  values (s.organization_id, auth.uid(), 'accept_consent', 'staff', s.id, jsonb_build_object('version', p_version));
  return s.consent_accepted_at;
end;
$$;
revoke all on function public.accept_consent(integer) from public, anon;
grant execute on function public.accept_consent(integer) to authenticated;
