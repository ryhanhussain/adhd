"use client";

import type { Entry, Habit } from "@/lib/db";
import type { Category } from "@/lib/categories";
import type { StreakInfo } from "@/lib/streaks";
import ActiveTimerCard from "@/components/ActiveTimerCard";
import DailySummary from "@/components/DailySummary";
import WeekTeaser from "@/components/WeekTeaser";
import ReflectionTease from "@/components/ReflectionTease";
import HabitsCard from "@/components/HabitsCard";
import StreakMiniCard from "./StreakMiniCard";
import TodaySparklineCard from "./TodaySparklineCard";

interface MiniSidebarProps {
  activeEntry: Entry | null | undefined;
  onFinishActive: () => void;
  entries: Entry[];
  categories: Category[];
  streak: StreakInfo | null;
  /** Focus sessions live on /focus; the Now rail only shows regular open timers. */
  hasPomodoro?: boolean;
  onHabitToggled?: (habit: Habit, ticked: boolean) => void;
}

/**
 * Desktop right rail. The dashboard's secondary column:
 *   [ ActiveTimerCard | nothing ]  Focus sessions are opened in /focus.
 *   [ Streak ] [ Today ]   ← grid-cols-2
 *   [ Daily habits ]
 *   [ Daily summary | week teaser | reflection ] ← demoted but rendered
 */
export default function MiniSidebar({
  activeEntry,
  onFinishActive,
  entries,
  categories,
  streak,
  hasPomodoro = false,
  onHabitToggled,
}: MiniSidebarProps) {
  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {!hasPomodoro && activeEntry ? (
        <ActiveTimerCard activeEntry={activeEntry} onFinish={onFinishActive} />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {streak && <StreakMiniCard streak={streak} />}
        <TodaySparklineCard entries={entries} />
      </div>

      <HabitsCard onHabitToggled={onHabitToggled} />

      {entries.length > 0 && (
        <DailySummary entries={entries} categories={categories} compact />
      )}

      <WeekTeaser />
      <ReflectionTease />
    </div>
  );
}
