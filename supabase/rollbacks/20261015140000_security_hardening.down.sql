-- Rollback for 20261015140000_security_hardening.sql (run by hand on dev).
begin;
revoke select on public.organizations from authenticated;
grant select on public.organizations to authenticated;
create extension if not exists pg_graphql with schema graphql;
commit;
