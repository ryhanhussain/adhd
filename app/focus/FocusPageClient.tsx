"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getActiveIntentions,
  getEntriesByDate,
  toLocalDateStr,
  type Entry,
  type EnergyLevel,
  type Intention,
} from "@/lib/db";
import {
  POMODORO_EVENT,
  POMODORO_PRESETS,
  POMODORO_QUEUE_EVENT,
  enqueuePomodoroTask,
  formatCountdown,
  getElapsedMs,
  getPomodoroQueue,
  getPomodoroState,
  getRemainingMs,
  isPaused,
  markPomodoroNotified,
  pausePomodoro,
  popNextPomodoroQueueItem,
  removePomodoroQueueItem,
  reorderPomodoroQueue,
  resumePomodoro,
  type PomodoroQueueItem,
  type PomodoroState,
} from "@/lib/pomodoro";
import {
  getPomodoroSoundEnabled,
  notifyPomodoroComplete,
  playPomodoroSound,
  setPomodoroSoundEnabled,
} from "@/lib/notifications";
import {
  cancelPomodoroSession,
  finishPomodoroSession,
  focusBurstTask,
  savePomodoroWithoutCompleting,
  startPomodoroSession,
  switchPomodoroSession,
  taskFromQueueItem,
  type PomodoroTaskInput,
} from "@/lib/pomodoroActions";
import { confettiBurst } from "@/lib/confetti";

const DEFAULT_DURATION_MINUTES = 25;

function msFromMinutes(minutes: number): number {
  return minutes * 60 * 1000;
}

function minutesFromMs(ms: number): number {
  return Math.round(ms / 60000);
}

function formatDurationShort(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function getPeakHour(entries: Entry[], now: number): string {
  const buckets = new Array(24).fill(0) as number[];
  for (const entry of entries) {
    if (!entry.startTime) continue;
    const start = new Date(entry.startTime);
    const hour = start.getHours();
    const end = entry.endTime > 0 ? entry.endTime : now;
    buckets[hour] += Math.max(0, end - entry.startTime);
  }
  const bestMs = Math.max(...buckets);
  if (bestMs <= 0) return "No peak yet";
  const bestHour = buckets.indexOf(bestMs);
  return `${formatHour(bestHour)}-${formatHour((bestHour + 1) % 24)}`;
}

function getTaskEnergy(task: Intention | null): EnergyLevel | null {
  return task?.energy ?? null;
}

function energyLabel(energy: EnergyLevel | null): string | null {
  if (!energy) return null;
  if (energy === "high") return "high energy";
  if (energy === "medium") return "medium energy";
  if (energy === "low") return "low energy";
  return "scattered energy";
}

function taskInputFromIntention(intention: Intention, minutes: number): PomodoroTaskInput {
  return {
    intentionId: intention.id,
    intentionText: intention.text,
    targetMs: msFromMinutes(minutes),
    energy: intention.energy ?? null,
  };
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="hit-area w-9 h-9 rounded-xl glass-control text-[var(--color-text-muted)] flex items-center justify-center active:scale-95 transition-all disabled:opacity-35 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export default function FocusPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<PomodoroState | null>(() =>
    typeof window === "undefined" ? null : getPomodoroState()
  );
  const [queue, setQueue] = useState<PomodoroQueueItem[]>(() =>
    typeof window === "undefined" ? [] : getPomodoroQueue()
  );
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedMinutes, setSelectedMinutes] = useState<number>(DEFAULT_DURATION_MINUTES);
  const [now, setNow] = useState(Date.now());
  const [completionMode, setCompletionMode] = useState(false);
  const [readyNextId, setReadyNextId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const autoStartedRef = useRef(false);
  const nextCueRef = useRef<string | null>(null);

  const refreshData = useCallback(async () => {
    const today = toLocalDateStr(new Date());
    const [activeIntentions, todayEntries] = await Promise.all([
      getActiveIntentions(),
      getEntriesByDate(today),
    ]);
    setIntentions(activeIntentions);
    setEntries(todayEntries);
  }, []);

  useEffect(() => {
    setSoundEnabled(getPomodoroSoundEnabled());
    refreshData();

    const syncPomodoro = () => setState(getPomodoroState());
    const syncQueue = () => setQueue(getPomodoroQueue());
    const syncSound = () => setSoundEnabled(getPomodoroSoundEnabled());
    const syncData = () => void refreshData();

    window.addEventListener(POMODORO_EVENT, syncPomodoro);
    window.addEventListener(POMODORO_QUEUE_EVENT, syncQueue);
    window.addEventListener("pomodoro-sound-updated", syncSound);
    window.addEventListener("entry-updated", syncData);
    return () => {
      window.removeEventListener(POMODORO_EVENT, syncPomodoro);
      window.removeEventListener(POMODORO_QUEUE_EVENT, syncQueue);
      window.removeEventListener("pomodoro-sound-updated", syncSound);
      window.removeEventListener("entry-updated", syncData);
    };
  }, [refreshData]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const taskId = searchParams.get("task");
    if (taskId) setSelectedId(taskId);
  }, [searchParams]);

  useEffect(() => {
    if (autoStartedRef.current || state) return;
    if (searchParams.get("start") !== "burst") return;
    autoStartedRef.current = true;
    void startPomodoroSession(focusBurstTask());
    router.replace("/focus");
  }, [router, searchParams, state]);

  useEffect(() => {
    if (!state) {
      setCompletionMode(false);
      setConfirmCancel(false);
      return;
    }

    const remaining = getRemainingMs(state, now);
    if (remaining > 0 || state.pausedAt != null) {
      setCompletionMode(false);
      return;
    }

    if (!state.notifiedAt) {
      markPomodoroNotified(state);
      playPomodoroSound("complete");
      notifyPomodoroComplete(state.intentionText);
    }
    setCompletionMode(true);

    const next = queue[0] ?? null;
    setReadyNextId(next?.id ?? null);
    if (next && nextCueRef.current !== next.id) {
      nextCueRef.current = next.id;
      playPomodoroSound("next");
    }
  }, [state, now, queue]);

  const activeEntry = entries.find((entry) => entry.endTime === 0) ?? null;
  const hasNonPomodoroActive = !!activeEntry && (!state || activeEntry.id !== state.entryId);
  const selectedIntention = intentions.find((intention) => intention.id === selectedId) ?? null;
  const readyNext = readyNextId ? queue.find((item) => item.id === readyNextId) ?? null : null;
  const paused = state ? isPaused(state) : false;
  const remaining = state ? getRemainingMs(state, now) : 0;
  const elapsed = state ? getElapsedMs(state, now) : 0;
  const progress = state ? Math.min(1, Math.max(0, 1 - remaining / state.targetMs)) : 0;
  const awaitingCompletion = !!state && completionMode;

  const queuedIntentionIds = useMemo(
    () => new Set(queue.map((item) => item.intentionId).filter((id): id is string => !!id)),
    [queue]
  );
  const currentIntentionId = state?.intentionId ?? null;
  const selectedIsCurrent = !!selectedId && selectedId === currentIntentionId;
  const selectedIsQueued = !!selectedId && queuedIntentionIds.has(selectedId);
  const selectedIsDuplicate = selectedIsCurrent || selectedIsQueued;

  const todayFocusMs = useMemo(
    () =>
      entries.reduce((total, entry) => {
        if (!entry.startTime) return total;
        const end = entry.endTime > 0 ? entry.endTime : now;
        return total + Math.max(0, end - entry.startTime);
      }, 0),
    [entries, now]
  );

  const peakHour = useMemo(() => getPeakHour(entries, now), [entries, now]);

  const whyTitle = state
    ? `You're ${formatDurationShort(elapsed)} in.`
    : readyNext
      ? "Your next session is lined up."
      : "Pick one thread and let the rest wait.";
  const whyDetail = state
    ? "Switching now costs warm-up. Trust the present session."
    : readyNext
      ? readyNext.intentionText
      : "The queue can hold the noise while you stay with one task.";

  const startTask = async (task: PomodoroTaskInput) => {
    if (busy || hasNonPomodoroActive) return;
    setBusy(true);
    try {
      await startPomodoroSession(task);
      setCompletionMode(false);
      setReadyNextId(null);
    } finally {
      setBusy(false);
    }
  };

  const handleStartSelected = async () => {
    if (awaitingCompletion) return;
    if (!selectedIntention || selectedIsDuplicate) return;
    const task = taskInputFromIntention(selectedIntention, selectedMinutes);
    if (state && !completionMode) {
      setBusy(true);
      try {
        await switchPomodoroSession(state, task);
      } finally {
        setBusy(false);
      }
      return;
    }
    await startTask(task);
  };

  const handleStartBurst = async () => {
    if (awaitingCompletion) return;
    if (state && !completionMode) {
      setBusy(true);
      try {
        await switchPomodoroSession(state, focusBurstTask());
      } finally {
        setBusy(false);
      }
      return;
    }
    await startTask(focusBurstTask());
  };

  const handleQueueSelected = () => {
    if (!selectedIntention || selectedIsDuplicate) return;
    enqueuePomodoroTask({
      intentionId: selectedIntention.id,
      intentionText: selectedIntention.text,
      targetMs: msFromMinutes(selectedMinutes),
    });
  };

  const handleFinish = async (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (!state || busy) return;
    setBusy(true);
    try {
      if (event) {
        const rect = event.currentTarget.getBoundingClientRect();
        confettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
      await finishPomodoroSession(state);
      setCompletionMode(false);
      await refreshData();
    } finally {
      setBusy(false);
    }
  };

  const handleFinishAndStartNext = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!state || !readyNext || busy) return;
    setBusy(true);
    try {
      const rect = event.currentTarget.getBoundingClientRect();
      confettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      await finishPomodoroSession(state);
      const next = popNextPomodoroQueueItem();
      if (next) {
        const intention = intentions.find((item) => item.id === next.intentionId) ?? null;
        await startPomodoroSession({
          ...taskFromQueueItem(next),
          energy: getTaskEnergy(intention),
        });
      }
      setReadyNextId(null);
      setCompletionMode(false);
      await refreshData();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOnly = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      await savePomodoroWithoutCompleting(state);
      setCompletionMode(false);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      await cancelPomodoroSession(state);
      setConfirmCancel(false);
      setCompletionMode(false);
    } finally {
      setBusy(false);
    }
  };

  const togglePause = () => {
    if (!state || completionMode) return;
    if (paused) {
      resumePomodoro();
      playPomodoroSound("resume");
    } else {
      pausePomodoro();
      playPomodoroSound("pause");
    }
  };

  const moveQueueItem = (id: string, direction: -1 | 1) => {
    const index = queue.findIndex((item) => item.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= queue.length) return;
    const ids = queue.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(nextIndex, 0, moved);
    reorderPomodoroQueue(ids);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setPomodoroSoundEnabled(next);
    if (next) playPomodoroSound("resume");
  };

  const activeLabel = completionMode
    ? "Complete"
    : paused
      ? "Paused"
      : state
        ? state.mode === "burst"
          ? "Focus burst"
          : "In focus"
        : "Ready";

  return (
    <div className="flex flex-col gap-4 pb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5 lg:items-start">
      <section className="glass-panel rounded-[2rem] border border-[var(--glass-border)] p-4 sm:p-6 lg:p-8 overflow-hidden relative min-h-[36rem] flex flex-col">
        <div className="absolute inset-0 pointer-events-none opacity-70 bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.5),transparent_38%)]" />
        <div className="relative z-10 grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-center flex-1">
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl bg-white/45 border border-white/65 px-4 py-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                Why you're here
              </p>
              <h1 className="text-3xl sm:text-5xl font-black leading-[0.95] mt-2">
                {whyTitle}
              </h1>
              <p className="text-sm sm:text-base text-[var(--color-text-muted)] leading-snug mt-3">
                {whyDetail}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white/40 border border-white/60 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                  So far today
                </p>
                <p className="text-3xl font-black tabular-nums leading-none mt-2">
                  {formatDurationShort(todayFocusMs)}
                </p>
              </div>
              <div className="rounded-3xl bg-white/40 border border-white/60 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                  Peak
                </p>
                <p className="text-xl font-black tabular-nums leading-none mt-2">
                  {peakHour}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-5">
            <div
              className={`focus-orb-wrap ${state && !paused && !completionMode ? "is-running" : ""}`}
              style={{
                "--focus-progress": `${progress * 360}deg`,
              } as React.CSSProperties & { "--focus-progress": string }}
            >
              <div className="focus-orb">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">
                  {activeLabel}
                </span>
                <span className="text-6xl sm:text-7xl font-black tabular-nums leading-none text-white">
                  {state ? formatCountdown(remaining) : "25:00"}
                </span>
                <span className="max-w-[14rem] text-center text-sm font-semibold text-white/90 truncate">
                  {state?.intentionText ?? selectedIntention?.text ?? "Choose a task"}
                </span>
              </div>
            </div>

            <div className="w-full max-w-xl rounded-3xl bg-white/45 border border-white/65 px-4 py-4">
              {state ? (
                <>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                        {completionMode ? "Session complete" : "Current task"}
                      </p>
                      <p className="text-lg font-black truncate mt-1">
                        {state.intentionText}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        started {new Date(state.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleSound}
                      className="h-10 px-3 rounded-xl glass-control text-xs font-bold text-[var(--color-text-muted)] active:scale-[0.98] transition-all"
                    >
                      Sound {soundEnabled ? "on" : "off"}
                    </button>
                  </div>

                  {completionMode ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {readyNext ? (
                        <button
                          type="button"
                          onClick={handleFinishAndStartNext}
                          disabled={busy}
                          className="h-12 rounded-xl bg-[image:var(--color-accent-gradient)] text-[var(--color-on-accent)] text-sm font-black active:scale-[0.98] transition-all disabled:opacity-60"
                        >
                          Tick off + start next
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleFinish}
                          disabled={busy}
                          className="h-12 rounded-xl bg-[image:var(--color-accent-gradient)] text-[var(--color-on-accent)] text-sm font-black active:scale-[0.98] transition-all disabled:opacity-60"
                        >
                          {state.mode === "burst" ? "Save session" : "Tick it off"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={state.mode === "burst" ? () => setConfirmCancel(true) : handleSaveOnly}
                        disabled={busy}
                        className="h-12 rounded-xl glass-control text-sm font-bold text-[var(--color-text-muted)] active:scale-[0.98] transition-all disabled:opacity-60"
                      >
                        {state.mode === "burst" ? "Discard" : "Keep open"}
                      </button>
                    </div>
                  ) : confirmCancel ? (
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Cancel this session?
                      </p>
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={busy}
                        className="h-11 px-4 rounded-xl bg-[var(--color-danger)] text-white text-sm font-bold active:scale-[0.98] transition-all"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                        className="h-11 px-4 rounded-xl glass-control text-sm font-bold active:scale-[0.98] transition-all"
                      >
                        Keep going
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={togglePause}
                        className="h-11 rounded-xl glass-control text-sm font-bold active:scale-[0.98] transition-all"
                      >
                        {paused ? "Resume" : "Pause"}
                      </button>
                      <button
                        type="button"
                        onClick={handleFinish}
                        disabled={busy}
                        className="h-11 rounded-xl bg-[image:var(--color-accent-gradient)] text-[var(--color-on-accent)] text-sm font-black active:scale-[0.98] transition-all disabled:opacity-60"
                      >
                        Finish
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(true)}
                        className="h-11 rounded-xl glass-control text-sm font-bold text-[var(--color-text-muted)] active:scale-[0.98] transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              ) : readyNext ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                      Up next
                    </p>
                    <p className="text-lg font-black truncate mt-1">
                      {readyNext.intentionText}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {minutesFromMs(readyNext.targetMs)} min
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const next = popNextPomodoroQueueItem();
                      if (!next) return;
                      const intention = intentions.find((item) => item.id === next.intentionId) ?? null;
                      await startTask({ ...taskFromQueueItem(next), energy: getTaskEnergy(intention) });
                      setReadyNextId(null);
                    }}
                    disabled={busy || hasNonPomodoroActive}
                    className="h-12 px-5 rounded-xl bg-[image:var(--color-accent-gradient)] text-[var(--color-on-accent)] text-sm font-black active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    Start next
                  </button>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleStartSelected}
                    disabled={!selectedIntention || selectedIsDuplicate || busy || hasNonPomodoroActive || awaitingCompletion}
                    className="h-12 rounded-xl bg-[image:var(--color-accent-gradient)] text-[var(--color-on-accent)] text-sm font-black active:scale-[0.98] transition-all disabled:opacity-45"
                  >
                    Start Pomodoro
                  </button>
                  <button
                    type="button"
                    onClick={handleStartBurst}
                    disabled={busy || hasNonPomodoroActive}
                    className="h-12 rounded-xl glass-control text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-45"
                  >
                    Just Start
                  </button>
                </div>
              )}

              {hasNonPomodoroActive && (
                <p className="mt-3 text-xs font-semibold text-[var(--color-danger)]">
                  Finish the active timer on Now before starting a focus session here.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <section className="glass-panel rounded-[2rem] border border-[var(--glass-border)] p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                Task picker
              </p>
              <h2 className="text-xl font-black">Select focus</h2>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              className="h-10 px-3 rounded-xl glass-control text-xs font-bold text-[var(--color-text-muted)] active:scale-[0.98] transition-all"
            >
              {soundEnabled ? "Sound on" : "Muted"}
            </button>
          </div>

          <label htmlFor="focus-task" className="sr-only">Task</label>
          <select
            id="focus-task"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full h-12 rounded-xl bg-white/55 border border-white/65 px-3 text-sm font-semibold text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/35"
          >
            <option value="">Choose a task</option>
            {intentions.map((intention) => {
              const duplicate =
                intention.id === currentIntentionId || queuedIntentionIds.has(intention.id);
              const suffix = duplicate
                ? intention.id === currentIntentionId
                  ? " (current)"
                  : " (queued)"
                : "";
              return (
                <option key={intention.id} value={intention.id} disabled={duplicate}>
                  {intention.text}{suffix}
                </option>
              );
            })}
          </select>

          <div className="grid grid-cols-3 gap-2 mt-3">
            {POMODORO_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setSelectedMinutes(minutes)}
                className={`h-11 rounded-xl text-sm font-black active:scale-[0.98] transition-all ${
                  selectedMinutes === minutes
                    ? "bg-[var(--color-text)] text-[var(--color-bg)]"
                    : "glass-control text-[var(--color-text-muted)]"
                }`}
              >
                {minutes === 60 ? "1 hr" : `${minutes}m`}
              </button>
            ))}
          </div>

          {selectedIntention && (
            <p className="mt-3 text-xs text-[var(--color-text-muted)] truncate">
              {[selectedIntention.text, energyLabel(selectedIntention.energy ?? null)].filter(Boolean).join(" · ")}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={handleStartSelected}
              disabled={!selectedIntention || selectedIsDuplicate || busy || hasNonPomodoroActive || awaitingCompletion}
              className="h-11 rounded-xl bg-[image:var(--color-accent-gradient)] text-[var(--color-on-accent)] text-sm font-black active:scale-[0.98] transition-all disabled:opacity-45"
            >
              {state && !completionMode ? "Switch" : "Start"}
            </button>
            <button
              type="button"
              onClick={handleQueueSelected}
              disabled={!selectedIntention || selectedIsDuplicate}
              className="h-11 rounded-xl glass-control text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-45"
            >
              Queue
            </button>
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] border border-[var(--glass-border)] p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                Up next
              </p>
              <h2 className="text-xl font-black">{queue.length} queued</h2>
            </div>
            <button
              type="button"
              onClick={handleStartBurst}
              disabled={busy || hasNonPomodoroActive || awaitingCompletion}
              className="h-10 px-3 rounded-xl glass-control text-xs font-bold active:scale-[0.98] transition-all disabled:opacity-45"
            >
              Just Start
            </button>
          </div>

          {queue.length === 0 ? (
            <div className="rounded-2xl bg-white/40 border border-white/60 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">
                No queued tasks.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {queue.map((item, index) => (
                <div
                  key={item.id}
                  className={`rounded-2xl px-3 py-3 border transition-colors ${
                    index === 0
                      ? "bg-white/65 border-white/80 shadow-sm"
                      : "bg-white/35 border-white/55"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-[image:var(--color-accent-gradient)] text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black truncate">{item.intentionText}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {minutesFromMs(item.targetMs)} min
                      </p>
                    </div>
                    <IconButton
                      label="Move up"
                      onClick={() => moveQueueItem(item.id, -1)}
                      disabled={index === 0}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 15l-6-6-6 6" />
                      </svg>
                    </IconButton>
                    <IconButton
                      label="Move down"
                      onClick={() => moveQueueItem(item.id, 1)}
                      disabled={index === queue.length - 1}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </IconButton>
                    <IconButton
                      label="Remove from queue"
                      onClick={() => removePomodoroQueueItem(item.id)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
