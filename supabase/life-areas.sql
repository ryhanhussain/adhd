-- ADDit — Values + Life Areas priority layer
--
-- Run before deploying the client that syncs Values / Life Areas.
-- Existing intentions, entries, and habits remain valid because the new
-- references are optional and `value_ids` defaults to an empty array.

alter table public.profiles
  add column if not exists personal_values jsonb,
  add column if not exists personal_values_updated_at bigint not null default 0;

create table if not exists public.life_areas (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) <= 30),
  description text not null default '' check (char_length(description) <= 140),
  color       text not null,
  icon        text not null default 'sparkle',
  value_ids   text[] not null default '{}',
  core_value  text check (
    core_value is null or core_value in (
      'self_direction',
      'achievement',
      'benevolence',
      'security',
      'stimulation',
      'hedonism',
      'power',
      'tradition',
      'conformity',
      'universalism'
    )
  ),
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  deleted     boolean not null default false,
  created_at  bigint not null,
  updated_at  bigint not null
);

alter table public.life_areas
  add column if not exists value_ids text[] not null default '{}';

create index if not exists life_areas_user_updated_idx
  on public.life_areas (user_id, updated_at);

create index if not exists life_areas_user_active_idx
  on public.life_areas (user_id)
  where archived = false and deleted = false;

alter table public.life_areas enable row level security;

drop policy if exists "select own life areas" on public.life_areas;
create policy "select own life areas"
  on public.life_areas for select
  using (auth.uid() = user_id);

drop policy if exists "insert own life areas" on public.life_areas;
create policy "insert own life areas"
  on public.life_areas for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own life areas" on public.life_areas;
create policy "update own life areas"
  on public.life_areas for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.enforce_life_area_active_cap()
returns trigger as $$
declare
  active_count integer;
begin
  if new.archived = false and new.deleted = false then
    select count(*)
      into active_count
      from public.life_areas
     where user_id = new.user_id
       and archived = false
       and deleted = false
       and id <> new.id;

    if active_count >= 5 then
      raise exception 'life area active cap exceeded';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists enforce_life_area_active_cap on public.life_areas;
create trigger enforce_life_area_active_cap
  before insert or update on public.life_areas
  for each row execute function public.enforce_life_area_active_cap();

create or replace function public.stamp_life_area_updated_at()
returns trigger as $$
begin
  new.updated_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := new.updated_at;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists stamp_life_areas_updated_at on public.life_areas;
create trigger stamp_life_areas_updated_at
  before insert or update on public.life_areas
  for each row execute function public.stamp_life_area_updated_at();

alter table public.intentions
  add column if not exists life_area_id uuid references public.life_areas(id),
  add column if not exists priority text
    check (priority is null or priority in ('high', 'medium', 'low')),
  add column if not exists activity_category text,
  add column if not exists why_chain text;

alter table public.entries
  add column if not exists life_area_id uuid references public.life_areas(id);

alter table public.habits
  add column if not exists life_area_id uuid references public.life_areas(id);

create index if not exists intentions_user_life_area_idx
  on public.intentions (user_id, life_area_id);

create index if not exists entries_user_life_area_idx
  on public.entries (user_id, life_area_id);

create index if not exists habits_user_life_area_idx
  on public.habits (user_id, life_area_id);
