-- =============================================================
-- ADDit — Entries + Reflections sync schema
-- Run AFTER schema.sql and rls.sql in the Supabase SQL Editor.
-- =============================================================

-- Drop the legacy logs table — never used by the app; schema
-- uses timestamptz instead of bigint epoch ms which is
-- incompatible with the sync pattern used here.
drop table if exists public.logs cascade;

-- -----------------------------------------------------------
-- ENTRIES TABLE
-- Mirrors the client-side `Entry` model plus sync metadata.
-- Timestamps are stored as bigint (epoch ms) to match the
-- client's IndexedDB representation exactly.
-- Soft-delete via `deleted` so other devices can mirror removals.
-- -----------------------------------------------------------
create table if not exists public.entries (
  id          uuid    primary key,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  text        text    not null,
  timestamp   bigint  not null,
  start_time  bigint  not null,
  end_time    bigint  not null,         -- 0 = timer running (sentinel, kept from client)
  log_date    text    not null,         -- YYYY-MM-DD, client-owned local tz
  location    jsonb,                    -- {lat, lng} or null
  tags        text[]  not null default '{}',
  energy      text    check (energy in ('high', 'medium', 'low', 'scattered')),
  summary     text,
  deleted     boolean not null default false,
  created_at  bigint  not null,
  updated_at  bigint  not null
);

-- Pull-since-timestamp is the hot path; index it per-user.
create index if not exists entries_user_updated_idx on public.entries (user_id, updated_at);
create index if not exists entries_user_date_idx    on public.entries (user_id, log_date);

-- -----------------------------------------------------------
-- RLS for entries — owner-only select/insert/update (no delete)
-- -----------------------------------------------------------
alter table public.entries enable row level security;

drop policy if exists "select own entries" on public.entries;
create policy "select own entries"
  on public.entries for select
  using (auth.uid() = user_id);

drop policy if exists "insert own entries" on public.entries;
create policy "insert own entries"
  on public.entries for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own entries" on public.entries;
create policy "update own entries"
  on public.entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: removals are soft-deletes via `deleted = true`
-- so every device can observe the tombstone and converge.

-- -----------------------------------------------------------
-- Server-authoritative updated_at for entries
--
-- Client clocks can drift, which breaks naive LWW. Overriding
-- updated_at to server-now() on every insert/update gives a
-- monotonic ordering all devices agree on.
-- -----------------------------------------------------------
create or replace function public.stamp_entry_updated_at()
returns trigger as $$
begin
  new.updated_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := new.updated_at;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists stamp_entries_updated_at on public.entries;
create trigger stamp_entries_updated_at
  before insert or update on public.entries
  for each row execute function public.stamp_entry_updated_at();

-- -----------------------------------------------------------
-- REFLECTIONS TABLE
-- Composite PK (user_id, log_date) enforces one-per-day per
-- user, matching the client's IndexedDB constraint.
-- -----------------------------------------------------------
create table if not exists public.reflections (
  user_id     uuid    not null references auth.users(id) on delete cascade,
  log_date    text    not null,         -- YYYY-MM-DD
  mood        int     not null check (mood between 1 and 5),
  note        text    not null default '',
  summary     text    not null default '',
  deleted     boolean not null default false,
  created_at  bigint  not null,
  updated_at  bigint  not null,
  primary key (user_id, log_date)
);

create index if not exists reflections_user_updated_idx on public.reflections (user_id, updated_at);

-- -----------------------------------------------------------
-- RLS for reflections
-- -----------------------------------------------------------
alter table public.reflections enable row level security;

drop policy if exists "select own reflections" on public.reflections;
create policy "select own reflections"
  on public.reflections for select
  using (auth.uid() = user_id);

drop policy if exists "insert own reflections" on public.reflections;
create policy "insert own reflections"
  on public.reflections for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own reflections" on public.reflections;
create policy "update own reflections"
  on public.reflections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------
-- Server-authoritative updated_at for reflections
-- -----------------------------------------------------------
create or replace function public.stamp_reflection_updated_at()
returns trigger as $$
begin
  new.updated_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := new.updated_at;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists stamp_reflections_updated_at on public.reflections;
create trigger stamp_reflections_updated_at
  before insert or update on public.reflections
  for each row execute function public.stamp_reflection_updated_at();
