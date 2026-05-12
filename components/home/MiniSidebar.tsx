"use client";

import type { Entry } from "@/lib/db";
import type { Category } from "@/lib/categories";
import type { StreakInfo } from "@/lib/streaks";
import ActiveTimerCard from "@/components/ActiveTimerCard";
import PomodoroCard from "@/components/PomodoroCard";
import DailySummary from "@/components/DailySummary";
import WeekTeaser from "@/components/WeekTeaser";
import ReflectionTease from "@/components/ReflectionTease";
import CheckInGarden from "@/components/CheckInGarden";

interface MiniSidebarProps {
  activeEntry: Entry | null | undefined;
  onFinishActive: () => void;
  entries: Entry[];
  categories: Category[];
  streak: StreakInfo | null;
  /** When true, the Pomodoro countdown card replaces the regular active-timer card. */
  hasPomodoro?: boolean;
}

/**
 * Desktop right rail. Compact glanceable summaries — never the centerpiece,
 * never noisy. Hidden below `lg:` via the parent layout.
 */
export default function MiniSidebar({
  activeEntry,
  onFinishActive,
  entries,
  categories,
  streak,
  hasPomodoro = false,
}: MiniSidebarProps) {
  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {hasPomodoro ? (
        <PomodoroCard />
      ) : activeEntry ? (
        <ActiveTimerCard activeEntry={activeEntry} onFinish={onFinishActive} />
      ) : null}

      {streak && (
        <div className="glass-panel rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
              Streak
            </p>
            <p className="text-2xl font-black tabular-nums">
              {streak.currentStreak}
              <span className="text-sm font-semibold text-[var(--color-text-muted)] ml-1">
                {streak.currentStreak === 1 ? "day" : "days"}
              </span>
            </p>
          </div>
          <CheckInGarden hasLoggedToday={streak.hasLoggedToday} />
        </div>
      )}

      {entries.length > 0 && (
        <DailySummary entries={entries} categories={categories} compact />
      )}

      <WeekTeaser />
      <ReflectionTease />
    </div>
  );
}
