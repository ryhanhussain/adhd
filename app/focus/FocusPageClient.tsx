"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getActiveIntentions, type Intention } from "@/lib/db";
import {
  POMODORO_EVENT,
  formatCountdown,
  getElapsedMs,
  getPomodoroState,
  getRemainingMs,
  isPaused,
  markPomodoroNotified,
  pausePomodoro,
  resumePomodoro,
  type PomodoroState,
} from "@/lib/pomodoro";
import {
  cancelPomodoroSession,
  finishPomodoroSession,
  startPomodoroSession,
  type PomodoroTaskInput,
} from "@/lib/pomodoroActions";
import { notifyPomodoroComplete, playPomodoroSound } from "@/lib/notifications";

const DEFAULT_DURATION_MINUTES = 25;
const MIN_TIMER_MINUTES = 1;
const MAX_TIMER_MINUTES = 180;
const DURATION_PRESETS = [15, 25, 40, 60] as const;

function msFromMinutes(minutes: number): number {
  return minutes * 60 * 1000;
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DURATION_MINUTES;
  return Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, Math.round(value)));
}

function durationForTask(task: Intention | null): number {
  if (task?.timeRequired === "quick") return 15;
  if (task?.timeRequired === "medium") return 25;
  if (task?.timeRequired === "long") return 60;
  return DEFAULT_DURATION_MINUTES;
}

function taskInputFromIntention(task: Intention, minutes: number): PomodoroTaskInput {
  return {
    intentionId: task.id,
    intentionText: task.text,
    targetMs: msFromMinutes(minutes),
    energy: task.energy ?? null,
    lifeAreaId: task.lifeAreaId ?? null,
    activityCategory: task.activityCategory ?? null,
  };
}

function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

export default function FocusPageClient() {
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<Intention[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedMinutes, setSelectedMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [state, setState] = useState<PomodoroState | null>(() =>
    typeof window === "undefined" ? null : getPomodoroState()
  );
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const refreshTasks = useCallback(async () => {
    setTasks(await getActiveIntentions());
  }, []);

  useEffect(() => {
    void refreshTasks();
    const syncState = () => setState(getPomodoroState());
    const syncTasks = () => void refreshTasks();
    window.addEventListener(POMODORO_EVENT, syncState);
    window.addEventListener("entry-updated", syncTasks);
    return () => {
      window.removeEventListener(POMODORO_EVENT, syncState);
      window.removeEventListener("entry-updated", syncTasks);
    };
  }, [refreshTasks]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const taskId = searchParams.get("task");
    if (taskId) setSelectedId(taskId);
  }, [searchParams]);

  useEffect(() => {
    if (selectedId || tasks.length === 0) return;
    setSelectedId(tasks[0].id);
  }, [selectedId, tasks]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [selectedId, tasks]
  );

  useEffect(() => {
    if (!selectedTask || state) return;
    setSelectedMinutes(durationForTask(selectedTask));
  }, [selectedTask, state]);

  const remaining = state ? getRemainingMs(state, now) : msFromMinutes(selectedMinutes);
  const elapsed = state ? getElapsedMs(state, now) : 0;
  const progress = state ? Math.min(1, Math.max(0, 1 - remaining / state.targetMs)) : 0;
  const paused = state ? isPaused(state) : false;
  const timerDone = !!state && remaining <= 0;

  useEffect(() => {
    if (!state || remaining > 0 || paused || state.notifiedAt) return;
    markPomodoroNotified(state);
    playPomodoroSound("complete");
    notifyPomodoroComplete(state.intentionText);
  }, [paused, remaining, state]);

  const setMinutes = (minutes: number) => {
    setSelectedMinutes(clampMinutes(minutes));
  };

  const handleStart = async () => {
    if (!selectedTask || state || busy) return;
    setBusy(true);
    try {
      await startPomodoroSession(taskInputFromIntention(selectedTask, selectedMinutes));
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      await finishPomodoroSession(state);
      await refreshTasks();
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      await cancelPomodoroSession(state);
    } finally {
      setBusy(false);
    }
  };

  const togglePause = () => {
    if (!state || timerDone) return;
    if (paused) {
      resumePomodoro();
      playPomodoroSound("resume");
    } else {
      pausePomodoro();
      playPomodoroSound("pause");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-20">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Focus
        </p>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          {state ? state.intentionText : "Pick one task"}
        </h1>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 sm:p-5">
        <div className="flex flex-col items-center gap-5">
          <div
            className="grid h-56 w-56 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] sm:h-64 sm:w-64"
            style={{
              background: `conic-gradient(var(--color-accent) ${progress * 360}deg, var(--color-surface) 0deg)`,
            }}
          >
            <div className="grid h-[82%] w-[82%] place-items-center rounded-full bg-[var(--color-bg)]">
              <div className="text-center">
                <div className="text-5xl font-black tabular-nums tracking-tight sm:text-6xl">
                  {formatCountdown(remaining)}
                </div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {state ? (timerDone ? "Ready to complete" : paused ? "Paused" : "Running") : "Ready"}
                </div>
              </div>
            </div>
          </div>

          {state ? (
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={togglePause}
                disabled={timerDone || busy}
                className="h-11 rounded-lg border border-[var(--color-border)] text-sm font-semibold disabled:opacity-45"
              >
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                onClick={() => void handleComplete()}
                disabled={busy}
                className="h-11 rounded-lg bg-[var(--color-accent)] text-sm font-semibold text-[var(--color-on-accent)] disabled:opacity-45"
              >
                Complete
              </button>
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={busy}
                className="h-11 rounded-lg border border-red-500/30 text-sm font-semibold text-red-500 disabled:opacity-45"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-4">
              {tasks.length > 0 ? (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Task
                  </span>
                  <select
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    className="h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold"
                  >
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.text}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-center">
                  <p className="text-sm font-semibold">No active tasks.</p>
                  <Link href="/" className="mt-2 inline-flex text-sm font-semibold text-[var(--color-accent)]">
                    Add tasks
                  </Link>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Duration
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_PRESETS.map((minutes) => {
                    const active = selectedMinutes === minutes;
                    return (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() => setMinutes(minutes)}
                        className={`h-10 rounded-lg border text-sm font-semibold ${
                          active
                            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface)]"
                        }`}
                      >
                        {formatMinutes(minutes)}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--color-text-muted)]">Minutes</span>
                  <input
                    type="number"
                    min={MIN_TIMER_MINUTES}
                    max={MAX_TIMER_MINUTES}
                    value={selectedMinutes}
                    onChange={(event) => setMinutes(Number(event.target.value))}
                    className="h-10 w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={!selectedTask || busy}
                className="h-12 rounded-lg bg-[var(--color-accent)] text-sm font-semibold text-[var(--color-on-accent)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Start
              </button>
            </div>
          )}

          {state && (
            <p className="text-xs font-semibold text-[var(--color-text-muted)]">
              {Math.floor(elapsed / 60000)}m elapsed
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
