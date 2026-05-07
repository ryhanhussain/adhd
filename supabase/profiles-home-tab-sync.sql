-- =============================================================
-- ADDit — Profiles migration: add home-tab sync
-- Run AFTER profiles-intention-categories-sync.sql in the Supabase SQL Editor.
-- =============================================================
--
-- Persists the user's selected home-page tab ("life" or "energy") so the
-- choice follows them across devices. Same LWW pattern as the other
-- single-row profile fields: replace wholesale on home_tab_updated_at.

alter table public.profiles
  add column if not exists home_tab text,
  add column if not exists home_tab_updated_at bigint not null default 0;
