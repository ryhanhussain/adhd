-- ADDit — Intentions: add Now & Next rolling-block slot
--
-- Run this in the Supabase SQL Editor BEFORE deploying the client that syncs
-- `now_next_rank`. Existing rows stay in the Brain Dump Vault because the
-- column is nullable and defaults to null.

alter table public.intentions
  add column if not exists now_next_rank integer
  check (now_next_rank is null or now_next_rank in (0, 1));
