-- ADDit — Intentions: saved Focus-mode reason chain
--
-- Run AFTER intentions.sql (or on existing databases before deploying the
-- client that syncs `why_chain`). Existing rows stay valid; new tasks can
-- store the accepted/edited "Why you're here" chain.

alter table public.intentions
  add column if not exists why_chain text;
