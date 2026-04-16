"use client";

import { useState, useEffect } from "react";
import { getWeeklyMetrics, type WeeklyMetrics } from "@/lib/insights";
import { type Category } from "@/lib/categories";
import WeeklyEnergyHeatmap from "./WeeklyEnergyHeatmap";
import VibeCloud from "./VibeCloud";

interface WeeklyInsightsProps {
  categories: Category[];
}

function formatDuration(minutes: number): string {
  if (!minutes || isNaN(minutes) || minutes <= 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function WeeklyInsights({ categories }: WeeklyInsightsProps) {
  const [metrics, setMetrics] = useState<WeeklyMetrics | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getWeeklyMetrics(categories).then(setMetrics);
    const handle = () => getWeeklyMetrics(categories).then(setMetrics);
    window.addEventListener("entry-updated", handle);
    return () => window.removeEventListener("entry-updated", handle);
  }, [categories]);

  if (!metrics || (metrics.totalMinutes === 0 && metrics.daysLogged === 0)) return null;

  const diff = metrics.totalMinutes - metrics.prevWeekMinutes;
  const diffPct = metrics.prevWeekMinutes > 0 ? Math.round((diff / metrics.prevWeekMinutes) * 100) : 0;
  const maxDayMinutes = Math.max(...metrics.dailyBreakdown.map((d) => d.minutes), 1);
  const today = new Date().getDay();
  // Convert to Mon=0 index: Mon=0, Tue=1, ..., Sun=6
  const todayIdx = today === 0 ? 6 : today - 1;

  return (
    <div className="glass-panel flex-shrink-0 w-full rounded-[2rem] overflow-hidden animate-fade-in transition-all duration-500 shadow-xl relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-accent)]/10 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 relative z-10 group"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            This Week
          </h2>
          {metrics.prevWeekMinutes > 0 && diff !== 0 && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                color: diff > 0 ? "var(--color-success)" : "var(--color-danger)",
                backgroundColor: diff > 0 ? "color-mix(in srgb, var(--color-success) 10%, transparent)" : "color-mix(in srgb, var(--color-danger) 10%, transparent)",
              }}
            >
              {diff > 0 ? "+" : ""}{diffPct}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-black tabular-nums tracking-tight">{formatDuration(metrics.totalMinutes)}</span>
          <div className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-500 ${expanded ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]" : "bg-[var(--color-text)]/5 text-[var(--color-text-muted)] group-hover:bg-[var(--color-text)]/10"}`}>
            <svg
              className="w-4 h-4 transition-transform duration-500"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4 animate-fade-in">
          {/* Daily bar chart */}
          <table className="sr-only">
            <caption>Weekly activity breakdown</caption>
            <thead><tr><th>Day</th><th>Time tracked</th></tr></thead>
            <tbody>
              {metrics.dailyBreakdown.map((d) => (
                <tr key={d.day}><td>{d.day}</td><td>{formatDuration(d.minutes)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-end gap-2 h-20 pt-2" role="img" aria-label={`This week: ${formatDuration(metrics.totalMinutes)} tracked over ${metrics.daysLogged} days`}>
            {metrics.dailyBreakdown.map((d, i) => {
              const isToday = i === todayIdx;
              const hasData = d.minutes > 0;
              const barHeight = hasData ? Math.max((d.minutes / maxDayMinutes) * 56, 6) : 3;

              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
                  {/* Duration label on hover/active */}
                  <span className="text-[8px] tabular-nums text-[var(--color-text-muted)] h-3 leading-3">
                    {hasData ? formatDuration(d.minutes) : ""}
                  </span>
                  <div
                    className="w-full rounded-md transition-all duration-700 ease-out shadow-inner"
                    style={{
                      height: `${barHeight}px`,
                      backgroundColor: hasData
                        ? isToday ? "var(--color-accent)" : "var(--color-accent)"
                        : "var(--color-border)",
                      opacity: hasData ? (isToday ? 1 : 0.4) : 0.2,
                      boxShadow: hasData && isToday ? "0 0 12px var(--color-accent-soft)" : "none",
                      animation: `fadeIn 0.5s var(--spring-bouncy) ${i * 50}ms backwards`,
                    }}
                  />
                  <span
                    className="text-[10px] font-medium"
                    style={{
                      color: isToday ? "var(--color-accent)" : "var(--color-text-muted)",
                    }}
                  >
                    {d.day}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between px-1">
            {/* Days active */}
            <div className="flex flex-col items-center">
              <div className="flex items-baseline gap-0.5">
                <span className="text-xl font-bold tabular-nums">{metrics.daysLogged}</span>
                <span className="text-xs text-[var(--color-text-muted)]">/7</span>
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)]">days</span>
            </div>

            {/* Separator */}
            <div className="w-px h-8 bg-[var(--color-border)]" />

            {/* Top category */}
            {metrics.topCategory ? (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: metrics.topCategory.color }}
                  />
                  <span className="text-sm font-semibold">{metrics.topCategory.name}</span>
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {formatDuration(metrics.topCategory.minutes)}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-sm text-[var(--color-text-muted)]">—</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">top</span>
              </div>
            )}

            {/* Separator */}
            <div className="w-px h-8 bg-[var(--color-border)]" />

            {/* Most active day */}
            {metrics.mostActiveDay ? (
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold">{metrics.mostActiveDay.name}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {formatDuration(metrics.mostActiveDay.minutes)}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-sm text-[var(--color-text-muted)]">—</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">best day</span>
              </div>
            )}
          </div>

          {/* Category breakdown (if multiple categories) */}
          {metrics.categoryBreakdown.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {metrics.categoryBreakdown.map((cat) => (
                <div
                  key={cat.name}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: `color-mix(in srgb, ${cat.color} 7%, transparent)` }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-[10px] font-medium" style={{ color: cat.color }}>
                    {cat.name}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                    {formatDuration(cat.minutes)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Weekly energy heatmap */}
          <WeeklyEnergyHeatmap />

          {/* Vibe Cloud */}
          <VibeCloud />
        </div>
      )}
    </div>
  );
}
