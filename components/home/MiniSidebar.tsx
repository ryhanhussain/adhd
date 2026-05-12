"use client";

import type { Entry, EnergyLevel, Intention } from "@/lib/db";
import type { Category, IntentionCategory } from "@/lib/categories";
import type { StreakInfo } from "@/lib/streaks";
import ActiveTimerCard from "@/components/ActiveTimerCard";
import PomodoroCard from "@/components/PomodoroCard";
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
  /** When true, the Pomodoro countdown card replaces the regular active-timer card. */
  hasPomodoro?: boolean;
  /** Currently running Pomodoro target — used to source bucket + energy for the dark IN-FOCUS card. */
  focusedIntention?: Intention | null;
  intentionCategories?: IntentionCategory[];
}

/**
 * Desktop right rail. The dashboard's secondary column:
 *   [ IN FOCUS (dark) | ActiveTimerCard | nothing ]
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
  focusedIntention,
  intentionCategories,
}: MiniSidebarProps) {
  const focusedBucketName = focusedIntention
    ? intentionCategories?.find((b) => b.id === focusedIntention.categoryId)?.name ?? null
    : null;
  const focusedEnergy: EnergyLevel | null = focusedIntention?.energy ?? null;

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {hasPomodoro ? (
        <PomodoroCard
          variant="dark"
          bucketName={focusedBucketName}
          energy={focusedEnergy}
        />
      ) : activeEntry ? (
        <ActiveTimerCard activeEntry={activeEntry} onFinish={onFinishActive} />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {streak && <StreakMiniCard streak={streak} />}
        <TodaySparklineCard entries={entries} />
      </div>

      <HabitsCard />

      {entries.length > 0 && (
        <DailySummary entries={entries} categories={categories} compact />
      )}

      <WeekTeaser />
      <ReflectionTease />
    </div>
  );
}
