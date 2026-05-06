-- =============================================================
-- ADDit — Intentions: add `energy` column (v9)
--
-- Adds optional energy hint inferred at brain-dump time so the
-- backlog can be sliced by energy in the home Energy view. Keep
-- the column nullable; existing rows have no energy and render
-- in the "No energy" pseudo-bucket.
--
-- Run this in the Supabase SQL Editor BEFORE deploying the v9
-- client. Without it the client's upsert will fail with an
-- unknown-column error (or silently drop the field if the row
-- shape is loose).
-- =============================================================

alter table public.intentions
  add column if not exists energy text
  check (energy is null or energy in ('high','medium','low','scattered'));
