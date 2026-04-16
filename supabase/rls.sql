-- =============================================================
-- ADDit — Row Level Security Policies
-- Run this AFTER schema.sql in the Supabase SQL Editor
-- =============================================================

-- Enable RLS on all tables
alter table public.profiles     enable row level security;
alter table public.logs         enable row level security;
alter table public.gemini_usage enable row level security;
-- gemini_usage has NO client-facing policies — only the service role (used by
-- API routes) may read or write it. Authenticated users have no direct access.

-- -----------------------------------------------------------
-- PROFILES — users can only read/update their own row
-- (insert is handled by the on_auth_user_created trigger,
--  but we allow explicit insert too for safety)
-- -----------------------------------------------------------
create policy "select own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- -----------------------------------------------------------
-- LOGS — full CRUD scoped to the owning user
-- -----------------------------------------------------------
create policy "select own logs"
  on public.logs for select
  using (auth.uid() = user_id);

create policy "insert own logs"
  on public.logs for insert
  with check (auth.uid() = user_id);

create policy "update own logs"
  on public.logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own logs"
  on public.logs for delete
  using (auth.uid() = user_id);
