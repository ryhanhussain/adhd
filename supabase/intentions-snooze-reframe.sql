-- ADDit — Intentions snooze/reframe fields
-- Run AFTER intentions.sql (or on existing databases before deploying the
-- client that syncs snoozed_until / last_reframed_at).

alter table public.intentions
  add column if not exists snoozed_until text,
  add column if not exists last_reframed_at bigint;
