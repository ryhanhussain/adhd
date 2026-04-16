"use client";

import { type Entry } from "@/lib/db";
import { getCategoryStyle, type Category } from "@/lib/categories";
import EnergyInsights from "./EnergyInsights";

interface DailySummaryProps {
  entries: Entry[];
  categories: Category[];
}

function formatDuration(minutes: number): string {
  if (!minutes || isNaN(minutes) || minutes <= 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getHourLabel(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h}${suffix}`;
}

function getEntryDuration(entry: Entry): number {
  const start = entry.startTime || entry.timestamp;
  if (!start || isNaN(start)) return 0;
  const end = entry.endTime === 0 ? Date.now() : (entry.endTime || entry.timestamp);
  if (!end || isNaN(end)) return 0;
  const mins = Math.round((end - start) / 60000);
  return isNaN(mins) ? 0 : Math.max(0, mins);
}

export default function DailySummary({ entries, categories }: DailySummaryProps) {
  if (entries.length === 0) return null;

  // Aggregate duration by category
  const categoryMinutes: Record<string, number> = {};
  let totalMinutes = 0;

  for (const entry of entries) {
    const duration = getEntryDuration(entry);
    const tag = entry.tags[0] || "Other";
    categoryMinutes[tag] = (categoryMinutes[tag] || 0) + duration;
    totalMinutes += duration;
  }

  if (totalMinutes === 0) return null;

  // Filter out 0-minute categories
  const sorted = Object.entries(categoryMinutes)
    .filter(([, minutes]) => minutes > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return null;

  const maxCategoryMinutes = sorted[0][1];

  // Donut chart constants
  const WAKING_HOURS = 16;
  const wakingMinutes = WAKING_HOURS * 60;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  // Build donut segments (only categories with time)
  let cumulativeOffset = 0;
  const segments = sorted.map(([tag, minutes]) => {
    const fraction = minutes / wakingMinutes;
    const dashLength = fraction * circumference;
    const offset = cumulativeOffset;
    cumulativeOffset += dashLength;
    const style = getCategoryStyle(tag, categories);
    return { tag, dashLength, offset, color: style.color };
  });

  // Peak activity insight (only if 3+ entries)
  let peakInsight: string | null = null;
  if (entries.length >= 3) {
    const hourCounts: Record<number, number> = {};
    for (const entry of entries) {
      const hour = new Date(entry.startTime || entry.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    let bestWindow = 0;
    let bestCount = 0;
    for (let h = 6; h <= 22; h++) {
      const count = (hourCounts[h] || 0) + (hourCounts[h + 1] || 0);
      if (count > bestCount) {
        bestCount = count;
        bestWindow = h;
      }
    }
    if (bestCount >= 2) {
      peakInsight = `Most active: ${getHourLabel(bestWindow)}–${getHourLabel(bestWindow + 2)}`;
    }
  }

  return (
    <div className="glass-panel p-5 rounded-3xl animate-fade-in shadow-xl relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--color-accent)]/10 rounded-full blur-3xl pointer-events-none" />
      
      {/* Donut + total */}
      <div className="flex items-center gap-6 mb-4 relative z-10">
        <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
          <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`Today: ${formatDuration(totalMinutes)} tracked across ${sorted.length} ${sorted.length === 1 ? "category" : "categories"}`}>
            <defs>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            {/* Background ring */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="8"
              opacity="0.3"
            />
            {/* Tracked segments */}
            {segments.map((seg, i) => (
              <circle
                key={seg.tag}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="8"
                strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
                strokeDashoffset={-seg.offset}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
                filter="url(#glow)"
                style={{
                  opacity: 0,
                  animation: `fadeIn 0.5s var(--spring-bouncy) ${i * 100}ms forwards`,
                }}
              />
            ))}
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black tabular-nums tracking-tight">
              {formatDuration(totalMinutes)}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-[var(--color-text-muted)] mt-1 font-bold">
              tracked
            </span>
          </div>
        </div>

        {/* Category bars */}
        <div className="flex-1 flex flex-col gap-3 relative z-10 w-full overflow-hidden" style={{ minWidth: 0 }}>
          {sorted.map(([tag, minutes]) => {
            const style = getCategoryStyle(tag, categories);
            const barWidth = maxCategoryMinutes > 0 ? (minutes / maxCategoryMinutes) * 100 : 0;
            return (
              <div key={tag} className="flex flex-col gap-1.5 group w-full" style={{ minWidth: 0 }}>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: style.color, boxShadow: `0 0 8px ${style.color}80` }}
                    />
                    <span className="text-xs font-semibold truncate max-w-[80px]">{tag}</span>
                  </div>
                  <span className="text-xs font-bold text-[var(--color-text-muted)] tabular-nums group-hover:text-[var(--color-text)] transition-colors flex-shrink-0 ml-2">
                    {formatDuration(minutes)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-border)] overflow-hidden shadow-inner opacity-60 w-full relative">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out relative"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: style.color,
                      boxShadow: `inset 0 0 4px ${style.color}`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Peak activity insight */}
      {peakInsight && (
        <p className="text-xs text-[var(--color-text-muted)] text-center animate-fade-in">
          {peakInsight}
        </p>
      )}

      {/* Energy dot-line chart */}
      <EnergyInsights entries={entries} />
    </div>
  );
}
