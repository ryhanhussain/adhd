-- =============================================================
-- ADDit — Gemini quota: atomic increment + burst guard
-- Run AFTER schema.sql in the Supabase SQL Editor.
-- =============================================================
--
-- Replaces the edge function's read-then-write pattern with a single
-- atomic RPC. Also adds a short burst window so one user can't fire
-- 50 requests in a second and drain their daily quota on a scripted
-- abuse attempt.
--
-- Contract:
--   Returns one row:
--     allowed boolean  -- true if the request may proceed
--     reason  text     -- null | 'burst' | 'cap'  (debugging / 429 messaging)
--     count   int      -- current day's count AFTER the increment (0 if denied)
--
-- The RPC is SECURITY DEFINER and owned by the service role, so the
-- existing RLS posture on gemini_usage (no client-facing policies) is
-- preserved. The client never calls this; only edge functions do, via
-- the service-role Supabase client.

-- 1. Add burst timestamp column if missing.
alter table public.gemini_usage
  add column if not exists last_request_at bigint not null default 0;

-- 2. Atomic increment + cap + burst check.
create or replace function public.increment_and_check_quota(
  p_user_id uuid,
  p_day date,
  p_cap int,
  p_burst_ms int
) returns table (allowed boolean, reason text, count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_row public.gemini_usage%rowtype;
begin
  -- Ensure a row exists for (user, day); no-op if already present.
  insert into public.gemini_usage (user_id, day, count, last_request_at)
  values (p_user_id, p_day, 0, 0)
  on conflict (user_id, day) do nothing;

  -- Lock the row so concurrent requests serialize through here.
  select * into v_row
  from public.gemini_usage
  where user_id = p_user_id and day = p_day
  for update;

  -- Burst guard: reject if the last allowed call was within the burst window.
  if p_burst_ms > 0
     and v_row.last_request_at > 0
     and v_now_ms - v_row.last_request_at < p_burst_ms then
    return query select false, 'burst'::text, v_row.count;
    return;
  end if;

  -- Daily cap.
  if v_row.count >= p_cap then
    return query select false, 'cap'::text, v_row.count;
    return;
  end if;

  -- Admit + stamp.
  update public.gemini_usage
     set count = count + 1,
         last_request_at = v_now_ms
   where user_id = p_user_id and day = p_day;

  return query select true, null::text, v_row.count + 1;
end;
$$;

-- 3. Restrict who can call the RPC. Service role already bypasses this,
--    but belt-and-braces: revoke from anon/authenticated just in case.
revoke all on function public.increment_and_check_quota(uuid, date, int, int) from public;
revoke all on function public.increment_and_check_quota(uuid, date, int, int) from anon;
revoke all on function public.increment_and_check_quota(uuid, date, int, int) from authenticated;
grant execute on function public.increment_and_check_quota(uuid, date, int, int) to service_role;
