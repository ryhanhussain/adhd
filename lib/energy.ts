import { toLocalDateStr, type Entry, type EnergyLevel } from "./db";

export interface EnergyPoint {
  hour: number; // 0-23
  minute: number;
  energy: EnergyLevel;
  timestamp: number;
}

export interface DailyEnergyData {
  points: EnergyPoint[];
  counts: { high: number; medium: number; low: number; scattered: number };
}

export interface WeeklyEnergyData {
  // 7 days (Mon-Sun), each with hourly energy levels
  days: {
    day: string;
    date: string;
    hourly: Map<number, EnergyLevel[]>; // hour -> energy levels in that hour
  }[];
  summary: { high: number; medium: number; low: number; scattered: number };
}

const ENERGY_COLORS: Record<EnergyLevel, string> = {
  high: "#22c55e",
  medium: "#3b82f6",
  low: "#ef4444",
  scattered: "#f59e0b",
};

export function getEnergyColor(level: EnergyLevel): string {
  return ENERGY_COLORS[level];
}

export function getEnergyEmoji(level: EnergyLevel): string {
  switch (level) {
    case "high": return "🔋";
    case "medium": return "⚡";
    case "low": return "🪫";
    case "scattered": return "🌪️";
  }
}

export function getEnergyLabel(level: EnergyLevel): string {
  switch (level) {
    case "high": return "High";
    case "medium": return "Medium";
    case "low": return "Low";
    case "scattered": return "Scattered";
  }
}

export const ENERGY_LEVELS: EnergyLevel[] = ["high", "medium", "low", "scattered"];

export function getDailyEnergyData(entries: Entry[]): DailyEnergyData {
  const points: EnergyPoint[] = [];
  const counts = { high: 0, medium: 0, low: 0, scattered: 0 };

  for (const entry of entries) {
    if (!entry.energy) continue;
    const d = new Date(entry.startTime || entry.timestamp);
    points.push({
      hour: d.getHours(),
      minute: d.getMinutes(),
      energy: entry.energy,
      timestamp: entry.startTime || entry.timestamp,
    });
    counts[entry.energy]++;
  }

  points.sort((a, b) => a.timestamp - b.timestamp);
  return { points, counts };
}

export function getWeeklyEnergyData(entries: Entry[], weekStartDate: string): WeeklyEnergyData {
  const summary = { high: 0, medium: 0, low: 0, scattered: 0 };
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const monday = new Date(weekStartDate + "T12:00:00");
  const days: WeeklyEnergyData["days"] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = toLocalDateStr(d);
    days.push({
      day: DAY_NAMES[d.getDay()],
      date: dateStr,
      hourly: new Map(),
    });
  }

  for (const entry of entries) {
    if (!entry.energy) continue;
    const dayEntry = days.find((d) => d.date === entry.date);
    if (!dayEntry) continue;

    const hour = new Date(entry.startTime || entry.timestamp).getHours();
    const existing = dayEntry.hourly.get(hour) || [];
    existing.push(entry.energy);
    dayEntry.hourly.set(hour, existing);
    summary[entry.energy]++;
  }

  return { days, summary };
}
