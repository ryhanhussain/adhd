"use client";

import {
  addEntry,
  deleteEntry,
  toLocalDateStr,
  updateEntry,
  updateIntention,
  type EnergyLevel,
} from "@/lib/db";
import {
  clearPomodoroState,
  setPomodoroState,
  type PomodoroState,
} from "@/lib/pomodoro";
import {
  ensureNotificationPermission,
  playPomodoroSound,
} from "@/lib/notifications";

export interface PomodoroTaskInput {
  intentionId: string | null;
  intentionText: string;
  targetMs: number;
  energy?: EnergyLevel | null;
  lifeAreaId?: string | null;
  activityCategory?: string | null;
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
    tags: task.activityCategory ? [task.activityCategory] : [],
    energy: task.energy ?? null,
    lifeAreaId: task.lifeAreaId ?? null,
    summary: isBurst ? task.intentionText : null,
    createdAt: now,
  });

  const state: PomodoroState = {
    entryId,
    mode: isBurst ? "burst" : "intention",
    intentionId: task.intentionId,
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

  clearPomodoroState();
  window.dispatchEvent(new Event("entry-updated"));
}

export async function cancelPomodoroSession(state: PomodoroState): Promise<void> {
  await deleteEntry(state.entryId);
  clearPomodoroState();
  window.dispatchEvent(new Event("entry-updated"));
}
