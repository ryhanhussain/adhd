"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import Skeleton from "@/components/Skeleton";
import VibeCloud from "@/components/VibeCloud";
import WindowChips from "@/components/analysis/WindowChips";
import StatsTiles from "@/components/analysis/StatsTiles";
import CategoryMakeup from "@/components/analysis/CategoryMakeup";
import ProductiveWhen from "@/components/analysis/ProductiveWhen";
import MoodCategoryCorrelation from "@/components/analysis/MoodCategoryCorrelation";
import AIPeriodSummary from "@/components/analysis/AIPeriodSummary";
import { getEntriesSince, type Entry } from "@/lib/db";
import {
  getPeriodMetrics,
  getEntryDuration,
  type PeriodMetrics,
  type PeriodWindow,
} from "@/lib/analysis";
import { useCategories } from "@/lib/useCategories";
import { getEnergyColor, getEnergyLabel, ENERGY_LEVELS } from "@/lib/energy";

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function parseWindowParam(raw: string | null): PeriodWindow {
  if (raw === "7") return 7;
  if (raw === "90") return 90;
  if (raw === "400" || raw === "all") return 400;
  return 30;
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TOP_WINDOWS: { value: 7 | 30 | 90; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

function TopActivitiesCard({
  entries,
  window: win,
  onWindowChange,
  maxWindowDays,
}: {
  entries: Entry[];
  window: 7 | 30 | 90;
  onWindowChange: (w: 7 | 30 | 90) => void;
  maxWindowDays: PeriodWindow;
}) {
  const cutoff = daysAgoStr(win - 1);
  const filtered = entries.filter((e) => e.date >= cutoff);

  const summaryMap = new Map<string, { minutes: number; count: number }>();
  for (const e of filtered) {
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

  if (topActivities.length === 0) return null;

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Top activities by time
        </h3>
        <div className="flex gap-1">
          {TOP_WINDOWS.filter((tw) => tw.value <= maxWindowDays).map((opt) => {
            const active = opt.value === win;
            return (
              <button
                key={opt.value}
                onClick={() => onWindowChange(opt.value)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all active:scale-95 ${
                  active
                    ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)]"
                }`}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {topActivities.map((row) => (
          <div
            key={row.summary}
            className="flex items-center gap-3 text-sm"
          >
            <span className="flex-1 min-w-0 truncate">{row.summary}</span>
            <span className="text-[var(--color-text-muted)] tabular-nums text-xs">
              ×{row.count}
            </span>
            <span className="tabular-nums font-bold w-16 text-right">
              {formatMinutes(row.minutes)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalysisPageInner() {
  const categories = useCategories();
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialWindow = parseWindowParam(searchParams.get("window"));
  const [windowDays, setWindowDays] = useState<PeriodWindow>(initialWindow);
  const [metrics, setMetrics] = useState<PeriodMetrics | null>(null);
  const [periodEntries, setPeriodEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [topActivitiesWindow, setTopActivitiesWindow] = useState<7 | 30 | 90>(30);

  const load = useCallback(async (w: PeriodWindow) => {
    setLoading(true);
    const [m, e] = await Promise.all([
      getPeriodMetrics(w, categories),
      getEntriesSince(daysAgoStr(w - 1)),
    ]);
    setMetrics(m);
    setPeriodEntries(e);
    setLoading(false);
  }, [categories]);

  useEffect(() => {
    load(windowDays);
  }, [windowDays, load]);

  useEffect(() => {
    const handle = () => load(windowDays);
    window.addEventListener("entry-updated", handle);
    return () => window.removeEventListener("entry-updated", handle);
  }, [windowDays, load]);

  const handleWindowChange = (w: PeriodWindow) => {
    setWindowDays(w);
    // Keep the URL in sync so sharing / back-nav works.
    const params = new URLSearchParams(searchParams.toString());
    params.set("window", String(w));
    router.replace(`/analysis?${params.toString()}`, { scroll: false });
  };

  const totalEnergy = useMemo(() => {
    if (!metrics) return 0;
    const c = metrics.energyCounts;
    return c.high + c.medium + c.low + c.scattered;
  }, [metrics]);

  return (
    <PageLayout gap="5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analysis</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          Zoom out and see your patterns.
        </p>
      </div>

      <WindowChips value={windowDays} onChange={handleWindowChange} />

      {loading || !metrics ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : metrics.totalMinutes === 0 && metrics.daysLogged === 0 ? (
        <div className="glass-panel rounded-2xl p-6 text-center">
          <p className="text-base font-semibold mb-1">No data yet for this window</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Log a few activities and come back — patterns appear after a day or two.
          </p>
        </div>
      ) : (
        <>
          <AIPeriodSummary metrics={metrics} windowDays={windowDays} />

          <StatsTiles metrics={metrics} />

          <CategoryMakeup metrics={metrics} />

          <ProductiveWhen metrics={metrics} />

          {/* Energy distribution */}
          {totalEnergy > 0 && (
            <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Energy distribution
              </h3>
              <div className="h-3 rounded-full overflow-hidden flex bg-[var(--color-border)]/30">
                {ENERGY_LEVELS.map((level) => {
                  const pct = (metrics.energyCounts[level] / totalEnergy) * 100;
                  if (pct < 0.5) return null;
                  return (
                    <div
                      key={level}
                      style={{ width: `${pct}%`, backgroundColor: getEnergyColor(level) }}
                      title={`${getEnergyLabel(level)}: ${metrics.energyCounts[level]}`}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {ENERGY_LEVELS.map((level) => {
                  const count = metrics.energyCounts[level];
                  const pct = Math.round((count / totalEnergy) * 100);
                  return (
                    <div key={level} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: getEnergyColor(level) }}
                      />
                      <span className="font-semibold">{getEnergyLabel(level)}</span>
                      <span className="text-[var(--color-text-muted)] tabular-nums ml-auto">
                        {count} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intentions by bucket */}
          {metrics.intentionStats.created > 0 && (
            <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Intentions by bucket
              </h3>
              <div className="flex flex-col gap-2">
                {metrics.intentionStats.byCategory.map((b) => {
                  const pct =
                    b.total > 0 ? Math.round((b.completed / b.total) * 100) : 0;
                  return (
                    <div
                      key={b.bucketId ?? "__uncategorized__"}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="font-semibold truncate flex-1">
                        {b.bucketName}
                      </span>
                      <span className="text-[var(--color-text-muted)] tabular-nums text-xs">
                        {b.completed}/{b.total}
                      </span>
                      <div className="w-20 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-accent)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="tabular-nums font-bold w-10 text-right text-xs">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <MoodCategoryCorrelation metrics={metrics} categories={categories} />

          {/* Top activities with independent filter */}
          <TopActivitiesCard
            entries={periodEntries}
            window={topActivitiesWindow}
            onWindowChange={setTopActivitiesWindow}
            maxWindowDays={windowDays}
          />

          {periodEntries.length > 0 && (
            <div className="glass-panel rounded-2xl p-5">
              <VibeCloud
                entries={periodEntries}
                title={windowDays === 7 ? "This week's vibe" : `Last ${windowDays} days · vibe`}
              />
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={null}>
      <AnalysisPageInner />
    </Suspense>
  );
}
