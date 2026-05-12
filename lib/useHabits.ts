"use client";

import { useCallback, useEffect, useState } from "react";
import { getActiveHabits, type Habit } from "./db";

/**
 * Subscribes to the local habits list. Reloads on `habit-updated` (remote
 * pulls) and `entry-updated` (general UI bus, which the home page already
 * dispatches after local mutations). Cheap full-list fetch — realistic
 * ceiling is a handful of habits per user.
 */
export function useHabits(): Habit[] {
  const [habits, setHabits] = useState<Habit[]>([]);

  const reload = useCallback(async () => {
    setHabits(await getActiveHabits());
  }, []);

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    // `habit-dirty` fires on every local mutation in lib/db.ts so the UI
    // stays in lock-step without each call site dispatching its own event.
    // `habit-updated` is the post-pull broadcast from habitsSync.
    // `entry-updated` is the shared UI bus — keeps habits in step with the
    // home page's existing refresh cadence.
    window.addEventListener("habit-dirty", handler);
    window.addEventListener("habit-updated", handler);
    window.addEventListener("entry-updated", handler);
    return () => {
      window.removeEventListener("habit-dirty", handler);
      window.removeEventListener("habit-updated", handler);
      window.removeEventListener("entry-updated", handler);
    };
  }, [reload]);

  return habits;
}
