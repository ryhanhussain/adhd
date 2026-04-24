"use client";

import { type PeriodMetrics } from "@/lib/analysis";
import { getCategoryStyle, type Category } from "@/lib/categories";

interface MoodCategoryCorrelationProps {
  metrics: PeriodMetrics;
  categories: Category[];
}

function moodLabel(avg: number): string {
  if (avg >= 4.5) return "Great";
  if (avg >= 3.5) return "Good";
  if (avg >= 2.5) return "OK";
  if (avg >= 1.5) return "Low";
  return "Rough";
}

export default function MoodCategoryCorrelation({
  metrics,
  categories,
}: MoodCategoryCorrelationProps) {
  const { moodStats } = metrics;

  // Suppress entirely when reflection count is too low to be meaningful.
  if (moodStats.count < 3 || moodStats.moodByDominantCategory.length === 0) {
    return null;
  }

  const rows = moodStats.moodByDominantCategory.slice(0, 5);

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Mood by dominant category
        </h3>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
          Your average mood on days where each category led the time spent.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row) => {
          const style = getCategoryStyle(row.name, categories);
          return (
            <div key={row.name} className="flex items-center gap-3 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: style.color }}
              />
              <span className="font-semibold truncate flex-1">{row.name}</span>
              <span className="text-[var(--color-text-muted)] text-xs">
                {row.days} {row.days === 1 ? "day" : "days"}
              </span>
              <span className="tabular-nums font-bold w-10 text-right">
                {row.avgMood.toFixed(1)}
              </span>
              <span className="text-[11px] font-semibold text-[var(--color-text-muted)] w-12 text-right">
                {moodLabel(row.avgMood)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
