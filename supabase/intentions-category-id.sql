-- =============================================================
-- ADDit — Add category_id to intentions table
-- Run in the Supabase SQL Editor AFTER intentions.sql
-- =============================================================

-- Adds the bucket/category assignment column. Existing rows default to NULL
-- (uncategorized), which is the correct fallback behavior in the client.
ALTER TABLE public.intentions ADD COLUMN IF NOT EXISTS category_id text;
