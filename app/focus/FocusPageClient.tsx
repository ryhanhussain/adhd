"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, Pause, Play, Square, Timer } from "lucide-react";
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
import {
  Button,
  EmptyState,
  Field,
  Input,
  MetadataChip,
  PageHeader,
  PageShell,
  Panel,
  SegmentedControl,
  Select,
} from "@/components/ui/primitives";

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
  const durationChoice = DURATION_PRESETS.includes(selectedMinutes as (typeof DURATION_PRESETS)[number])
    ? String(selectedMinutes)
    : "custom";
  const progressStyle = { "--focus-progress": `${progress * 360}deg` } as CSSProperties;

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
    <PageShell maxWidth="lg">
      <PageHeader
        eyebrow="Focus"
        title={state ? "Focus session" : "Pick one task"}
        description={state ? state.intentionText : "Choose the task and timer length before starting."}
        actions={
          state ? (
            <MetadataChip tone={timerDone ? "success" : paused ? "neutral" : "accent"}>
              <Timer size={13} />
              {timerDone ? "Ready" : paused ? "Paused" : "Running"}
            </MetadataChip>
          ) : undefined
        }
      />

      <Panel className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
        <div className="flex justify-center">
          <div
            className={`focus-orb-wrap ${state && !paused && !timerDone ? "is-running" : ""}`}
            style={progressStyle}
          >
            <div className="focus-orb">
              <div className="text-center">
                <div className="text-5xl font-black tabular-nums tracking-tight sm:text-6xl">
                  {formatCountdown(remaining)}
                </div>
                <div className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  {state ? (timerDone ? "Ready to complete" : paused ? "Paused" : "Running") : "Ready"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {state ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                Current task
              </p>
              <p className="mt-1 break-words text-base font-black leading-6">{state.intentionText}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <MetadataChip>
                  <Clock3 size={13} />
                  {Math.floor(elapsed / 60000)}m elapsed
                </MetadataChip>
                <MetadataChip tone={timerDone ? "success" : "accent"}>
                  <Timer size={13} />
                  {formatMinutes(Math.round(state.targetMs / 60000))}
                </MetadataChip>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <Button
                onClick={togglePause}
                disabled={timerDone || busy}
                variant="secondary"
              >
                {paused ? <Play size={17} fill="currentColor" /> : <Pause size={17} />}
                {paused ? "Resume" : "Pause"}
              </Button>
              <Button
                onClick={() => void handleComplete()}
                disabled={busy}
                variant="primary"
              >
                <CheckCircle2 size={17} />
                Complete
              </Button>
              <Button
                onClick={() => void handleCancel()}
                disabled={busy}
                variant="danger"
              >
                <Square size={15} />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {tasks.length > 0 ? (
              <Field label="Task">
                <Select
                  value={selectedId}
                  aria-label="Task"
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.text}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <EmptyState
                icon={<Timer size={20} />}
                title="No active tasks"
                description="Add a task before starting a focus session."
                action={
                  <Link href="/" className="text-sm font-bold text-[var(--color-accent)] hover:underline">
                    Add tasks
                  </Link>
                }
              />
            )}

            <Field label="Duration">
              <SegmentedControl
                value={durationChoice}
                onChange={(value) => setMinutes(Number(value))}
                ariaLabel="Focus duration"
                className="grid-cols-4"
                options={DURATION_PRESETS.map((minutes) => ({
                  value: String(minutes),
                  label: formatMinutes(minutes),
                }))}
              />
            </Field>

            <Field label="Custom minutes" className="max-w-40">
              <Input
                type="number"
                aria-label="Custom minutes"
                min={MIN_TIMER_MINUTES}
                max={MAX_TIMER_MINUTES}
                value={selectedMinutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
            </Field>

            <Button
              onClick={() => void handleStart()}
              disabled={!selectedTask || busy}
              variant="primary"
              size="lg"
              fullWidth
            >
              <Play size={17} fill="currentColor" />
              Start
            </Button>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
