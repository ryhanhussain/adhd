"use client";

import type { StreakInfo } from "@/lib/streaks";
import CheckInGarden from "@/components/CheckInGarden";

interface StreakMiniCardProps {
  streak: StreakInfo;
}

export default function StreakMiniCard({ streak }: StreakMiniCardProps) {
  const dayWord = streak.currentStreak === 1 ? "day" : "days";
  return (
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          Streak
        </p>
        <span className="text-[10px] font-medium text-[var(--color-text-muted)]">
          <span className="text-[var(--color-accent)]" aria-hidden="true">✦</span>{" "}
          {streak.totalDays} planted
        </span>
      </div>
      <p className="text-3xl font-black tabular-nums leading-none">
        {streak.currentStreak}
        <span className="text-sm font-semibold text-[var(--color-text-muted)] ml-1">
          {dayWord}
        </span>
      </p>
      <CheckInGarden hasLoggedToday={streak.hasLoggedToday} />
    </div>
  );
}
