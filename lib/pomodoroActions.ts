"use client";

import {
  addEntry,
  deleteEntry,
  getHabitById,
  toLocalDateStr,
  updateEntry,
  updateHabit,
  updateIntention,
  type EnergyLevel,
} from "@/lib/db";
import {
  clearPomodoroState,
  setPomodoroState,
  type PomodoroQueueItem,
  type PomodoroState,
} from "@/lib/pomodoro";
import {
  ensureNotificationPermission,
  playPomodoroSound,
} from "@/lib/notifications";

export const FOCUS_BURST_LABEL = "Focus burst";
export const FOCUS_BURST_MINUTES = 25;

export interface PomodoroTaskInput {
  intentionId: string | null;
  habitId?: string | null;
  intentionText: string;
  targetMs: number;
  energy?: EnergyLevel | null;
}

export function taskFromQueueItem(item: PomodoroQueueItem): PomodoroTaskInput {
  return {
    intentionId: item.intentionId,
    habitId: item.habitId ?? null,
    intentionText: item.intentionText,
    targetMs: item.targetMs,
  };
}

export function focusBurstTask(): PomodoroTaskInput {
  return {
    intentionId: null,
    intentionText: FOCUS_BURST_LABEL,
    targetMs: FOCUS_BURST_MINUTES * 60 * 1000,
    energy: null,
  };
}

export async function startPomodoroSession(
  task: PomodoroTaskInput,
  options: { sound?: boolean } = {}
): Promise<PomodoroState> {
  void ensureNotificationPermission();

  const now = Date.now();
  const entryId = crypto.randomUUID();
  const isBurst = task.intentionId == null;

  await addEntry({
    id: entryId,
    text: task.intentionText,
    timestamp: now,
    startTime: now,
    endTime: 0,
    date: toLocalDateStr(now),
    location: null,
    tags: [],
    energy: task.energy ?? null,
    summary: isBurst ? task.intentionText : null,
    createdAt: now,
  });

  const state: PomodoroState = {
    entryId,
    mode: isBurst ? "burst" : "intention",
    intentionId: task.intentionId,
    habitId: task.habitId ?? null,
    intentionText: task.intentionText,
    targetMs: task.targetMs,
    startedAt: now,
    pausedAt: null,
    accumulatedPausedMs: 0,
    notifiedAt: null,
  };

  setPomodoroState(state);
  if (options.sound !== false) playPomodoroSound("start");
  window.dispatchEvent(new Event("entry-updated"));
  return state;
}

export async function finishPomodoroSession(
  state: PomodoroState,
  options: { completeIntention?: boolean } = {}
): Promise<void> {
  const finishedAt = Date.now();
  await updateEntry(state.entryId, {
    endTime: finishedAt,
    summary: state.intentionText,
  });

  const shouldCompleteIntention = options.completeIntention !== false;
  if (shouldCompleteIntention && state.mode === "intention" && state.intentionId) {
    await updateIntention(state.intentionId, {
      completed: true,
      completedAt: finishedAt,
      entryId: state.entryId,
    });
  }
  if (shouldCompleteIntention && state.habitId) {
    const habit = await getHabitById(state.habitId);
    const dateStr = toLocalDateStr(finishedAt);
    if (habit && !habit.completions.includes(dateStr)) {
      await updateHabit(habit.id, {
        completions: [dateStr, ...habit.completions],
      });
    }
  }

  clearPomodoroState();
  window.dispatchEvent(new Event("entry-updated"));
}

export async function savePomodoroWithoutCompleting(state: PomodoroState): Promise<void> {
  await updateEntry(state.entryId, {
    endTime: Date.now(),
    summary: state.intentionText,
  });
  clearPomodoroState();
  window.dispatchEvent(new Event("entry-updated"));
}

export async function cancelPomodoroSession(state: PomodoroState): Promise<void> {
  await deleteEntry(state.entryId);
  clearPomodoroState();
  window.dispatchEvent(new Event("entry-updated"));
}

export async function switchPomodoroSession(
  current: PomodoroState,
  next: PomodoroTaskInput
): Promise<PomodoroState> {
  await updateEntry(current.entryId, {
    endTime: Date.now(),
    summary: current.intentionText,
  });
  const state = await startPomodoroSession(next, { sound: false });
  playPomodoroSound("switch");
  return state;
}
