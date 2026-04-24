"use client";

import { type PeriodMetrics } from "@/lib/analysis";

interface StatsTilesProps {
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

export default function StatsTiles({ metrics }: StatsTilesProps) {
  const { totalMinutes, prevPeriodMinutes, daysLogged, windowDays, intentionStats, moodStats } =
    metrics;

  const deltaPct =
    prevPeriodMinutes > 0
      ? Math.round(((totalMinutes - prevPeriodMinutes) / prevPeriodMinutes) * 100)
      : null;

  const completionPct = Math.round(intentionStats.completionRate * 100);

  function moodEmojiLabel(avg: number): { emoji: string; word: string } {
    if (avg >= 4.5) return { emoji: "🤩", word: "Great" };
    if (avg >= 3.5) return { emoji: "😊", word: "Good" };
    if (avg >= 2.5) return { emoji: "😐", word: "Okay" };
    if (avg >= 1.5) return { emoji: "😔", word: "Low" };
    return { emoji: "😞", word: "Rough" };
  }

  const mood =
    moodStats.avgMood != null ? moodEmojiLabel(moodStats.avgMood) : null;
  const moodDisplay = mood ? `${mood.emoji} ${mood.word}` : "—";
  const moodHint =
    moodStats.avgMood != null && moodStats.count >= 3
      ? `${moodStats.avgMood.toFixed(1)}/5 · ${moodStats.count} reflections`
      : moodStats.count > 0
        ? `${moodStats.count} reflection${moodStats.count === 1 ? "" : "s"} — need 3+`
        : "need 3+ reflections";

  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile
        label="Total tracked"
        value={formatMinutes(totalMinutes)}
        hint={
          deltaPct != null
            ? `${deltaPct > 0 ? "+" : ""}${deltaPct}% vs prior ${windowDays}d`
            : "no prior data"
        }
        hintTone={deltaPct != null ? (deltaPct >= 0 ? "up" : "down") : "muted"}
      />
      <Tile
        label="Days logged"
        value={`${daysLogged}/${windowDays}`}
        hint={`${Math.round((daysLogged / windowDays) * 100)}% of days`}
      />
      <Tile
        label="Intentions done"
        value={intentionStats.created > 0 ? `${completionPct}%` : "—"}
        hint={
          intentionStats.created > 0
            ? `${intentionStats.completed}/${intentionStats.created}`
            : "none planned"
        }
      />
      <Tile
        label="Avg mood"
        value={moodDisplay}
        hint={moodHint}
      />
    </div>
  );
}

interface TileProps {
  label: string;
  value: string;
  hint: string;
  hintTone?: "up" | "down" | "muted";
}

function Tile({ label, value, hint, hintTone = "muted" }: TileProps) {
  const hintColor =
    hintTone === "up"
      ? "text-[var(--color-success)]"
      : hintTone === "down"
        ? "text-[var(--color-danger)]"
        : "text-[var(--color-text-muted)]";
  return (
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
        {label}
      </span>
      <span className="text-2xl font-black tabular-nums tracking-tight truncate">
        {value}
      </span>
      <span className={`text-[11px] font-semibold ${hintColor} truncate`}>{hint}</span>
    </div>
  );
}
