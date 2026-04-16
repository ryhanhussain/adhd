import { getEntriesForDateRange, type Entry } from "./db";
import { getCategoryStyle, type Category } from "./categories";

export interface WeeklyMetrics {
  totalMinutes: number;
  prevWeekMinutes: number;
  daysLogged: number;
  topCategory: { name: string; color: string; minutes: number } | null;
  mostActiveDay: { name: string; minutes: number } | null;
  dailyBreakdown: { day: string; minutes: number }[];
  categoryBreakdown: { name: string; color: string; minutes: number }[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getWeekRange(weeksAgo: number): [string, string] {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun
  const mondayOffset = utcDay === 0 ? -6 : 1 - utcDay;

  const mondayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset - weeksAgo * 7);
  const sundayMs = mondayMs + 6 * 86400000;

  const fmt = (ms: number) => new Date(ms).toISOString().split("T")[0];
  return [fmt(mondayMs), fmt(sundayMs)];
}

function getEntryDuration(e: Entry): number {
  const start = e.startTime || e.timestamp;
  if (!start || isNaN(start)) return 0;
  const end = e.endTime === 0 ? Date.now() : (e.endTime || e.timestamp);
  if (!end || isNaN(end)) return 0;
  const mins = Math.round((end - start) / 60000);
  return isNaN(mins) ? 0 : Math.max(0, mins);
}

export async function getWeeklyMetrics(categories: Category[]): Promise<WeeklyMetrics> {
  const [thisStart, thisEnd] = getWeekRange(0);
  const [prevStart, prevEnd] = getWeekRange(1);

  const [thisWeek, prevWeek] = await Promise.all([
    getEntriesForDateRange(thisStart, thisEnd),
    getEntriesForDateRange(prevStart, prevEnd),
  ]);

  console.log("[WeeklyMetrics] range:", thisStart, "to", thisEnd, "| entries:", thisWeek.length);
  for (const e of thisWeek) {
    const dur = getEntryDuration(e);
    console.log(`  [Entry] date=${e.date} text="${e.text.slice(0, 40)}" start=${e.startTime} end=${e.endTime} dur=${dur}m`);
  }

  let totalMinutes = 0;
  for (const e of thisWeek) totalMinutes += getEntryDuration(e);

  let prevWeekMinutes = 0;
  for (const e of prevWeek) prevWeekMinutes += getEntryDuration(e);

  // Days logged this week
  const daysSet = new Set<string>();
  for (const e of thisWeek) daysSet.add(e.date);
  const daysLogged = daysSet.size;

  // Category breakdown
  const catMinutes: Record<string, number> = {};
  for (const e of thisWeek) {
    const mins = getEntryDuration(e);
    if (mins > 0) {
      const tag = e.tags[0] || "Other";
      catMinutes[tag] = (catMinutes[tag] || 0) + mins;
    }
  }
  const categoryBreakdown = Object.entries(catMinutes)
    .sort((a, b) => b[1] - a[1])
    .map(([name, minutes]) => ({
      name,
      color: getCategoryStyle(name, categories).color,
      minutes,
    }));

  const topCategory = categoryBreakdown[0] || null;

  // Daily breakdown + most active day
  const dailyMinutes: Record<string, number> = {};
  for (const e of thisWeek) {
    const mins = getEntryDuration(e);
    if (mins > 0) {
      dailyMinutes[e.date] = (dailyMinutes[e.date] || 0) + mins;
    }
  }

  // Build full 7-day breakdown (Mon-Sun)
  const dailyBreakdown: { day: string; minutes: number }[] = [];
  const mondayMs = new Date(thisStart + "T00:00:00Z").getTime();
  for (let i = 0; i < 7; i++) {
    const dayMs = mondayMs + i * 86400000;
    const ds = new Date(dayMs).toISOString().split("T")[0];
    const dayOfWeek = new Date(dayMs).getUTCDay();
    dailyBreakdown.push({ day: DAY_NAMES[dayOfWeek], minutes: dailyMinutes[ds] || 0 });
  }

  let mostActiveDay: { name: string; minutes: number } | null = null;
  for (const db of dailyBreakdown) {
    if (db.minutes > 0 && (!mostActiveDay || db.minutes > mostActiveDay.minutes)) {
      mostActiveDay = { name: db.day, minutes: db.minutes };
    }
  }

  return { totalMinutes, prevWeekMinutes, daysLogged, topCategory, mostActiveDay, dailyBreakdown, categoryBreakdown };
}
