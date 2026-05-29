-- ADDit — Intentions: hourly Home planning fields
--
-- Run this in the Supabase SQL Editor before deploying the hourly Home. The
-- fields are nullable so existing active intentions remain safely unscheduled
-- and show in the Inbox.

alter table public.intentions
  add column if not exists planned_date text,
  add column if not exists planned_start_minute integer,
  add column if not exists planned_duration_minutes integer;

alter table public.intentions
  drop constraint if exists intentions_planned_start_minute_check,
  add constraint intentions_planned_start_minute_check
    check (planned_start_minute is null or (planned_start_minute >= 0 and planned_start_minute <= 1439));

alter table public.intentions
  drop constraint if exists intentions_planned_duration_minutes_check,
  add constraint intentions_planned_duration_minutes_check
    check (planned_duration_minutes is null or (planned_duration_minutes >= 5 and planned_duration_minutes <= 480));
