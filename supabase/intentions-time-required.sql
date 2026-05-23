-- ADDit — time required metadata for task intentions
-- Run after the base intentions schema on existing Supabase projects.

alter table public.intentions
  add column if not exists time_required text
    check (time_required is null or time_required in ('quick', 'medium', 'long'));
