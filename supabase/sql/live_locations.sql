-- supabase/sql/live_locations.sql
-- Live location storage + RLS policies for Ride Rescue.

create table if not exists public.live_locations (
  user_id uuid primary key
    references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed double precision,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.live_locations is
  'One row per user/device broadcasting real-time coordinates for Ride Rescue tracking.';

create or replace function public.set_live_location_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_live_locations_updated_at on public.live_locations;
create trigger trg_live_locations_updated_at
before update on public.live_locations
for each row
execute function public.set_live_location_updated_at();

alter table public.live_locations enable row level security;

-- Users (or service role) may upsert only their record.
drop policy if exists "live_locations_insert_self" on public.live_locations;
create policy "live_locations_insert_self"
on public.live_locations
for insert
with check (
  auth.uid() = user_id
  or auth.role() = 'service_role'
);

drop policy if exists "live_locations_update_self" on public.live_locations;
create policy "live_locations_update_self"
on public.live_locations
for update
using (
  auth.uid() = user_id
  or auth.role() = 'service_role'
)
with check (
  auth.uid() = user_id
  or auth.role() = 'service_role'
);

-- Read policy for broadcasters/service role.
drop policy if exists "live_locations_select_self_or_service" on public.live_locations;
create policy "live_locations_select_self_or_service"
on public.live_locations
for select
using (
  auth.uid() = user_id
  or auth.role() = 'service_role'
);

-- View that exposes only the real-time coordinates to authenticated clients.
create or replace view public.live_locations_public as
select
  user_id,
  lat,
  lng,
  heading,
  speed,
  updated_at
from public.live_locations;

comment on view public.live_locations_public is
  'Limited columns exposed to authenticated users for device-to-device tracking.';

-- Allow authenticated users to read sanitized coordinates (e.g., to follow a mechanic).
drop policy if exists "live_locations_public_read" on public.live_locations;
create policy "live_locations_public_read"
on public.live_locations
for select
using (
  auth.role() = 'authenticated'
);

grant select on public.live_locations_public to authenticated;

-- Example of using signed params instead of the simplified view:
--   select * from public.live_locations
--   where user_id = request.jwt()->>'target'; -- request.jwt() is exposed by PostgREST.
