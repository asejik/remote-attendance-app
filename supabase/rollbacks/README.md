# Rollbacks

One `.down.sql` per migration in `../migrations/`, applied **newest first** by hand
(SQL editor or Management API). They live outside `migrations/` so the Supabase CLI
never runs them. After rolling back, delete the matching rows from
`supabase_migrations.schema_migrations` so `supabase db push` can re-apply.
