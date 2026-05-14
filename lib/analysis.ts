import {
  getActiveHabits,
  getEntriesSince,
  getIntentionsForDateRange,
  getReflectionsForDateRange,
  toLocalDateStr,
  type Entry,
  type EnergyLevel,
  type Habit,
  type Intention,
} from "./db";
import { getCategoryStyle, type Category } from "./categories";
import { getHabitStreak } from "./habits";
import { openDB } from "idb";

export type PeriodWindow = 7 | 30 | 90 | 400;
export type AnalysisHighlightKind = "win" | "rhythm" | "adjustment";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ENERGY_KEYS: EnergyLevel[] = ["high", "medium", "low", "scattered"];

export interface AnalysisHighlight {
  kind: AnalysisHighlightKind;
  title: string;
  body: string;
  metric?: string;
}

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

export interface HabitStats {
  active: number;
  completed: number;
  opportunities: number;
  completionRate: number | null;
  completedToday: number;
  bestStreak: number;
  bestStreakHabitName: string | null;
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
  energyMinutes: { high: number; medium: number; low: number; scattered: number };
  habitStats: HabitStats;
  intentionStats: IntentionStats;
  moodStats: MoodStats;
  dailyBreakdown: { date: string; label: string; minutes: number; entries: number; isToday: boolean }[];
  byDayOfWeek: { day: string; minutes: number; entries: number }[];
  byHourOfDay: { hour: number; minutes: number }[];
  mostProductiveDayOfWeek: string | null;
  mostProductiveHourWindow: string | null;
  topActivities: { summary: string; minutes: number; count: number }[];
  progressHighlights: AnalysisHighlight[];
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

function dateFromStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function shiftDateStr(dateStr: string, deltaDays: number): string {
  const d = dateFromStr(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateStr(d);
}

function eachDateInRange(startDate: string, endDate: string): string[] {
  const days = Math.max(0, daysBetween(startDate, endDate));
  return Array.from({ length: days + 1 }, (_, i) => shiftDateStr(startDate, i));
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
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

function getHabitStats(habits: Habit[], startDate: string, endDate: string): HabitStats {
  let completed = 0;
  let opportunities = 0;
  let completedToday = 0;
  let bestStreak = 0;
  let bestStreakHabitName: string | null = null;

  for (const habit of habits) {
    const createdDate = toLocalDateStr(habit.createdAt);
    const opportunityStart = createdDate > startDate ? createdDate : startDate;
    if (opportunityStart <= endDate) {
      opportunities += daysBetween(opportunityStart, endDate) + 1;
      completed += habit.completions.filter(
        (date) => date >= opportunityStart && date <= endDate
      ).length;
    }
    if (habit.completions.includes(endDate)) completedToday++;

    const streak = getHabitStreak(habit, endDate);
    if (streak > bestStreak) {
      bestStreak = streak;
      bestStreakHabitName = habit.name;
    }
  }

  return {
    active: habits.length,
    completed,
    opportunities,
    completionRate: opportunities > 0 ? completed / opportunities : null,
    completedToday,
    bestStreak,
    bestStreakHabitName,
  };
}

function buildProgressHighlights(metrics: {
  windowDays: PeriodWindow;
  totalMinutes: number;
  prevPeriodMinutes: number;
  daysLogged: number;
  longestStreakInWindow: number;
  categoryBreakdown: CategoryBreakdownRow[];
  energyCounts: PeriodMetrics["energyCounts"];
  energyMinutes: PeriodMetrics["energyMinutes"];
  habitStats: HabitStats;
  intentionStats: IntentionStats;
  moodStats: MoodStats;
  mostProductiveDayOfWeek: string | null;
  mostProductiveHourWindow: string | null;
}): AnalysisHighlight[] {
  const wins: AnalysisHighlight[] = [];
  const rhythms: AnalysisHighlight[] = [];
  const adjustments: AnalysisHighlight[] = [];
  const {
    windowDays,
    totalMinutes,
    prevPeriodMinutes,
    daysLogged,
    longestStreakInWindow,
    categoryBreakdown,
    energyCounts,
    energyMinutes,
    habitStats,
    intentionStats,
    moodStats,
    mostProductiveDayOfWeek,
    mostProductiveHourWindow,
  } = metrics;

  const totalDeltaPct =
    prevPeriodMinutes > 0 ? (totalMinutes - prevPeriodMinutes) / prevPeriodMinutes : null;
  const periodLabel = windowDays === 400 ? "saved history" : `${windowDays} days`;
  const priorLabel = windowDays === 400 ? "the prior saved-history window" : `the prior ${windowDays} days`;
  if (totalDeltaPct != null && totalDeltaPct >= 0.1) {
    wins.push({
      kind: "win",
      title: "More showed up this time",
      body: `You tracked ${formatMinutes(totalMinutes)}, up ${formatPct(totalDeltaPct)} from ${priorLabel}. That is real evidence of momentum.`,
      metric: `+${formatPct(totalDeltaPct)}`,
    });
  }

  if (habitStats.completionRate != null && habitStats.opportunities >= 4 && habitStats.completionRate >= 0.5) {
    wins.push({
      kind: "win",
      title: "Your habits are getting roots",
      body: `You checked off ${habitStats.completed} of ${habitStats.opportunities} habit chances in this window. Quiet repetition counts.`,
      metric: formatPct(habitStats.completionRate),
    });
  }

  if (intentionStats.created > 0 && intentionStats.completionRate >= 0.6) {
    wins.push({
      kind: "win",
      title: "Plans became finished things",
      body: `${intentionStats.completed} of ${intentionStats.created} intentions made it across the line. Your planning is turning into follow-through.`,
      metric: formatPct(intentionStats.completionRate),
    });
  }

  if (daysLogged > 0) {
    wins.push({
      kind: "win",
      title: "You kept a thread through the window",
      body: windowDays === 400
        ? `You logged on ${daysLogged} days across your saved history${longestStreakInWindow > 1 ? `, including a ${longestStreakInWindow}-day run` : ""}. That is enough signal to learn from.`
        : `You logged on ${daysLogged} of ${periodLabel}${longestStreakInWindow > 1 ? `, including a ${longestStreakInWindow}-day run` : ""}. That is enough signal to learn from.`,
      metric: windowDays === 400 ? `${daysLogged} days` : `${daysLogged}/${windowDays}`,
    });
  }

  const topCategory = categoryBreakdown[0] ?? null;
  if (topCategory && totalMinutes > 0) {
    const topShare = topCategory.minutes / totalMinutes;
    if (topShare >= 0.3) {
      rhythms.push({
        kind: "rhythm",
        title: `${topCategory.name} led the shape of this period`,
        body: `${topCategory.name} took ${formatMinutes(topCategory.minutes)}, so this window has a clear center of gravity.`,
        metric: formatPct(topShare),
      });
    }
  }

  if (mostProductiveHourWindow) {
    rhythms.push({
      kind: "rhythm",
      title: "There is a time your work gathers",
      body: `${mostProductiveHourWindow} is where your tracked time clustered most. That can be a good place to protect the demanding stuff.`,
      metric: mostProductiveHourWindow,
    });
  } else if (mostProductiveDayOfWeek) {
    rhythms.push({
      kind: "rhythm",
      title: "One day carried more of the load",
      body: `${mostProductiveDayOfWeek} had the strongest signal in this window. Worth noticing when you plan the next one.`,
      metric: mostProductiveDayOfWeek,
    });
  }

  if (moodStats.avgMood != null && moodStats.count >= 3) {
    rhythms.push({
      kind: "rhythm",
      title: "Your reflections are adding context",
      body: `Across ${moodStats.count} reflections, your average mood landed at ${moodStats.avgMood.toFixed(1)}/5. That gives the numbers a bit more humanity.`,
      metric: `${moodStats.avgMood.toFixed(1)}/5`,
    });
  }

  const energyTotal = ENERGY_KEYS.reduce((sum, key) => sum + energyCounts[key], 0);
  const lowAndScattered = energyCounts.low + energyCounts.scattered;
  if (energyTotal >= 4 && lowAndScattered / energyTotal >= 0.5) {
    adjustments.push({
      kind: "adjustment",
      title: "Match the day before asking more of it",
      body: `${lowAndScattered} of ${energyTotal} energy-tagged entries were low or scattered. Try giving those blocks smaller, easier-to-enter tasks.`,
      metric: formatPct(lowAndScattered / energyTotal),
    });
  }

  const highMinutes = energyMinutes.high + energyMinutes.medium;
  const lowMinutes = energyMinutes.low + energyMinutes.scattered;
  if (highMinutes > 0 && lowMinutes > highMinutes * 1.4) {
    adjustments.push({
      kind: "adjustment",
      title: "Keep a lighter lane ready",
      body: `Lower-energy time outweighed high/medium time here. A short fallback list can stop those hours becoming all-or-nothing.`,
      metric: formatMinutes(lowMinutes),
    });
  }

  if (intentionStats.created >= 4 && intentionStats.completionRate < 0.5) {
    adjustments.push({
      kind: "adjustment",
      title: "Make tomorrow's list smaller on purpose",
      body: `${intentionStats.completed} of ${intentionStats.created} intentions finished. That looks like a planning-load problem, not a character problem.`,
      metric: formatPct(intentionStats.completionRate),
    });
  }

  if (habitStats.active > 0 && habitStats.completionRate != null && habitStats.completionRate < 0.4) {
    adjustments.push({
      kind: "adjustment",
      title: "Lower the habit friction",
      body: `Your habits landed ${habitStats.completed} of ${habitStats.opportunities} chances. One tiny version of the habit may be easier to keep alive.`,
      metric: formatPct(habitStats.completionRate),
    });
  }

  if (daysLogged <= Math.max(2, Math.floor(windowDays * 0.25))) {
    adjustments.push({
      kind: "adjustment",
      title: "More dots will make the picture kinder",
      body: "A few more quick logs will make these patterns sharper. Even messy one-line entries count.",
      metric: `${daysLogged} days`,
    });
  }

  const selected: AnalysisHighlight[] = [];
  const add = (items: AnalysisHighlight[], fallbackIndex = 0) => {
    const next = items.find((item) => !selected.some((s) => s.title === item.title)) ?? items[fallbackIndex];
    if (next && !selected.some((s) => s.title === next.title)) selected.push(next);
  };

  add(wins);
  add(rhythms);
  add(adjustments);

  const fallback: AnalysisHighlight[] = [
    {
      kind: "win",
      title: "There is progress here",
      body: `You have ${formatMinutes(totalMinutes)} of tracked life in this window. It does not need to be perfect to be useful.`,
      metric: formatMinutes(totalMinutes),
    },
    {
      kind: "rhythm",
      title: "The pattern is still forming",
      body: "Keep logging small moments and the useful rhythms will start to separate from the noise.",
      metric: `${daysLogged} days`,
    },
    {
      kind: "adjustment",
      title: "Keep the next step small",
      body: "The best next experiment is a tiny one: pick one thing to make easier tomorrow.",
      metric: "1 thing",
    },
  ];

  for (const item of fallback) {
    if (selected.length >= 3) break;
    add([item]);
  }

  return selected.slice(0, 3);
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

  const [allEntries, intentions, reflections, habits] = await Promise.all([
    getEntriesSince(prevStart),
    getIntentionsForDateRange(prevStart, endDate),
    getReflectionsForDateRange(prevStart, endDate),
    getActiveHabits(),
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
  const energyMinutes = { high: 0, medium: 0, low: 0, scattered: 0 };
  for (const e of current) {
    if (e.energy) {
      const level = e.energy as EnergyLevel;
      energyCounts[level]++;
      energyMinutes[level] += getEntryDuration(e);
    }
  }

  const habitStats = getHabitStats(habits, startDate, endDate);

  // Intentions (current period only) — collapsed by carry-over lineage so a
  // task carried Mon→Tue→Wed counts as one user-perceived intention, not three.
  const currIntentions: Intention[] = intentions.filter(
    (i) => i.date >= startDate && i.date <= endDate
  );
  const idMap = new Map<string, Intention>();
  for (const i of currIntentions) idMap.set(i.id, i);

  // Walk carriedFromId pointers up to the deepest ancestor still visible in
  // the current window. Once we leave the window, stop — that ancestor became
  // the root for analysis purposes. Cycles can't happen because carriedFromId
  // is set once at clone time, but we cap the walk just in case.
  const rootOf = (id: string): string => {
    let cur: Intention | undefined = idMap.get(id);
    let safety = 100;
    while (cur && cur.carriedFromId && idMap.has(cur.carriedFromId) && safety-- > 0) {
      cur = idMap.get(cur.carriedFromId);
    }
    return cur ? cur.id : id;
  };

  // Group intentions by their lineage root.
  const groups = new Map<string, Intention[]>();
  for (const i of currIntentions) {
    const root = rootOf(i.id);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }

  let created = 0;
  let completed = 0;
  const bucketBuckets = new Map<
    string,
    { bucketId: string | null; bucketName: string; completed: number; total: number }
  >();
  // Bucket name lookup from customIntentionCategories requires a Settings read,
  // which the caller doesn't provide. For now bucket name = bucketId or "Uncategorized".
  // The /analysis page resolves names at render time via useIntentionCategories.
  for (const members of groups.values()) {
    created++;
    const groupCompleted = members.some((m) => m.completed);
    if (groupCompleted) completed++;
    // Use the most recent clone's categoryId — that's the bucket the user
    // most recently assigned.
    const latest = members.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
    const key = latest.categoryId ?? "__uncategorized__";
    const existing = bucketBuckets.get(key);
    if (existing) {
      existing.total++;
      if (groupCompleted) existing.completed++;
    } else {
      bucketBuckets.set(key, {
        bucketId: latest.categoryId ?? null,
        bucketName: latest.categoryId ?? "Uncategorized",
        completed: groupCompleted ? 1 : 0,
        total: 1,
      });
    }
  }
  const completionRate = created > 0 ? completed / created : 0;
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
  const minutesByDate = new Map<string, { minutes: number; entries: number }>();
  const dayOfWeekMins: number[] = [0, 0, 0, 0, 0, 0, 0];
  const dayOfWeekEntries: number[] = [0, 0, 0, 0, 0, 0, 0];
  const hourOfDayMins: number[] = new Array(24).fill(0);
  const byDayAndHour: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const e of current) {
    const mins = getEntryDuration(e);
    if (mins <= 0) continue;
    const dayBucket = minutesByDate.get(e.date) ?? { minutes: 0, entries: 0 };
    dayBucket.minutes += mins;
    dayBucket.entries++;
    minutesByDate.set(e.date, dayBucket);
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
  const dailyBreakdown = eachDateInRange(startDate, endDate).map((date) => {
    const d = dateFromStr(date);
    const bucket = minutesByDate.get(date) ?? { minutes: 0, entries: 0 };
    return {
      date,
      label: DAY_NAMES[d.getDay()],
      minutes: bucket.minutes,
      entries: bucket.entries,
      isToday: date === endDate,
    };
  });

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

  const progressHighlights = buildProgressHighlights({
    windowDays,
    totalMinutes,
    prevPeriodMinutes,
    daysLogged,
    longestStreakInWindow,
    categoryBreakdown,
    energyCounts,
    energyMinutes,
    habitStats,
    intentionStats,
    moodStats,
    mostProductiveDayOfWeek,
    mostProductiveHourWindow,
  });

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
    energyMinutes,
    habitStats,
    intentionStats,
    moodStats,
    dailyBreakdown,
    byDayOfWeek,
    byHourOfDay,
    byDayAndHour,
    mostProductiveDayOfWeek,
    mostProductiveHourWindow,
    topActivities,
    progressHighlights,
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
