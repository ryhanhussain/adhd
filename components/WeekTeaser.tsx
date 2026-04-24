"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getWeeklyMetrics, type WeeklyMetrics } from "@/lib/insights";
import { useCategories } from "@/lib/useCategories";

function formatHours(m: number): string {
  if (m <= 0) return "0h";
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  if (h === 0) return `${mm}m`;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

export default function WeekTeaser() {
  const categories = useCategories();
  const [metrics, setMetrics] = useState<WeeklyMetrics | null>(null);

  useEffect(() => {
    getWeeklyMetrics(categories).then(setMetrics);
    const handle = () => getWeeklyMetrics(categories).then(setMetrics);
    window.addEventListener("entry-updated", handle);
    return () => window.removeEventListener("entry-updated", handle);
  }, [categories]);

  if (!metrics || metrics.totalMinutes === 0) {
    return null;
  }

  return (
    <Link
      href="/analysis?window=7"
      className="glass-panel rounded-2xl p-4 flex items-center justify-between gap-3 group transition-all active:scale-[0.99] hover:border-[var(--color-accent)]/40 border border-transparent"
      aria-label="Open analysis for this week"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
          This week
        </span>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-lg font-black tabular-nums tracking-tight">
            {formatHours(metrics.totalMinutes)}
          </span>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] tabular-nums">
            · {metrics.daysLogged}/7 days
          </span>
          {metrics.topCategory && (
            <span className="text-xs font-semibold text-[var(--color-text-muted)] truncate">
              · mostly {metrics.topCategory.name}
            </span>
          )}
        </div>
      </div>
      <span className="flex items-center gap-1 text-xs font-semibold text-[var(--color-accent)] flex-shrink-0 group-hover:translate-x-0.5 transition-transform">
        See patterns
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </span>
    </Link>
  );
}
