"use client";

import type { Entry, Habit } from "@/lib/db";
import type { Category } from "@/lib/categories";
import type { StreakInfo } from "@/lib/streaks";
import DailySummary from "@/components/DailySummary";
import WeekTeaser from "@/components/WeekTeaser";
import ReflectionTease from "@/components/ReflectionTease";
import HabitsCard from "@/components/HabitsCard";
import StreakMiniCard from "./StreakMiniCard";
import TodaySparklineCard from "./TodaySparklineCard";

interface MiniSidebarProps {
  entries: Entry[];
  categories: Category[];
  streak: StreakInfo | null;
  onHabitToggled?: (habit: Habit, ticked: boolean) => void;
}

/**
 * Desktop right rail. The dashboard's secondary column:
 *   [ Streak ] [ Today ]   ← grid-cols-2
 *   [ Daily habits ]
 *   [ Daily summary | week teaser | reflection ] ← demoted but rendered
 */
export default function MiniSidebar({
  entries,
  categories,
  streak,
  onHabitToggled,
}: MiniSidebarProps) {
  return (
    <div className="flex flex-col gap-3 animate-fade-in">
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
