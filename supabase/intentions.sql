-- =============================================================
-- ADDit — Intentions sync schema
-- Run AFTER schema.sql and rls.sql in the Supabase SQL Editor.
-- =============================================================

-- -----------------------------------------------------------
-- INTENTIONS TABLE
-- Mirrors the client-side `Intention` model plus sync metadata.
-- Timestamps are stored as bigint (epoch ms) to match the
-- client's IndexedDB representation exactly — no tz conversion
-- drift between devices.
-- Soft-delete via `deleted` so other devices can mirror removals.
-- -----------------------------------------------------------
create table if not exists public.intentions (
  id            uuid        primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  text          text        not null,
  log_date      text        not null,  -- YYYY-MM-DD (local tz, client-owned)
  completed     boolean     not null default false,
  completed_at  bigint,
  entry_id      text,
  order_index   integer     not null default 0,
  archived      boolean     not null default false,
  deleted       boolean     not null default false,
  created_at    bigint      not null,
  updated_at    bigint      not null
);

-- Pull-since-timestamp is the hot path; index it per-user.
create index if not exists intentions_user_updated_idx
  on public.intentions (user_id, updated_at);

create index if not exists intentions_user_date_idx
  on public.intentions (user_id, log_date);

-- -----------------------------------------------------------
-- RLS — owner-scoped CRUD, same pattern as the `logs` table
-- -----------------------------------------------------------
alter table public.intentions enable row level security;

drop policy if exists "select own intentions" on public.intentions;
create policy "select own intentions"
  on public.intentions for select
  using (auth.uid() = user_id);

drop policy if exists "insert own intentions" on public.intentions;
create policy "insert own intentions"
  on public.intentions for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own intentions" on public.intentions;
create policy "update own intentions"
  on public.intentions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy by design: removals are soft-deletes via
-- `deleted = true`, so every device can observe and converge.

-- -----------------------------------------------------------
-- Server-authoritative updated_at
--
-- Client clocks can drift by seconds-to-minutes, which breaks naive LWW:
-- device B with a slow clock could overwrite device A's newer edit because
-- B's `updated_at` ended up lower. Overriding `updated_at` to server-now()
-- on every insert/update gives us a monotonic ordering that all devices
-- agree on, and the client's subsequent pull reconciles local state.
-- -----------------------------------------------------------
create or replace function public.stamp_intention_updated_at()
returns trigger as $$
begin
  new.updated_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  -- Preserve client-supplied created_at on insert, but fall back to server
  -- time if the client omitted it (defensive — the column is NOT NULL).
  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := new.updated_at;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists stamp_intentions_updated_at on public.intentions;
create trigger stamp_intentions_updated_at
  before insert or update on public.intentions
  for each row execute function public.stamp_intention_updated_at();
