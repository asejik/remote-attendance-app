-- Rollback of 20261014090000_staff_accounts. Deletes all stored PIN hashes.
drop function if exists public.accept_consent();
drop function if exists public.staff_pin_verify(text, text, text);
drop function if exists public.staff_pin_set(uuid, text);
drop table if exists private.staff_pins;
