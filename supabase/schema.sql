-- =============================================================
-- ADDit — Supabase Database Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------
-- PROFILES TABLE
-- Auto-created for each new user via trigger.
-- Stores preferences and the encrypted Gemini API key.
-- -----------------------------------------------------------
create table public.profiles (
  id                      uuid        primary key references auth.users(id) on delete cascade,
  display_name            text,
  theme                   text        default 'system'
                                      check (theme in ('light', 'dark', 'system')),
  custom_categories       jsonb       default '[]'::jsonb,
  gemini_api_key_encrypted text,      -- base64 JSON { iv, ct } blob (AES-GCM-256)
  created_at              timestamptz default now() not null,
  updated_at              timestamptz default now() not null
);

-- -----------------------------------------------------------
-- LOGS TABLE
-- Stores interstitial journal entries / time-tracking logs.
-- -----------------------------------------------------------
create table public.logs (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  task_name         text        not null,
  duration_minutes  integer     not null default 0,
  category          text        not null default 'Other',
  energy_level      text        check (energy_level in ('high', 'medium', 'low', 'scattered')),
  tags              text[]      default '{}',
  summary           text,
  raw_text          text,
  start_time        timestamptz,
  end_time          timestamptz,
  log_date          date        not null default current_date,
  created_at        timestamptz default now() not null
);

-- Indexes
create index logs_user_id_idx   on public.logs (user_id);
create index logs_user_date_idx on public.logs (user_id, log_date);

-- -----------------------------------------------------------
-- GEMINI USAGE TABLE
-- Tracks per-user daily API call counts. Written only by server-side routes
-- using the service role; no direct client access (see rls.sql).
-- -----------------------------------------------------------
create table if not exists public.gemini_usage (
  user_id uuid references auth.users on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

-- -----------------------------------------------------------
-- TRIGGERS
-- -----------------------------------------------------------

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update the updated_at column on profiles
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();
