"use client";

import { useCallback, useEffect, useState } from "react";
import HabitItem from "@/components/HabitItem";
import { useHabits } from "@/lib/useHabits";
import { deleteHabit, toggleHabitCompletion, toLocalDateStr } from "@/lib/db";
import { isTickedToday, shouldAutoRemove } from "@/lib/habits";

/**
 * Home-page daily habit tracker. Renders below the BucketGrid/EnergyView
 * centerpiece. Empty when the user has no habits configured — encourages
 * setup via a link to /settings.
 *
 * Two passive jobs:
 *   1. Cleanup: on mount + on midnight rollover, soft-delete any habit that
 *      has gone more than 10 days without activity. Routed through
 *      `deleteHabit` so the tombstone propagates via sync.
 *   2. Midnight rollover: re-derive `today` at next local midnight (timeout)
 *      and on tab-visibility return so the "ticked today?" check stays fresh.
 */
export default function HabitsCard() {
  const habits = useHabits();
  const [today, setToday] = useState(() => toLocalDateStr(new Date()));

  const runCleanup = useCallback(
    async (currentToday: string, list: typeof habits) => {
      for (const h of list) {
        if (shouldAutoRemove(h, currentToday)) {
          // eslint-disable-next-line no-await-in-loop
          await deleteHabit(h.id);
        }
      }
    },
    []
  );

  // Cleanup whenever the date or list changes. Idempotent — once a habit is
  // soft-deleted the next reload's `useHabits` won't include it.
  useEffect(() => {
    if (habits.length === 0) return;
    void runCleanup(today, habits);
  }, [habits, today, runCleanup]);

  // Midnight rollover: schedule a one-shot timeout for next local midnight,
  // and re-derive `today` on tab return (covers device-asleep-across-midnight).
  useEffect(() => {
    const recompute = () => {
      const fresh = toLocalDateStr(new Date());
      setToday((prev) => (prev === fresh ? prev : fresh));
    };

    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1, // +1s of slop so we're firmly into the next day
      0
    );
    const ms = Math.max(1_000, nextMidnight.getTime() - now.getTime());
    const timer = setTimeout(recompute, ms);

    const onVisible = () => {
      if (document.visibilityState === "visible") recompute();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", recompute);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", recompute);
    };
  }, [today]);

  const handleToggle = async (id: string) => {
    await toggleHabitCompletion(id, today);
    window.dispatchEvent(new Event("entry-updated"));
  };

  if (habits.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text-muted)] flex items-center justify-between gap-3">
        <span>Track a daily habit — meditation, journaling, anything you want to anchor every day.</span>
        <a
          href="/settings"
          className="text-[var(--color-accent)] font-medium whitespace-nowrap"
        >
          Add in Settings →
        </a>
      </section>
    );
  }

  const tickedCount = habits.reduce(
    (acc, h) => acc + (isTickedToday(h, today) ? 1 : 0),
    0
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Daily habits
        </h2>
        <span className="px-2 py-0.5 rounded-full bg-[var(--color-bg)]/60 border border-[var(--color-border)] text-[10px] font-bold tabular-nums text-[var(--color-text-muted)]">
          {tickedCount}/{habits.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {habits.map((h) => (
          <HabitItem key={h.id} habit={h} today={today} onToggle={handleToggle} />
        ))}
      </div>
    </section>
  );
}
