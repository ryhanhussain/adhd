"use client";

import { type PeriodMetrics } from "@/lib/analysis";

interface ProductiveWhenProps {
  metrics: PeriodMetrics;
}

// Reorder Sun-first into Mon-first for nicer week reading.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Hours to display in the heatmap (6am–10pm)
const HOUR_START = 6;
const HOUR_END = 22;

function fmtHour(h: number): string {
  const suffix = h >= 12 ? "p" : "a";
  const hr = h % 12 || 12;
  return `${hr}${suffix}`;
}

function fmtMins(m: number): string {
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}

export default function ProductiveWhen({ metrics }: ProductiveWhenProps) {
  const { byDayOfWeek, byDayAndHour, mostProductiveDayOfWeek, mostProductiveHourWindow } = metrics;

  const orderedDays = WEEK_ORDER.map((i) => byDayOfWeek[i]);
  const maxDayMins = Math.max(1, ...orderedDays.map((d) => d.minutes));

  const hasData = orderedDays.some((d) => d.minutes > 0);
  if (!hasData) return null;

  // Heatmap data: reorder to Mon-first and slice hours
  const heatmapRows = WEEK_ORDER.map((dow) => byDayAndHour[dow]);
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  // Find max cell value for opacity scaling
  let maxCell = 0;
  for (const row of heatmapRows) {
    for (const h of hours) {
      if (row[h] > maxCell) maxCell = row[h];
    }
  }
  if (maxCell === 0) maxCell = 1;

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        When you&apos;re productive
      </h3>

      {/* Day of week bar chart */}
      <div>
        <div className="flex items-end gap-1.5 h-20">
          {orderedDays.map((d, i) => {
            const h = (d.minutes / maxDayMins) * 100;
            const isTop = d.day === mostProductiveDayOfWeek && d.minutes > 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="flex-1 w-full flex items-end">
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      isTop
                        ? "bg-[var(--color-accent)]"
                        : "bg-[var(--color-accent)]/30"
                    }`}
                    style={{ height: `${Math.max(2, h)}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">
                  {DAY_LABELS[i]}
                </span>
                {/* Tooltip */}
                {d.minutes > 0 && (
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--color-text)] text-[var(--color-bg)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    {fmtMins(d.minutes)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {mostProductiveDayOfWeek && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2 text-center">
            Best day:{" "}
            <span className="text-[var(--color-text)] font-semibold">
              {mostProductiveDayOfWeek}
            </span>
          </p>
        )}
      </div>

      {/* Heatmap grid */}
      <div className="pt-3 border-t border-[var(--color-border)]">
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-0">
            {/* Hour labels row */}
            <div className="flex items-center gap-0">
              <div className="w-8 flex-shrink-0" />
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="flex-1 text-center text-[8px] text-[var(--color-text-muted)] font-medium tabular-nums"
                  style={{ minWidth: 16 }}
                >
                  {i % 3 === 0 ? fmtHour(h) : ""}
                </div>
              ))}
            </div>

            {/* Grid rows */}
            {heatmapRows.map((row, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-0 mt-[2px]">
                <div className="w-8 flex-shrink-0 text-[9px] font-bold text-[var(--color-text-muted)] pr-1 text-right">
                  {DAY_FULL[dayIdx]}
                </div>
                {hours.map((h) => {
                  const mins = row[h];
                  const opacity = mins > 0 ? Math.max(0.15, mins / maxCell) : 0;
                  return (
                    <div
                      key={h}
                      className="flex-1 group relative"
                      style={{ minWidth: 16 }}
                    >
                      <div
                        className="aspect-square rounded-[3px] mx-[1px] transition-colors"
                        style={{
                          backgroundColor:
                            mins > 0
                              ? `color-mix(in srgb, var(--color-accent) ${Math.round(opacity * 100)}%, transparent)`
                              : "var(--color-border)",
                          opacity: mins > 0 ? 1 : 0.3,
                        }}
                      />
                      {mins > 0 && (
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--color-text)] text-[var(--color-bg)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          {DAY_FULL[dayIdx]} {fmtHour(h)}: {fmtMins(mins)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {mostProductiveHourWindow && (
          <p className="text-xs text-[var(--color-text-muted)] mt-3 text-center">
            Peak hours:{" "}
            <span className="text-[var(--color-text)] font-semibold">
              {mostProductiveHourWindow}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
