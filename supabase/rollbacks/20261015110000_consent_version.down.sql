-- Rollback for 20261015110000_consent_version.sql (run by hand on dev).
begin;
drop function if exists public.accept_consent(integer);
-- accept_consent() as in 20261014090000.
create or replace function public.accept_consent() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  accepted timestamptz;
begin
  update public.staff
     set consent_accepted_at = coalesce(consent_accepted_at, now())
   where id = private.current_staff_id()
  returning consent_accepted_at into accepted;
  if accepted is null then
    raise exception 'no active staff record' using errcode = '42501';
  end if;
  return accepted;
end;
$$;
alter table public.staff drop column if exists consent_version;
commit;
