-- =============================================================
-- ADDit — Profiles migration: add intention-categories sync
-- Run AFTER profiles-categories-sync.sql in the Supabase SQL Editor.
-- =============================================================
--
-- Mirrors the activity-categories LWW pattern: the entire bucket array
-- is stored as JSONB and replaced wholesale using last-write-wins on
-- custom_intention_categories_updated_at (epoch ms).
--
-- Shape of custom_intention_categories:
--   [{ "id": uuid, "name": string, "description": string, "color": hex }, ...]
--   (max 3 entries enforced client-side)

alter table public.profiles
  add column if not exists custom_intention_categories jsonb,
  add column if not exists custom_intention_categories_updated_at bigint not null default 0;
