-- =============================================================
-- ADDit — Habits sync schema
-- Run AFTER schema.sql and rls.sql in the Supabase SQL Editor.
-- =============================================================
--
-- Mirrors the client-side `Habit` model (lib/db.ts) plus sync metadata.
-- Timestamps are stored as bigint (epoch ms) to match the client's
-- IndexedDB representation exactly. `completions` is stored as jsonb
-- (an array of "YYYY-MM-DD" local-date strings, sorted desc, capped at
-- the client's MAX_HABIT_COMPLETIONS = 60).
--
-- Soft-delete via `deleted` so every device can observe and converge.

create table if not exists public.habits (
  id              uuid        primary key,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  name            text        not null,
  color           text        not null,
  icon            text,
  order_index     integer     not null default 0,
  completions     jsonb       not null default '[]'::jsonb,
  last_untick_at  bigint,
  deleted         boolean     not null default false,
  created_at      bigint      not null,
  updated_at      bigint      not null
);

-- Pull-since-timestamp is the hot path; index it per-user.
create index if not exists habits_user_updated_idx
  on public.habits (user_id, updated_at);

-- -----------------------------------------------------------
-- RLS — owner-scoped CRUD, same pattern as `intentions`
-- -----------------------------------------------------------
alter table public.habits enable row level security;

drop policy if exists "select own habits" on public.habits;
create policy "select own habits"
  on public.habits for select
  using (auth.uid() = user_id);

drop policy if exists "insert own habits" on public.habits;
create policy "insert own habits"
  on public.habits for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own habits" on public.habits;
create policy "update own habits"
  on public.habits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy: removals are soft-deletes via `deleted = true`.

-- -----------------------------------------------------------
-- Server-authoritative updated_at (matches intentions trigger)
-- -----------------------------------------------------------
create or replace function public.stamp_habit_updated_at()
returns trigger as $$
begin
  new.updated_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := new.updated_at;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists stamp_habits_updated_at on public.habits;
create trigger stamp_habits_updated_at
  before insert or update on public.habits
  for each row execute function public.stamp_habit_updated_at();
