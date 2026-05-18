"use client";

import { useCallback, useEffect, useMemo, useState, Suspense, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Skeleton from "@/components/Skeleton";
import VibeCloud from "@/components/VibeCloud";
import WindowChips from "@/components/analysis/WindowChips";
import CategoryMakeup from "@/components/analysis/CategoryMakeup";
import ProductiveWhen from "@/components/analysis/ProductiveWhen";
import MoodCategoryCorrelation from "@/components/analysis/MoodCategoryCorrelation";
import AIPeriodSummary from "@/components/analysis/AIPeriodSummary";
import { getEntriesSince, type EnergyLevel, type Entry } from "@/lib/db";
import {
  getPeriodMetrics,
  getEntryDuration,
  type AnalysisHighlight,
  type PeriodMetrics,
  type PeriodWindow,
} from "@/lib/analysis";
import { useCategories } from "@/lib/useCategories";
import { useIntentionCategories } from "@/lib/useIntentionCategories";
import { useLifeAreas } from "@/lib/useLifeAreas";
import { getEnergyColor, getEnergyLabel, ENERGY_LEVELS } from "@/lib/energy";
import { getLifeAreaById, type LifeArea } from "@/lib/lifeAreas";

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

function windowLabel(windowDays: PeriodWindow): string {
  return windowDays === 400 ? "all time" : `${windowDays} days`;
}

const TOP_WINDOWS: { value: 7 | 30 | 90; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

const HIGHLIGHT_LABELS: Record<AnalysisHighlight["kind"], string> = {
  win: "Progress",
  rhythm: "Rhythm",
  adjustment: "Try next",
};

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
  const availableWindows = TOP_WINDOWS.filter((tw) => tw.value <= maxWindowDays);
  const effectiveWindow =
    availableWindows.some((opt) => opt.value === win)
      ? win
      : availableWindows[availableWindows.length - 1]?.value ?? 7;
  const cutoff = daysAgoStr(effectiveWindow - 1);
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
          {availableWindows.map((opt) => {
            const active = opt.value === effectiveWindow;
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
              x{row.count}
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

function DailyTrace({ metrics }: { metrics: PeriodMetrics }) {
  const bars = metrics.dailyBreakdown.slice(-Math.min(metrics.dailyBreakdown.length, 30));
  const maxMinutes = Math.max(1, ...bars.map((d) => d.minutes));
  const label =
    bars.length === metrics.dailyBreakdown.length
      ? `Daily trace over ${windowLabel(metrics.windowDays)}`
      : "Last 30 days";

  if (bars.length === 0) return null;

  return (
    <div className="pt-4 border-t border-[var(--color-border)]/80">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
          {label}
        </span>
        <span className="text-[10px] font-semibold text-[var(--color-text-muted)] tabular-nums">
          {metrics.windowDays === 400
            ? `${metrics.daysLogged} logged days`
            : `${metrics.daysLogged}/${metrics.windowDays} days`}
        </span>
      </div>
      <div
        className="flex items-end gap-1 h-14"
        role="img"
        aria-label={`${formatMinutes(metrics.totalMinutes)} tracked over ${metrics.daysLogged} days`}
      >
        {bars.map((day) => {
          const height = day.minutes > 0 ? Math.max(4, (day.minutes / maxMinutes) * 100) : 3;
          return (
            <div key={day.date} className="flex-1 flex items-end min-w-[3px]">
              <div
                className={`w-full rounded-t-sm ${
                  day.isToday
                    ? "bg-[var(--color-accent)]"
                    : day.minutes > 0
                      ? "bg-[var(--color-accent)]/45"
                      : "bg-[var(--color-border)]/45"
                }`}
                style={{ height: `${height}%` }}
                title={`${day.date}: ${formatMinutes(day.minutes)}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressStory({ metrics, lifeAreas }: { metrics: PeriodMetrics; lifeAreas: LifeArea[] }) {
  const [primary, ...secondary] = metrics.progressHighlights;
  const topLifeArea = metrics.lifeAreaBreakdown[0] ?? null;
  const topLifeAreaName = topLifeArea
    ? getLifeAreaById(topLifeArea.lifeAreaId, lifeAreas)?.name ?? "Untagged"
    : null;
  const topLifeAreaShare =
    topLifeArea && metrics.totalMinutes > 0 ? topLifeArea.minutes / metrics.totalMinutes : 0;

  return (
    <section className="glass-panel rounded-3xl p-5 sm:p-6 flex flex-col gap-5 overflow-hidden">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            Progress story
          </p>
          {primary?.metric && (
            <span className="px-2.5 py-1 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-[11px] font-black tabular-nums">
              {primary.metric}
            </span>
          )}
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
          {primary?.title ?? "There is progress here"}
        </h2>
        <p className="text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed max-w-3xl">
          {primary?.body ?? "The useful picture is still forming. Every small log gives future-you better evidence."}
        </p>
        {topLifeAreaName && topLifeAreaShare >= 0.35 && (
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed max-w-3xl">
            {topLifeAreaName} led the Life Area shape here at {Math.round(topLifeAreaShare * 100)}% of tracked time.
          </p>
        )}
      </div>

      {secondary.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 sm:divide-x sm:divide-[var(--color-border)]">
          {secondary.map((item) => (
            <div key={item.title} className="sm:px-4 first:sm:pl-0 last:sm:pr-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-accent)]">
                  {HIGHLIGHT_LABELS[item.kind]}
                </span>
                {item.metric && (
                  <span className="text-[10px] font-black tabular-nums text-[var(--color-text-muted)]">
                    {item.metric}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold leading-snug">{item.title}</h3>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mt-1">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      )}

      <DailyTrace metrics={metrics} />
    </section>
  );
}

function ProofOfProgress({ metrics }: { metrics: PeriodMetrics }) {
  const completionPct =
    metrics.intentionStats.created > 0
      ? formatPct(metrics.intentionStats.completionRate)
      : "-";
  const habitPct =
    metrics.habitStats.completionRate != null
      ? formatPct(metrics.habitStats.completionRate)
      : "-";
  const consistencyValue =
    metrics.windowDays === 400 ? `${metrics.daysLogged}` : `${metrics.daysLogged}/${metrics.windowDays}`;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        title="Proof of progress"
        subtitle="Simple evidence from this window, without waiting on AI."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ProofTile
          label="Consistency"
          value={consistencyValue}
          hint={
            metrics.longestStreakInWindow > 1
              ? `${metrics.longestStreakInWindow}-day run inside it`
              : metrics.windowDays === 400
                ? "logged days in saved history"
                : "logged days in this window"
          }
        />
        <ProofTile
          label="Tracked"
          value={formatMinutes(metrics.totalMinutes)}
          hint={
            metrics.prevPeriodMinutes > 0
              ? `${formatMinutes(Math.abs(metrics.totalMinutes - metrics.prevPeriodMinutes))} ${
                  metrics.totalMinutes >= metrics.prevPeriodMinutes ? "more" : "less"
                } than prior`
              : "new baseline"
          }
        />
        <ProofTile
          label="Intentions"
          value={completionPct}
          hint={
            metrics.intentionStats.created > 0
              ? `${metrics.intentionStats.completed}/${metrics.intentionStats.created} completed`
              : "none planned here"
          }
        />
        <ProofTile
          label="Habits"
          value={habitPct}
          hint={
            metrics.habitStats.active > 0
              ? metrics.habitStats.bestStreak > 0
                ? `${metrics.habitStats.bestStreak}-day best current streak`
                : `${metrics.habitStats.completed}/${metrics.habitStats.opportunities} ticks`
              : "no active habits yet"
          }
        />
      </div>
    </section>
  );
}

function ProofTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="glass-panel rounded-2xl p-4 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="text-2xl font-black tabular-nums tracking-tight truncate mt-1">
        {value}
      </p>
      <p className="text-[11px] font-semibold text-[var(--color-text-muted)] truncate mt-0.5">
        {hint}
      </p>
    </div>
  );
}

function TimeByLifeAreaCard({
  metrics,
  lifeAreas,
  entries,
}: {
  metrics: PeriodMetrics;
  lifeAreas: LifeArea[];
  entries: Entry[];
}) {
  const [drillId, setDrillId] = useState<string | null | "__untagged__">(null);
  const rows = metrics.lifeAreaBreakdown
    .map((row) => {
      const area = getLifeAreaById(row.lifeAreaId, lifeAreas);
      return {
        ...row,
        key: row.lifeAreaId ?? "__untagged__",
        name: area ? `${area.name}${area.archived ? " (archived)" : ""}` : "Untagged",
        color: area?.color ?? "#a1a1aa",
        pct: metrics.totalMinutes > 0 ? row.minutes / metrics.totalMinutes : 0,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  if (rows.length === 0 || metrics.totalMinutes <= 0) return null;

  const drillEntries = drillId
    ? entries.filter((entry) => (entry.lifeAreaId ?? "__untagged__") === drillId)
    : [];

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3 md:col-span-2 xl:col-span-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Time by Life Area
      </h3>
      <div className="h-3 rounded-full overflow-hidden flex bg-[var(--color-border)]/30">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => setDrillId(row.key)}
            style={{ width: `${Math.max(1, row.pct * 100)}%`, backgroundColor: row.color }}
            title={`${row.name}: ${formatMinutes(row.minutes)}`}
            aria-label={`${row.name}: ${formatMinutes(row.minutes)}`}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => setDrillId(drillId === row.key ? null : row.key)}
            className="flex items-center gap-3 text-sm text-left rounded-xl px-2 py-1.5 hover:bg-[var(--color-text)]/5"
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="font-semibold truncate flex-1">{row.name}</span>
            <span className="tabular-nums">{formatMinutes(row.minutes)}</span>
            <span className="text-[var(--color-text-muted)] tabular-nums w-10 text-right">
              {Math.round(row.pct * 100)}%
            </span>
            <span
              className={`tabular-nums text-xs w-14 text-right ${
                row.deltaPct == null ? "text-[var(--color-text-muted)]" : row.deltaPct >= 0 ? "text-green-600" : "text-red-500"
              }`}
            >
              {row.deltaPct == null ? "new" : `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%`}
            </span>
          </button>
        ))}
      </div>
      {drillId && drillEntries.length > 0 && (
        <div className="border-t border-[var(--color-border)] pt-3 flex flex-col gap-2">
          {drillEntries.slice(0, 10).map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 text-xs">
              <span className="text-[var(--color-text-muted)] tabular-nums">
                {new Date(entry.startTime || entry.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              <span className="flex-1 truncate">{entry.summary || entry.text}</span>
              <span className="font-semibold tabular-nums">{formatMinutes(getEntryDuration(entry))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BehaviorRhythms({
  metrics,
  lifeAreas,
  periodEntries,
}: {
  metrics: PeriodMetrics;
  lifeAreas: LifeArea[];
  periodEntries: Entry[];
}) {
  const topCategory = metrics.categoryBreakdown[0] ?? null;
  const totalEnergyMinutes = ENERGY_LEVELS.reduce(
    (sum, level) => sum + metrics.energyMinutes[level],
    0
  );
  const totalEnergyCount = ENERGY_LEVELS.reduce(
    (sum, level) => sum + metrics.energyCounts[level],
    0
  );
  const dominantEnergy = ENERGY_LEVELS.reduce<EnergyLevel | null>((best, level) => {
    if (!best) return level;
    const current = totalEnergyMinutes > 0 ? metrics.energyMinutes[level] : metrics.energyCounts[level];
    const previous = totalEnergyMinutes > 0 ? metrics.energyMinutes[best] : metrics.energyCounts[best];
    return current > previous ? level : best;
  }, null);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        title="Behavior rhythms"
        subtitle="The patterns that might help you plan with your actual energy."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <BehaviorCard
          label="Energy shape"
          value={dominantEnergy && (totalEnergyMinutes > 0 || totalEnergyCount > 0) ? getEnergyLabel(dominantEnergy) : "Still forming"}
          detail={
            dominantEnergy && totalEnergyMinutes > 0
              ? `${formatMinutes(metrics.energyMinutes[dominantEnergy])} tagged ${getEnergyLabel(dominantEnergy).toLowerCase()}`
              : dominantEnergy && totalEnergyCount > 0
                ? `${metrics.energyCounts[dominantEnergy]} entries tagged ${getEnergyLabel(dominantEnergy).toLowerCase()}`
                : "Add energy tags to see the shape"
          }
        />
        <BehaviorCard
          label="Center of gravity"
          value={topCategory?.name ?? "Still forming"}
          detail={
            topCategory
              ? `${formatMinutes(topCategory.minutes)} of tracked time`
              : "Log a few categories to see what leads"
          }
          color={topCategory?.color}
        />
        <BehaviorCard
          label="Strongest window"
          value={metrics.mostProductiveHourWindow ?? metrics.mostProductiveDayOfWeek ?? "Still forming"}
          detail={
            metrics.mostProductiveHourWindow
              ? "A useful place to protect deeper work"
              : metrics.mostProductiveDayOfWeek
                ? "The day with the clearest signal"
                : "More timed entries will reveal this"
          }
        />
        <BehaviorCard
          label="Mood signal"
          value={
            metrics.moodStats.avgMood != null
              ? `${metrics.moodStats.avgMood.toFixed(1)}/5`
              : "Need 3+"
          }
          detail={
            metrics.moodStats.avgMood != null
              ? `${metrics.moodStats.count} reflections in this window`
              : `${metrics.moodStats.count} reflection${metrics.moodStats.count === 1 ? "" : "s"} so far`
          }
        />
        <TimeByLifeAreaCard metrics={metrics} lifeAreas={lifeAreas} entries={periodEntries} />
      </div>
    </section>
  );
}

function BehaviorCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color?: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4 min-w-0">
      <div className="flex items-center gap-2">
        {color && (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
        )}
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] truncate">
          {label}
        </p>
      </div>
      <p className="text-lg font-black tracking-tight truncate mt-1">{value}</p>
      <p className="text-[11px] font-semibold text-[var(--color-text-muted)] mt-0.5">
        {detail}
      </p>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-sm font-black tracking-tight">{title}</h2>
      {subtitle && (
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

function DetailBlock({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className="group"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="glass-panel rounded-2xl px-4 py-3 cursor-pointer list-none select-none flex items-center justify-between gap-3 active:scale-[0.99] transition-transform">
        <span className="min-w-0">
          <span className="block text-sm font-bold tracking-tight">{title}</span>
          <span className="block text-xs text-[var(--color-text-muted)] truncate mt-0.5">
            {subtitle}
          </span>
        </span>
        <span className="w-8 h-8 rounded-full bg-[var(--color-text)]/5 text-[var(--color-text-muted)] flex items-center justify-center flex-shrink-0 group-open:rotate-180 transition-transform">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function EnergyDistributionCard({ metrics }: { metrics: PeriodMetrics }) {
  const totalEnergy = ENERGY_LEVELS.reduce((sum, level) => sum + metrics.energyCounts[level], 0);
  if (totalEnergy === 0) return null;

  return (
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
  );
}

function IntentionsByBucketCard({
  metrics,
  intentionCategories,
}: {
  metrics: PeriodMetrics;
  intentionCategories: ReturnType<typeof useIntentionCategories>;
}) {
  if (metrics.intentionStats.created === 0) return null;

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Intentions by bucket
      </h3>
      <div className="flex flex-col gap-2">
        {metrics.intentionStats.byCategory.map((b) => {
          const pct =
            b.total > 0 ? Math.round((b.completed / b.total) * 100) : 0;
          const displayName = b.bucketId
            ? intentionCategories.find((c) => c.id === b.bucketId)?.name ?? "Unknown bucket"
            : "Uncategorized";
          return (
            <div
              key={b.bucketId ?? "__uncategorized__"}
              className="flex items-center gap-3 text-sm"
            >
              <span className="font-semibold truncate flex-1">
                {displayName}
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
  );
}

function ExploreDetails({
  metrics,
  periodEntries,
  topActivitiesWindow,
  setTopActivitiesWindow,
  categories,
  intentionCategories,
}: {
  metrics: PeriodMetrics;
  periodEntries: Entry[];
  topActivitiesWindow: 7 | 30 | 90;
  setTopActivitiesWindow: (w: 7 | 30 | 90) => void;
  categories: ReturnType<typeof useCategories>;
  intentionCategories: ReturnType<typeof useIntentionCategories>;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        title="Explore the details"
        subtitle="Charts and deeper reads live here when you want the receipts."
      />

      <DetailBlock
        title="Time and categories"
        subtitle="Where the tracked time went"
        defaultOpen
      >
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          <CategoryMakeup metrics={metrics} />
          <TopActivitiesCard
            entries={periodEntries}
            window={topActivitiesWindow}
            onWindowChange={setTopActivitiesWindow}
            maxWindowDays={metrics.windowDays}
          />
        </div>
      </DetailBlock>

      <DetailBlock
        title="Rhythms and energy"
        subtitle="When things tend to happen"
      >
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          <ProductiveWhen metrics={metrics} />
          <EnergyDistributionCard metrics={metrics} />
          <MoodCategoryCorrelation metrics={metrics} categories={categories} />
        </div>
      </DetailBlock>

      <DetailBlock
        title="Intentions and vibe"
        subtitle="Planning follow-through and repeated words"
      >
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          <IntentionsByBucketCard metrics={metrics} intentionCategories={intentionCategories} />
          {periodEntries.length > 0 && (
            <div className="glass-panel rounded-2xl p-5">
              <VibeCloud
                entries={periodEntries}
                title={metrics.windowDays === 7 ? "This week's vibe" : `Last ${metrics.windowDays} days · vibe`}
              />
            </div>
          )}
        </div>
      </DetailBlock>

      <DetailBlock
        title="Deeper AI read"
        subtitle="Optional, generated only when you ask"
      >
        <AIPeriodSummary metrics={metrics} windowDays={metrics.windowDays} />
      </DetailBlock>
    </section>
  );
}

function AnalysisPageInner() {
  const categories = useCategories();
  const intentionCategories = useIntentionCategories();
  const lifeAreas = useLifeAreas();
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
    window.addEventListener("habit-dirty", handle);
    window.addEventListener("habit-updated", handle);
    return () => {
      window.removeEventListener("entry-updated", handle);
      window.removeEventListener("habit-dirty", handle);
      window.removeEventListener("habit-updated", handle);
    };
  }, [windowDays, load]);

  useEffect(() => {
    if (windowDays !== 400 && topActivitiesWindow > windowDays) {
      setTopActivitiesWindow(windowDays as 7 | 30 | 90);
    }
  }, [topActivitiesWindow, windowDays]);

  const handleWindowChange = (w: PeriodWindow) => {
    setWindowDays(w);
    const params = new URLSearchParams(searchParams.toString());
    params.set("window", String(w));
    router.replace(`/analysis?${params.toString()}`, { scroll: false });
  };

  const hasAnyProgress = useMemo(() => {
    if (!metrics) return false;
    return (
      metrics.totalMinutes > 0 ||
      metrics.daysLogged > 0 ||
      metrics.habitStats.active > 0 ||
      metrics.intentionStats.created > 0
    );
  }, [metrics]);

  return (
    <div className="max-w-6xl mx-auto pb-nav flex flex-col gap-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Progress</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Small proof that your days are adding up.
          </p>
        </div>
        <WindowChips value={windowDays} onChange={handleWindowChange} />
      </header>

      {loading || !metrics ? (
        <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
          <Skeleton className="h-72 rounded-3xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        </div>
      ) : !hasAnyProgress ? (
        <div className="glass-panel rounded-3xl p-6 text-center max-w-xl mx-auto">
          <p className="text-base font-semibold mb-1">No progress signal yet</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Log a few activities or add a daily habit. The page gets useful as soon as there are a few dots to connect.
          </p>
        </div>
      ) : (
        <>
          <ProgressStory metrics={metrics} lifeAreas={lifeAreas} />
          <ProofOfProgress metrics={metrics} />
          <BehaviorRhythms metrics={metrics} lifeAreas={lifeAreas} periodEntries={periodEntries} />
          <ExploreDetails
            metrics={metrics}
            periodEntries={periodEntries}
            topActivitiesWindow={topActivitiesWindow}
            setTopActivitiesWindow={setTopActivitiesWindow}
            categories={categories}
            intentionCategories={intentionCategories}
          />
        </>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={null}>
      <AnalysisPageInner />
    </Suspense>
  );
}
