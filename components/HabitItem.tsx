"use client";

import { useRef, type MouseEvent } from "react";
import BucketIcon from "@/components/home/BucketIcon";
import { confettiBurst } from "@/lib/confetti";
import { type Habit } from "@/lib/db";
import { getHabitStreak, isTickedToday } from "@/lib/habits";

interface Props {
  habit: Habit;
  today: string;
  onToggle: (id: string) => void;
}

export default function HabitItem({ habit, today, onToggle }: Props) {
  const checkboxRef = useRef<HTMLButtonElement | null>(null);
  const ticked = isTickedToday(habit, today);
  const streak = getHabitStreak(habit, today);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!ticked) {
      const rect = (checkboxRef.current ?? e.currentTarget).getBoundingClientRect();
      confettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    onToggle(habit.id);
  };

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors"
      style={ticked ? { borderColor: `color-mix(in srgb, ${habit.color} 40%, transparent)` } : undefined}
    >
      <button
        ref={checkboxRef}
        onClick={handleClick}
        aria-pressed={ticked}
        aria-label={ticked ? `Mark ${habit.name} incomplete for today` : `Mark ${habit.name} done for today`}
        className="min-w-11 min-h-11 flex items-center justify-center flex-shrink-0 rounded-xl transition-transform active:scale-90"
        style={
          ticked
            ? {
                backgroundColor: habit.color,
                color: "white",
                boxShadow: `0 1px 8px ${habit.color}55`,
              }
            : {
                backgroundColor: `color-mix(in srgb, ${habit.color} 12%, transparent)`,
                color: habit.color,
              }
        }
      >
        {ticked ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <BucketIcon name={habit.icon ?? "sparkle"} size={18} />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-tight truncate text-[var(--color-text)]">
          {habit.name}
        </div>
      </div>

      <div
        className="flex items-center gap-1 text-xs font-semibold tabular-nums px-2 py-1 rounded-full"
        style={{
          color: streak > 0 ? habit.color : "var(--color-text-muted)",
          backgroundColor: streak > 0 ? `color-mix(in srgb, ${habit.color} 10%, transparent)` : "transparent",
        }}
        aria-label={`${streak}-day streak`}
      >
        <span aria-hidden="true">{streak > 0 ? "🔥" : "·"}</span>
        <span>{streak}</span>
      </div>
    </div>
  );
}
