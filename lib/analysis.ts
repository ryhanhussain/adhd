import {
  getEntriesSince,
  getIntentionsForDateRange,
  getReflectionsForDateRange,
  toLocalDateStr,
  type Entry,
  type EnergyLevel,
  type Intention,
} from "./db";
import { getCategoryStyle, type Category } from "./categories";
import { openDB } from "idb";

export type PeriodWindow = 7 | 30 | 90 | 400;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface CategoryBreakdownRow {
  name: string;
  color: string;
  minutes: number;
  deltaPct: number | null;
}

export interface IntentionStats {
  created: number;
  completed: number;
  completionRate: number;
  byCategory: {
    bucketId: string | null;
    bucketName: string;
    completed: number;
    total: number;
  }[];
}

export interface MoodStats {
  avgMood: number | null;
  count: number;
  moodByDominantCategory: {
    name: string;
    avgMood: number;
    days: number;
  }[];
}

export interface PeriodMetrics {
  windowDays: PeriodWindow;
  startDate: string;
  endDate: string;
  totalMinutes: number;
  prevPeriodMinutes: number;
  daysLogged: number;
  longestStreakInWindow: number;
  categoryBreakdown: CategoryBreakdownRow[];
  growers: { name: string; deltaPct: number }[];
  shrinkers: { name: string; deltaPct: number }[];
  energyCounts: { high: number; medium: number; low: number; scattered: number };
  intentionStats: IntentionStats;
  moodStats: MoodStats;
  byDayOfWeek: { day: string; minutes: number; entries: number }[];
  byHourOfDay: { hour: number; minutes: number }[];
  mostProductiveDayOfWeek: string | null;
  mostProductiveHourWindow: string | null;
  topActivities: { summary: string; minutes: number; count: number }[];
  /** 7×24 matrix: byDayAndHour[dayOfWeek 0=Sun..6=Sat][hour 0–23] → total minutes */
  byDayAndHour: number[][];
}

export function getEntryDuration(e: Entry): number {
  const start = e.startTime || e.timestamp;
  if (!start || isNaN(start)) return 0;
  const end = e.endTime === 0 ? Date.now() : (e.endTime || e.timestamp);
  if (!end || isNaN(end)) return 0;
  const mins = Math.round((end - start) / 60000);
  return isNaN(mins) ? 0 : Math.max(0, mins);
}

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

function calcLongestStreak(sortedDates: string[]): number {
  if (sortedDates.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const gap = daysBetween(sortedDates[i - 1], sortedDates[i]);
    if (gap === 1 || gap === 2) current++;
    else current = 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function getTopCategoryName(entries: Entry[]): string | null {
  const sums: Record<string, number> = {};
  for (const e of entries) {
    const mins = getEntryDuration(e);
    if (mins <= 0) continue;
    const tag = e.tags[0] || "Other";
    sums[tag] = (sums[tag] || 0) + mins;
  }
  let best: string | null = null;
  let bestMins = 0;
  for (const [name, mins] of Object.entries(sums)) {
    if (mins > bestMins) {
      bestMins = mins;
      best = name;
    }
  }
  return best;
}

export async function getPeriodMetrics(
  windowDays: PeriodWindow,
  categories: Category[]
): Promise<PeriodMetrics> {
  const endDateObj = new Date();
  endDateObj.setHours(0, 0, 0, 0);
  const endDate = toLocalDateStr(endDateObj);
  const startDate = daysAgoStr(windowDays - 1);
  const prevStart = daysAgoStr(windowDays * 2 - 1);
  const prevEnd = daysAgoStr(windowDays);

  const [allEntries, intentions, reflections] = await Promise.all([
    getEntriesSince(prevStart),
    getIntentionsForDateRange(prevStart, endDate),
    getReflectionsForDateRange(prevStart, endDate),
  ]);

  const current: Entry[] = [];
  const prior: Entry[] = [];
  for (const e of allEntries) {
    if (e.date >= startDate && e.date <= endDate) current.push(e);
    else if (e.date >= prevStart && e.date <= prevEnd) prior.push(e);
  }

  let totalMinutes = 0;
  for (const e of current) totalMinutes += getEntryDuration(e);
  let prevPeriodMinutes = 0;
  for (const e of prior) prevPeriodMinutes += getEntryDuration(e);

  const datesSet = new Set<string>();
  for (const e of current) datesSet.add(e.date);
  const sortedDates = Array.from(datesSet).sort();
  const daysLogged = sortedDates.length;
  const longestStreakInWindow = calcLongestStreak(sortedDates);

  // Category breakdown + deltas
  const currCatMins: Record<string, number> = {};
  for (const e of current) {
    const mins = getEntryDuration(e);
    if (mins <= 0) continue;
    const tag = e.tags[0] || "Other";
    currCatMins[tag] = (currCatMins[tag] || 0) + mins;
  }
  const priorCatMins: Record<string, number> = {};
  for (const e of prior) {
    const mins = getEntryDuration(e);
    if (mins <= 0) continue;
    const tag = e.tags[0] || "Other";
    priorCatMins[tag] = (priorCatMins[tag] || 0) + mins;
  }

  const categoryBreakdown: CategoryBreakdownRow[] = Object.entries(currCatMins)
    .sort((a, b) => b[1] - a[1])
    .map(([name, minutes]) => {
      const prev = priorCatMins[name] ?? 0;
      const deltaPct =
        prev > 0 ? Math.round(((minutes - prev) / prev) * 100) : null;
      return {
        name,
        color: getCategoryStyle(name, categories).color,
        minutes,
        deltaPct,
      };
    });

  const growers = categoryBreakdown
    .filter((r) => r.deltaPct !== null && r.deltaPct > 0)
    .sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0))
    .slice(0, 3)
    .map((r) => ({ name: r.name, deltaPct: r.deltaPct as number }));

  const shrinkers = categoryBreakdown
    .filter((r) => r.deltaPct !== null && r.deltaPct < 0)
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))
    .slice(0, 3)
    .map((r) => ({ name: r.name, deltaPct: r.deltaPct as number }));

  // Energy counts
  const energyCounts = { high: 0, medium: 0, low: 0, scattered: 0 };
  for (const e of current) {
    if (e.energy) energyCounts[e.energy as EnergyLevel]++;
  }

  // Intentions (current period only)
  const currIntentions: Intention[] = intentions.filter(
    (i) => i.date >= startDate && i.date <= endDate
  );
  const created = currIntentions.length;
  const completed = currIntentions.filter((i) => i.completed).length;
  const completionRate = created > 0 ? completed / created : 0;

  const bucketBuckets = new Map<
    string,
    { bucketId: string | null; bucketName: string; completed: number; total: number }
  >();
  // Bucket name lookup from customIntentionCategories requires a Settings read,
  // which the caller doesn't provide. For now bucket name = bucketId or "Uncategorized".
  // The /analysis page can resolve names at render time via useIntentionCategories.
  for (const i of currIntentions) {
    const key = i.categoryId ?? "__uncategorized__";
    const existing = bucketBuckets.get(key);
    if (existing) {
      existing.total++;
      if (i.completed) existing.completed++;
    } else {
      bucketBuckets.set(key, {
        bucketId: i.categoryId ?? null,
        bucketName: i.categoryId ?? "Uncategorized",
        completed: i.completed ? 1 : 0,
        total: 1,
      });
    }
  }
  const intentionStats: IntentionStats = {
    created,
    completed,
    completionRate,
    byCategory: Array.from(bucketBuckets.values()).sort((a, b) => b.total - a.total),
  };

  // Mood stats (current period only)
  const currReflections = reflections.filter(
    (r) => r.date >= startDate && r.date <= endDate
  );
  let moodSum = 0;
  for (const r of currReflections) moodSum += r.mood;
  const avgMood =
    currReflections.length >= 3
      ? moodSum / currReflections.length
      : null;

  // Dominant category per day → mood correlation
  const entriesByDate = new Map<string, Entry[]>();
  for (const e of current) {
    const list = entriesByDate.get(e.date) || [];
    list.push(e);
    entriesByDate.set(e.date, list);
  }
  const moodByCat: Record<string, { sum: number; count: number }> = {};
  for (const r of currReflections) {
    const dayEntries = entriesByDate.get(r.date);
    if (!dayEntries) continue;
    const topCat = getTopCategoryName(dayEntries);
    if (!topCat) continue;
    const bucket = moodByCat[topCat] || { sum: 0, count: 0 };
    bucket.sum += r.mood;
    bucket.count++;
    moodByCat[topCat] = bucket;
  }
  const moodByDominantCategory = Object.entries(moodByCat)
    .map(([name, { sum, count }]) => ({ name, avgMood: sum / count, days: count }))
    .filter((r) => r.days >= 2)
    .sort((a, b) => b.avgMood - a.avgMood);

  const moodStats: MoodStats = {
    avgMood,
    count: currReflections.length,
    moodByDominantCategory,
  };

  // By day-of-week + hour-of-day + combined heatmap
  const dayOfWeekMins: number[] = [0, 0, 0, 0, 0, 0, 0];
  const dayOfWeekEntries: number[] = [0, 0, 0, 0, 0, 0, 0];
  const hourOfDayMins: number[] = new Array(24).fill(0);
  const byDayAndHour: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const e of current) {
    const mins = getEntryDuration(e);
    if (mins <= 0) continue;
    const ts = e.startTime || e.timestamp;
    const d = new Date(ts);
    const dow = d.getDay();
    dayOfWeekMins[dow] += mins;
    dayOfWeekEntries[dow]++;
    const hour = d.getHours();
    hourOfDayMins[hour] += mins;
    byDayAndHour[dow][hour] += mins;
  }
  const byDayOfWeek = DAY_NAMES.map((day, i) => ({
    day,
    minutes: dayOfWeekMins[i],
    entries: dayOfWeekEntries[i],
  }));
  const byHourOfDay = hourOfDayMins.map((minutes, hour) => ({ hour, minutes }));

  let mostProductiveDayOfWeek: string | null = null;
  let maxDowMins = 0;
  for (const d of byDayOfWeek) {
    if (d.minutes > maxDowMins) {
      maxDowMins = d.minutes;
      mostProductiveDayOfWeek = d.day;
    }
  }

  let mostProductiveHourWindow: string | null = null;
  let bestWindowSum = 0;
  let bestWindowStart = -1;
  for (let h = 5; h <= 21; h++) {
    const sum = hourOfDayMins[h] + hourOfDayMins[h + 1];
    if (sum > bestWindowSum) {
      bestWindowSum = sum;
      bestWindowStart = h;
    }
  }
  if (bestWindowStart >= 0 && bestWindowSum > 0) {
    const fmt = (h: number) => {
      const suffix = h >= 12 ? "pm" : "am";
      const hr = h % 12 || 12;
      return `${hr}${suffix}`;
    };
    mostProductiveHourWindow = `${fmt(bestWindowStart)}–${fmt(bestWindowStart + 2)}`;
  }

  // Top activities by total minutes, keyed by summary
  const summaryMap = new Map<string, { minutes: number; count: number }>();
  for (const e of current) {
    const key = (e.summary || "").trim();
    if (!key) continue;
    const mins = getEntryDuration(e);
    const existing = summaryMap.get(key);
    if (existing) {
      existing.minutes += mins;
      existing.count++;
    } else {
      summaryMap.set(key, { minutes: mins, count: 1 });
    }
  }
  const topActivities = Array.from(summaryMap.entries())
    .map(([summary, { minutes, count }]) => ({ summary, minutes, count }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  return {
    windowDays,
    startDate,
    endDate,
    totalMinutes,
    prevPeriodMinutes,
    daysLogged,
    longestStreakInWindow,
    categoryBreakdown,
    growers,
    shrinkers,
    energyCounts,
    intentionStats,
    moodStats,
    byDayOfWeek,
    byHourOfDay,
    byDayAndHour,
    mostProductiveDayOfWeek,
    mostProductiveHourWindow,
    topActivities,
  };
}

// ---------------------------------------------------------------------------
// AI summary cache — stored as JSON string in the existing `settings` store
// under key `aiAnalysisCache`. No IDB version bump required.
// ---------------------------------------------------------------------------

export interface AIPeriodSummary {
  summary: string;
  generatedAt: number;
  windowDays: PeriodWindow;
  startDate: string;
  endDate: string;
}

type Cache = Partial<Record<PeriodWindow, AIPeriodSummary>>;

async function readCache(): Promise<Cache> {
  const db = await openDB("addit-db", 8);
  try {
    const raw = (await db.get("settings", "aiAnalysisCache")) as string | undefined;
    if (!raw) return {};
    return JSON.parse(raw) as Cache;
  } catch {
    return {};
  } finally {
    db.close();
  }
}

async function writeCache(cache: Cache): Promise<void> {
  const db = await openDB("addit-db", 8);
  try {
    await db.put("settings", JSON.stringify(cache), "aiAnalysisCache");
  } finally {
    db.close();
  }
}

export async function getCachedAIAnalysis(
  windowDays: PeriodWindow
): Promise<AIPeriodSummary | null> {
  const cache = await readCache();
  return cache[windowDays] ?? null;
}

export async function setCachedAIAnalysis(a: AIPeriodSummary): Promise<void> {
  const cache = await readCache();
  cache[a.windowDays] = a;
  await writeCache(cache);
}

export function getTopCategoryForEntries(
  entries: Entry[],
  categories: Category[]
): { name: string; color: string } | null {
  const name = getTopCategoryName(entries);
  if (!name) return null;
  return { name, color: getCategoryStyle(name, categories).color };
}
