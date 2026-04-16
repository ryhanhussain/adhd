-- =============================================================
-- ADDit — Profiles migration: add categories sync timestamp
-- Run AFTER schema.sql in the Supabase SQL Editor.
-- =============================================================

-- The custom_categories column already exists on profiles.
-- This adds a bigint timestamp so the client can do LWW sync:
-- whichever device wrote most recently (highest timestamp) wins.
alter table public.profiles
  add column if not exists custom_categories_updated_at bigint not null default 0;
