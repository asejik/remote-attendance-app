-- M5: sortable flag count so the review queue can show flagged events first.
-- ADDITIVE. Generated columns are computed after BEFORE triggers, so this
-- reflects the server-computed flags. Rollback: supabase/rollbacks/20261014120000_event_flag_count.down.sql
alter table public.attendance_events
  add column flag_count integer generated always as (cardinality(flags)) stored;

create index attendance_events_review_queue_idx
  on public.attendance_events (organization_id, review_status, flag_count desc, captured_at desc);
