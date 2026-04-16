import { getAllEntries } from "./db";

export interface GardenData {
  /** Map of YYYY-MM-DD → entry count for that day */
  dayCounts: Map<string, number>;
  totalDays: number;
}

let cachedData: GardenData | null = null;
let cacheValid = false;

if (typeof window !== "undefined") {
  window.addEventListener("entry-updated", () => {
    cacheValid = false;
  });
}

export async function getGardenData(): Promise<GardenData> {
  if (cacheValid && cachedData) return cachedData;

  const entries = await getAllEntries();
  const dayCounts = new Map<string, number>();

  for (const entry of entries) {
    const count = dayCounts.get(entry.date) || 0;
    dayCounts.set(entry.date, count + 1);
  }

  cachedData = { dayCounts, totalDays: dayCounts.size };
  cacheValid = true;
  return cachedData;
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
