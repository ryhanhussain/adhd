"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCachedAIAnalysis,
  setCachedAIAnalysis,
  type AIPeriodSummary as CachedSummary,
  type PeriodMetrics,
  type PeriodWindow,
} from "@/lib/analysis";
import { getDistinctEntryDateCount } from "@/lib/db";
import { analyzePeriod } from "@/lib/gemini";

const MIN_DAYS_TO_UNLOCK = 7;

interface AIPeriodSummaryProps {
  metrics: PeriodMetrics;
  windowDays: PeriodWindow;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  return `${days}d ago`;
}

const ERROR_MESSAGES: Record<string, string> = {
  analysis_cap: "You've hit today's analysis limit — resets tomorrow.",
  cap: "Daily AI limit reached — resets tomorrow.",
  burst: "Slow down a sec — try again in a moment.",
  auth: "Sign in again to use AI analysis.",
  network: "Network hiccup — check your connection and retry.",
  server: "Something went wrong — tap Generate to retry.",
  quota_error: "Something went wrong — tap Generate to retry.",
};

export default function AIPeriodSummary({ metrics, windowDays }: AIPeriodSummaryProps) {
  const [cached, setCached] = useState<CachedSummary | null>(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalDaysLogged, setTotalDaysLogged] = useState<number | null>(null);

  useEffect(() => {
    setCacheLoaded(false);
    setError(null);
    getCachedAIAnalysis(windowDays).then((c) => {
      setCached(c);
      setCacheLoaded(true);
    });
  }, [windowDays]);

  useEffect(() => {
    let cancelled = false;
    void getDistinctEntryDateCount().then((n) => {
      if (!cancelled) setTotalDaysLogged(n);
    });
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);

    const result = await analyzePeriod(
      windowDays,
      metrics.startDate,
      metrics.endDate,
      {
        totalMinutes: metrics.totalMinutes,
        daysLogged: metrics.daysLogged,
        categoryBreakdown: metrics.categoryBreakdown.map((c) => ({
          name: c.name,
          minutes: c.minutes,
          deltaPct: c.deltaPct,
        })),
        energyCounts: metrics.energyCounts,
        intentionStats: {
          created: metrics.intentionStats.created,
          completed: metrics.intentionStats.completed,
          completionRate: metrics.intentionStats.completionRate,
        },
        moodStats: {
          avgMood: metrics.moodStats.avgMood,
          count: metrics.moodStats.count,
        },
        mostProductiveDayOfWeek: metrics.mostProductiveDayOfWeek,
        mostProductiveHourWindow: metrics.mostProductiveHourWindow,
        topActivities: metrics.topActivities,
        growers: metrics.growers,
        shrinkers: metrics.shrinkers,
      }
    );

    if (result.ok) {
      const record: CachedSummary = {
        summary: result.summary,
        generatedAt: Date.now(),
        windowDays,
        startDate: metrics.startDate,
        endDate: metrics.endDate,
      };
      await setCachedAIAnalysis(record);
      setCached(record);
    } else {
      console.warn("[AIPeriodSummary] AI analysis error:", result.reason);
      setError(ERROR_MESSAGES[result.reason] ?? "Something went wrong — tap Generate to retry.");
    }
    setGenerating(false);
  }, [metrics, windowDays]);

  if (!cacheLoaded || totalDaysLogged === null) {
    return <div className="h-24 rounded-2xl glass-panel animate-pulse" />;
  }

  const isStale = cached && cached.endDate !== metrics.endDate;
  const locked = totalDaysLogged < MIN_DAYS_TO_UNLOCK;

  // First-week users see a polite usage gate instead of the CTA. Numbers and
  // patterns aren't meaningful until there's at least a week of data anyway.
  if (locked && !cached) {
    return (
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          AI analysis
        </h3>
        <p className="text-sm text-[var(--color-text-muted)]">
          Use ADDit for at least {MIN_DAYS_TO_UNLOCK} days to unlock AI analysis — patterns sharpen with more data.
        </p>
        <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
          {totalDaysLogged}/{MIN_DAYS_TO_UNLOCK} days logged so far.
        </p>
      </div>
    );
  }

  // No cached summary yet — show the CTA.
  if (!cached) {
    return (
      <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            AI analysis
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            A short read on your patterns over this period — pattern, surprise, suggestion.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || metrics.daysLogged === 0}
          className="h-11 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? "Thinking…" : metrics.daysLogged === 0 ? "Log something first" : "Generate insights"}
        </button>
        {error && (
          <p className="text-xs text-[var(--color-danger)] animate-fade-in">{error}</p>
        )}
      </div>
    );
  }

  // Cached summary — render it.
  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          AI analysis
        </h3>
        <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
          {timeAgo(cached.generatedAt)}
        </span>
      </div>

      <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-text)]">
        {cached.summary}
      </div>

      {isStale && (
        <p className="text-[11px] text-[var(--color-text-muted)]">
          This summary is from {cached.endDate}. Regenerate to include today&apos;s data.
        </p>
      )}

      <button
        onClick={handleGenerate}
        disabled={generating}
        className="self-start text-xs font-semibold text-[var(--color-accent)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating ? "Regenerating…" : isStale ? "Refresh →" : "Regenerate"}
      </button>

      {error && (
        <p className="text-xs text-[var(--color-danger)] animate-fade-in">{error}</p>
      )}
    </div>
  );
}
