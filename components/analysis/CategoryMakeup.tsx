"use client";

import { type PeriodMetrics } from "@/lib/analysis";

interface CategoryMakeupProps {
  metrics: PeriodMetrics;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function CategoryMakeup({ metrics }: CategoryMakeupProps) {
  const { categoryBreakdown, growers, shrinkers, totalMinutes } = metrics;

  if (categoryBreakdown.length === 0 || totalMinutes === 0) {
    return (
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
          Task makeup
        </h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          Nothing tracked in this period yet.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Task makeup
      </h3>

      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-[var(--color-border)]/30">
        {categoryBreakdown.map((row) => {
          const pct = (row.minutes / totalMinutes) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={row.name}
              style={{ width: `${pct}%`, backgroundColor: row.color }}
              title={`${row.name}: ${formatMinutes(row.minutes)}`}
            />
          );
        })}
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2">
        {categoryBreakdown.slice(0, 8).map((row) => {
          const pct = Math.round((row.minutes / totalMinutes) * 100);
          return (
            <div
              key={row.name}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: row.color, boxShadow: `0 0 6px ${row.color}60` }}
              />
              <span className="font-semibold truncate flex-1">{row.name}</span>
              <span className="tabular-nums text-[var(--color-text-muted)]">
                {pct}%
              </span>
              <span className="tabular-nums font-bold w-16 text-right">
                {formatMinutes(row.minutes)}
              </span>
              {row.deltaPct != null && (
                <span
                  className={`text-[11px] font-bold tabular-nums w-12 text-right ${
                    row.deltaPct >= 0
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-danger)]"
                  }`}
                >
                  {row.deltaPct > 0 ? "+" : ""}
                  {row.deltaPct}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Trend callouts */}
      {(growers.length > 0 || shrinkers.length > 0) && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border)]">
          {growers.length > 0 && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-[var(--color-success)] font-bold">▲</span>
              <span className="text-[var(--color-text-muted)]">
                Growing:{" "}
                <span className="text-[var(--color-text)] font-semibold">
                  {growers
                    .map((g) => `${g.name} (+${g.deltaPct}%)`)
                    .join(", ")}
                </span>
              </span>
            </div>
          )}
          {shrinkers.length > 0 && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-[var(--color-danger)] font-bold">▼</span>
              <span className="text-[var(--color-text-muted)]">
                Shrinking:{" "}
                <span className="text-[var(--color-text)] font-semibold">
                  {shrinkers
                    .map((s) => `${s.name} (${s.deltaPct}%)`)
                    .join(", ")}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
