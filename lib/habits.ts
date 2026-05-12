/**
 * Pure helpers for the daily habit tracker. No IndexedDB calls — every
 * function takes (habit, today) and returns a value, so they're trivially
 * testable and safe to call from any render path.
 */

import { HABIT_INACTIVITY_LIMIT_DAYS, toLocalDateStr, type Habit } from "./db";

/** Parses "YYYY-MM-DD" into a local-midnight Date. DST-safe (uses Date ctor). */
function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Whole-day difference between two YYYY-MM-DD strings (a - b). Non-negative for a >= b. */
function daysBetween(aStr: string, bStr: string): number {
  const a = parseDateStr(aStr).getTime();
  const b = parseDateStr(bStr).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** Subtracts `n` whole days from a YYYY-MM-DD, returning a new YYYY-MM-DD. */
function shiftDate(dateStr: string, deltaDays: number): string {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateStr(d);
}

/**
 * Current streak in consecutive days, ending today inclusive. If today isn't
 * ticked yet, the streak still counts (starts from yesterday) so the user
 * sees their existing streak throughout the day before they tick.
 *
 *   - completions = ["today", "yesterday", "two-days-ago"] → 3
 *   - completions = ["yesterday", "two-days-ago"]         → 2 (today still open)
 *   - completions = ["two-days-ago"]                       → 0 (yesterday missed)
 *   - completions = []                                     → 0
 */
export function getHabitStreak(habit: Habit, today: string): number {
  const set = new Set(habit.completions);
  if (set.size === 0) return 0;
  // Anchor: if today is in the set, count it; otherwise start from yesterday.
  let cursor = set.has(today) ? today : shiftDate(today, -1);
  let count = 0;
  while (set.has(cursor)) {
    count += 1;
    cursor = shiftDate(cursor, -1);
  }
  return count;
}

/**
 * The "anchor date" for the cleanup rule: the most recent date of activity
 * (a tick OR creation OR an untick). Returned as YYYY-MM-DD.
 *
 * Untick counts as activity so an accidental untick on day 9+ doesn't
 * trigger immediate removal — the user gets the full grace window from the
 * untick action.
 */
export function getHabitAnchorDate(habit: Habit): string {
  const latestCompletion = habit.completions[0]; // sorted desc
  const createdStr = toLocalDateStr(habit.createdAt);
  const untickStr = habit.lastUntickAt ? toLocalDateStr(habit.lastUntickAt) : null;
  const candidates = [latestCompletion, createdStr, untickStr].filter(
    (v): v is string => typeof v === "string"
  );
  // Latest YYYY-MM-DD by lexicographic order.
  candidates.sort((a, b) => b.localeCompare(a));
  return candidates[0]!;
}

export function daysSinceLastActivity(habit: Habit, today: string): number {
  return Math.max(0, daysBetween(today, getHabitAnchorDate(habit)));
}

/**
 * The 10-day rule: silently remove habits that have gone more than
 * HABIT_INACTIVITY_LIMIT_DAYS without activity. Brand-new habits (created
 * today) survive the full window from their creation date.
 */
export function shouldAutoRemove(habit: Habit, today: string): boolean {
  return daysSinceLastActivity(habit, today) > HABIT_INACTIVITY_LIMIT_DAYS;
}

/** Whether today is already ticked for this habit. */
export function isTickedToday(habit: Habit, today: string): boolean {
  return habit.completions.includes(today);
}
