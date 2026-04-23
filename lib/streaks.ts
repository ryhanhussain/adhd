import { getEntriesSince, toLocalDateStr } from "./db";

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
  hasLoggedToday: boolean;
}

/** Streak look-back window. 400 days comfortably covers the longest milestone
 *  threshold (365) plus slack. Anything older doesn't affect current-streak
 *  math and isn't worth paying to scan on every page load. */
const WINDOW_DAYS = 400;

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return toLocalDateStr(d);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T12:00:00");
  const db = new Date(b + "T12:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export async function getStreakInfo(): Promise<StreakInfo> {
  const entries = await getEntriesSince(daysAgoStr(WINDOW_DAYS));
  if (entries.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalDays: 0, hasLoggedToday: false };
  }

  // Get unique dates
  const datesSet = new Set<string>();
  for (const e of entries) {
    datesSet.add(e.date);
  }
  const dates = Array.from(datesSet).sort();
  const today = toLocalDateStr(new Date());
  const hasLoggedToday = datesSet.has(today);

  // Calculate current streak with forgiveness (1 grace day)
  let currentStreak = 0;
  let checkDate = today;

  if (!hasLoggedToday) {
    // Check if yesterday was logged
    const yesterday = toLocalDateStr(Date.now() - 86400000);
    if (!datesSet.has(yesterday)) {
      // No entries today or yesterday -- streak is broken
      return { currentStreak: 0, longestStreak: calcLongest(dates), totalDays: dates.length, hasLoggedToday: false };
    }
    checkDate = yesterday;
  }

  // Walk backwards from checkDate
  let graceUsed = false;
  let current = checkDate;

  while (true) {
    if (datesSet.has(current)) {
      currentStreak++;
      const prev = toLocalDateStr(new Date(current + "T12:00:00").getTime() - 86400000);
      current = prev;
    } else if (!graceUsed) {
      // Use grace day - skip this day
      graceUsed = true;
      const prev = toLocalDateStr(new Date(current + "T12:00:00").getTime() - 86400000);
      current = prev;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, calcLongest(dates)),
    totalDays: dates.length,
    hasLoggedToday,
  };
}

const MILESTONE_THRESHOLDS = [7, 14, 30, 60, 100, 200, 365];

export interface MilestoneInfo {
  milestone: number;
  isFirstEntry: boolean;
}

/**
 * Returns a milestone if the current streak just hit one, or if this is the user's first-ever entry.
 * Returns null if no milestone applies.
 */
export function getMilestone(streak: StreakInfo): MilestoneInfo | null {
  // First-ever entry celebration
  if (streak.totalDays === 1 && streak.hasLoggedToday) {
    return { milestone: 1, isFirstEntry: true };
  }

  // Check streak milestones
  for (const threshold of MILESTONE_THRESHOLDS) {
    if (streak.currentStreak === threshold) {
      return { milestone: threshold, isFirstEntry: false };
    }
  }

  return null;
}

function calcLongest(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const gap = daysBetween(sortedDates[i - 1], sortedDates[i]);
    if (gap === 1) {
      current++;
    } else if (gap === 2) {
      // Grace day
      current++;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
  }

  return longest;
}
