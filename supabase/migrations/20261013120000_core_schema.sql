-- M2.1 Core schema: organisations, staff, work sites, attendance events, audit log.
-- ADDITIVE. Lives alongside the legacy prototype tables (profiles, sites,
-- attendance_logs), which are untouched and will be retired after M4.
-- Rollback: supabase/rollbacks/20261013120000_core_schema.down.sql

create type public.staff_role as enum ('admin', 'supervisor', 'worker');
create type public.staff_status as enum ('active', 'deactivated');
create type public.event_type as enum ('CLOCK_IN', 'CLOCK_OUT');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.geofence_mode as enum ('flag', 'block');

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Organisations (tenants). Created by the platform owner only.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  timezone text not null default 'Africa/Lagos',
  photo_retention_days integer not null default 60 check (photo_retention_days between 7 and 365),
  site_photo_required boolean not null default true,
  geofence_mode public.geofence_mode not null default 'flag',
  status text not null default 'active' check (status in ('active', 'suspended')),
  seats integer check (seats >= 0),
  price_per_seat_ngn integer check (price_per_seat_ngn >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- People in an organisation. user_id is nullable so crew-mode workers can exist
-- without a login of their own.
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  staff_code text not null check (staff_code ~ '^[A-Za-z0-9-]{2,20}$'),
  role public.staff_role not null default 'worker',
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{7,20}$'),
  reference_photo_path text,
  consent_accepted_at timestamptz,
  status public.staff_status not null default 'active',
  deactivated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, staff_code),
  unique (organization_id, id) -- target for same-organisation composite foreign keys
);

-- Work sites with a geofence. Named work_sites because the legacy `sites` table
-- still serves the prototype.
create table public.work_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(trim(name)) between 2 and 120),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 200 check (radius_m between 20 and 5000),
  address text check (address is null or length(address) <= 300),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

-- Clock-in/out evidence. The id is generated on the device so retried uploads
-- are idempotent. Rows are never updated by clients (review goes through
-- review_event()) and never deleted except by the retention job.
create table public.attendance_events (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  staff_id uuid not null,
  captured_by uuid not null default auth.uid() references auth.users (id),
  site_id uuid,
  site_name_snapshot text,
  type public.event_type not null,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy_m real check (accuracy_m >= 0),
  distance_m real,
  within_radius boolean,
  flags text[] not null default '{}',
  face_photo_path text,
  site_photo_path text,
  photos_deleted_at timestamptz,
  liveness_passed boolean not null default true,
  device_info jsonb not null default '{}' check (pg_column_size(device_info) <= 4096),
  review_status public.review_status not null default 'pending',
  review_note text check (review_note is null or length(review_note) <= 500),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, staff_id) references public.staff (organization_id, id),
  foreign key (organization_id, site_id) references public.work_sites (organization_id, id)
);

create index attendance_events_org_captured_idx on public.attendance_events (organization_id, captured_at desc);
create index attendance_events_staff_captured_idx on public.attendance_events (staff_id, captured_at desc);
create index attendance_events_org_review_idx on public.attendance_events (organization_id, review_status);
create index attendance_events_site_idx on public.attendance_events (site_id);
create index staff_org_idx on public.staff (organization_id);
create index work_sites_org_idx on public.work_sites (organization_id);

-- Append-only record of admin actions.
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid,
  details jsonb not null default '{}',
  at timestamptz not null default now()
);
create index audit_log_org_at_idx on public.audit_log (organization_id, at desc);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();
create trigger work_sites_updated_at before update on public.work_sites
  for each row execute function public.set_updated_at();
create trigger attendance_events_updated_at before update on public.attendance_events
  for each row execute function public.set_updated_at();
