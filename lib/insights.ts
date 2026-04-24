import { getEntriesForDateRange, toLocalDateStr } from "./db";
import { getCategoryStyle, type Category } from "./categories";
import { getEntryDuration } from "./analysis";

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
  const day = now.getDay(); // 0=Sun, local
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset - weeksAgo * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [toLocalDateStr(monday), toLocalDateStr(sunday)];
}

export async function getWeeklyMetrics(categories: Category[]): Promise<WeeklyMetrics> {
  const [thisStart, thisEnd] = getWeekRange(0);
  const [prevStart, prevEnd] = getWeekRange(1);

  const [thisWeek, prevWeek] = await Promise.all([
    getEntriesForDateRange(thisStart, thisEnd),
    getEntriesForDateRange(prevStart, prevEnd),
  ]);

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
  const [y, mo, d] = thisStart.split("-").map(Number);
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(y, mo - 1, d + i);
    const ds = toLocalDateStr(dayDate);
    const dayOfWeek = dayDate.getDay();
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
