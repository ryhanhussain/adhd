import { getEntriesSince } from "./db";

export interface GardenData {
  /** Map of YYYY-MM-DD → entry count for that day */
  dayCounts: Map<string, number>;
  totalDays: number;
}

/** How far back the garden cares about. 400 days covers a full year plus
 *  enough slack for the expanded view (12 weeks ≈ 84 days) and leaves room
 *  for users with year-plus streaks to still see their longest-streak context. */
const WINDOW_DAYS = 400;

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getGardenData(): Promise<GardenData> {
  const since = daysAgoStr(WINDOW_DAYS);
  const entries = await getEntriesSince(since);
  const dayCounts = new Map<string, number>();

  for (const entry of entries) {
    const count = dayCounts.get(entry.date) || 0;
    dayCounts.set(entry.date, count + 1);
  }

  return { dayCounts, totalDays: dayCounts.size };
}

/**
 * Get the last N weeks of dates for the garden grid.
 * Returns an array of date strings (YYYY-MM-DD), starting from the Monday
 * of (weeksBack) weeks ago, through today (padded to fill full weeks).
 */
export function getGardenDates(weeksBack: number = 4): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the Monday of weeksBack weeks ago
  const day = today.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const startMonday = new Date(today);
  startMonday.setDate(today.getDate() + mondayOffset - (weeksBack - 1) * 7);

  const dates: string[] = [];
  const cursor = new Date(startMonday);

  while (cursor <= today) {
    dates.push(cursor.toISOString().split("T")[0]);
    cursor.setDate(cursor.getDate() + 1);
  }

  // Pad remaining days of the current week (future days)
  const remaining = 7 - (dates.length % 7);
  if (remaining < 7) {
    for (let i = 0; i < remaining; i++) {
      cursor.setDate(cursor.getDate());
      dates.push(cursor.toISOString().split("T")[0]);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return dates;
}
