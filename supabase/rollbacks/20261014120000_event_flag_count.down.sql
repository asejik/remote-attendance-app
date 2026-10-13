-- Rollback of 20261014120000_event_flag_count.
drop index if exists public.attendance_events_review_queue_idx;
alter table public.attendance_events drop column if exists flag_count;
