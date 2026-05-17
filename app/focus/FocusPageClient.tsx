"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  getActiveIntentions,
  getEntriesByDate,
  toLocalDateStr,
  type Entry,
  type EnergyLevel,
  type Habit,
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
import { useIntentionCategories } from "@/lib/useIntentionCategories";
import { useHabits } from "@/lib/useHabits";

const DEFAULT_DURATION_MINUTES = 25;
const FALLBACK_BUCKET_COLOR = "#a1a1aa";
const MIN_TIMER_MINUTES = 1;
const MAX_TIMER_MINUTES = 180;

const navLinks = [
  { href: "/", label: "Now" },
  { href: "/focus", label: "Focus" },
  { href: "/timeline", label: "Timeline" },
  { href: "/analysis", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

function msFromMinutes(minutes: number): number {
  return minutes * 60 * 1000;
}

function minutesFromMs(ms: number): number {
  return Math.round(ms / 60000);
}

function clampTimerMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_DURATION_MINUTES;
  return Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, Math.round(minutes)));
}

function formatTimerChoice(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatDurationShort(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDurationStat(ms: number): { value: string; unit: string } {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  if (totalMinutes < 60) return { value: String(totalMinutes), unit: "m" };
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    value: minutes > 0 ? `${hours}:${String(minutes).padStart(2, "0")}` : String(hours),
    unit: "h",
  };
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

function taskInputFromHabit(habit: Habit, minutes: number): PomodoroTaskInput {
  return {
    intentionId: null,
    habitId: habit.id,
    intentionText: habit.name,
    targetMs: msFromMinutes(minutes),
    energy: null,
  };
}

export default function FocusPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const intentionCategories = useIntentionCategories();
  const habits = useHabits();
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
  const [timerDraft, setTimerDraft] = useState<string>(String(DEFAULT_DURATION_MINUTES));
  const [openBucketId, setOpenBucketId] = useState<string | null>(null);
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);
  const [habitPickerOpen, setHabitPickerOpen] = useState(false);
  const [queuePanelOpen, setQueuePanelOpen] = useState(false);
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
    if (!openBucketId && !timerPickerOpen && !habitPickerOpen && !queuePanelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenBucketId(null);
        setTimerPickerOpen(false);
        setHabitPickerOpen(false);
        setQueuePanelOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openBucketId, timerPickerOpen, habitPickerOpen, queuePanelOpen]);

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
  const firstQueued = queue[0] ?? null;
  const upNext = readyNext ?? firstQueued;
  const paused = state ? isPaused(state) : false;
  const remaining = state ? getRemainingMs(state, now) : 0;
  const elapsed = state ? getElapsedMs(state, now) : 0;
  const progress = state ? Math.min(1, Math.max(0, 1 - remaining / state.targetMs)) : 0;
  const awaitingCompletion = !!state && completionMode;

  const queuedIntentionIds = useMemo(
    () => new Set(queue.map((item) => item.intentionId).filter((id): id is string => !!id)),
    [queue]
  );
  const queuedHabitIds = useMemo(
    () => new Set(queue.map((item) => item.habitId).filter((id): id is string => !!id)),
    [queue]
  );
  const currentIntentionId = state?.intentionId ?? null;
  const currentHabitId = state?.habitId ?? null;
  const activeIsHabit = !!currentHabitId;
  const selectedIsCurrent = !!selectedId && selectedId === currentIntentionId;
  const selectedIsQueued = !!selectedId && queuedIntentionIds.has(selectedId);
  const selectedIsDuplicate = selectedIsCurrent || selectedIsQueued;
  const selectedIsPickedInitial = !!selectedIntention && !state;
  const activeIntention = currentIntentionId
    ? intentions.find((intention) => intention.id === currentIntentionId) ?? null
    : null;
  const displayedEnergy =
    (activeIsHabit
      ? "habit"
      : energyLabel((state ? getTaskEnergy(activeIntention) : selectedIntention?.energy ?? null) ?? null)) ??
    "energy open";
  const selectedDurationMs = msFromMinutes(selectedMinutes);
  const upNextIntention = upNext?.intentionId
    ? intentions.find((intention) => intention.id === upNext.intentionId) ?? null
    : null;
  const upNextHabit = upNext?.habitId
    ? habits.find((habit) => habit.id === upNext.habitId) ?? null
    : null;
  const upNextEnergyLabel = upNextHabit
    ? "habit"
    : energyLabel(getTaskEnergy(upNextIntention)) ?? "energy open";
  const canStartSelectedFromPill =
    selectedIsPickedInitial && !selectedIsDuplicate && !hasNonPomodoroActive && !awaitingCompletion;
  const canQueueSelected = !!selectedIntention && !selectedIsDuplicate && !selectedIsPickedInitial;
  const upNextActionLabel = canQueueSelected
    ? "Queue"
    : canStartSelectedFromPill
      ? "Start"
    : upNext
      ? state
        ? completionMode
          ? "Start"
          : "Switch"
        : "Start"
      : "Queue";

  const dockBuckets = useMemo(() => {
    const byCategory = intentionCategories
      .map((category) => ({
        id: category.id,
        label: category.name,
        color: category.color,
        intentions: intentions.filter((intention) => intention.categoryId === category.id),
      }))
      .filter((bucket) => bucket.intentions.length > 0);

    const uncategorized = intentions.filter(
      (intention) =>
        !intention.categoryId ||
        !intentionCategories.some((category) => category.id === intention.categoryId)
    );

    const buckets = [
      ...byCategory,
      ...(uncategorized.length > 0 || byCategory.length === 0
        ? [
            {
              id: "uncategorized",
              label: byCategory.length === 0 ? "Tasks" : "Loose",
              color: FALLBACK_BUCKET_COLOR,
              intentions: uncategorized.length > 0 ? uncategorized : intentions,
            },
          ]
        : []),
    ];

    return buckets.slice(0, 4);
  }, [intentionCategories, intentions]);
  const activePickerBucket = openBucketId
    ? dockBuckets.find((bucket) => bucket.id === openBucketId) ?? null
    : null;

  const todayFocusMs = useMemo(
    () =>
      entries.reduce((total, entry) => {
        if (!entry.startTime) return total;
        const end = entry.endTime > 0 ? entry.endTime : now;
        return total + Math.max(0, end - entry.startTime);
      }, 0),
    [entries, now]
  );
  const todayFocusStat = formatDurationStat(todayFocusMs);

  const peakHour = useMemo(() => getPeakHour(entries, now), [entries, now]);
  const todayDateStr = toLocalDateStr(new Date(now));

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

  const closeFloatingPanels = () => {
    setOpenBucketId(null);
    setTimerPickerOpen(false);
    setHabitPickerOpen(false);
    setQueuePanelOpen(false);
  };

  const setTimerMinutes = useCallback((minutes: number) => {
    const normalized = clampTimerMinutes(minutes);
    setSelectedMinutes(normalized);
    setTimerDraft(String(normalized));
  }, []);

  const handleTimerDraftChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 3);
    setTimerDraft(digits);
    if (!digits) return;
    setSelectedMinutes(clampTimerMinutes(Number(digits)));
  };

  const commitTimerDraft = () => {
    setTimerMinutes(timerDraft ? Number(timerDraft) : selectedMinutes);
  };

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
    const burstTask = {
      ...focusBurstTask(),
      targetMs: msFromMinutes(selectedMinutes),
    };
    if (state && !completionMode) {
      setBusy(true);
      try {
        await switchPomodoroSession(state, burstTask);
      } finally {
        setBusy(false);
      }
      return;
    }
    await startTask(burstTask);
  };

  const handleQueueSelected = () => {
    if (!selectedIntention || selectedIsDuplicate) return;
    const queued = enqueuePomodoroTask({
      intentionId: selectedIntention.id,
      intentionText: selectedIntention.text,
      targetMs: msFromMinutes(selectedMinutes),
    });
    if (queued && queue.length === 0 && !readyNextId) setReadyNextId(queued.id);
  };

  const handleQueueIntention = (intention: Intention) => {
    const isCurrent = intention.id === currentIntentionId;
    const isQueued = queuedIntentionIds.has(intention.id);
    const isPickedInitial = !state && intention.id === selectedId;
    if (isCurrent || isQueued || isPickedInitial) return;
    const queued = enqueuePomodoroTask({
      intentionId: intention.id,
      intentionText: intention.text,
      targetMs: msFromMinutes(selectedMinutes),
    });
    if (queued && queue.length === 0 && !readyNextId) setReadyNextId(queued.id);
  };

  const handleQueueHabit = (habit: Habit) => {
    const isCurrent = habit.id === currentHabitId;
    const isQueued = queuedHabitIds.has(habit.id);
    if (isCurrent || isQueued) return;
    const queued = enqueuePomodoroTask(taskInputFromHabit(habit, selectedMinutes));
    if (queued && queue.length === 0 && !readyNextId) setReadyNextId(queued.id);
  };

  const handleStartHabit = async (habit: Habit) => {
    if (awaitingCompletion || busy || hasNonPomodoroActive || habit.id === currentHabitId) return;
    const queuedMatch = queue.find((item) => item.habitId === habit.id);
    if (queuedMatch) removePomodoroQueueItem(queuedMatch.id);
    const task = taskInputFromHabit(habit, selectedMinutes);
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
    setHabitPickerOpen(false);
  };

  const startQueuedItem = async (item: PomodoroQueueItem) => {
    if (busy || hasNonPomodoroActive) return;
    setBusy(true);
    try {
      removePomodoroQueueItem(item.id);
      const intention = item.intentionId
        ? intentions.find((candidate) => candidate.id === item.intentionId) ?? null
        : null;
      const task = {
        ...taskFromQueueItem(item),
        energy: getTaskEnergy(intention),
      };
      if (state && completionMode) {
        await finishPomodoroSession(state);
        await startPomodoroSession(task);
      } else if (state) {
        await switchPomodoroSession(state, task);
      } else {
        await startPomodoroSession(task);
      }
      setReadyNextId(null);
      setCompletionMode(false);
      await refreshData();
    } finally {
      setBusy(false);
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

  const handleOpenBucket = (bucketId: string) => {
    setTimerPickerOpen(false);
    setHabitPickerOpen(false);
    setQueuePanelOpen(false);
    setOpenBucketId((current) => (current === bucketId ? null : bucketId));
  };

  const handleOpenTimerPicker = () => {
    setOpenBucketId(null);
    setHabitPickerOpen(false);
    setQueuePanelOpen(false);
    setTimerPickerOpen((current) => !current);
  };

  const handleOpenHabits = () => {
    setOpenBucketId(null);
    setTimerPickerOpen(false);
    setQueuePanelOpen(false);
    setHabitPickerOpen((current) => !current);
  };

  const handleOpenQueue = () => {
    setOpenBucketId(null);
    setTimerPickerOpen(false);
    setHabitPickerOpen(false);
    setQueuePanelOpen((current) => !current);
  };

  const handleStartSelectedFromPicker = async () => {
    await handleStartSelected();
    if (selectedIntention && !selectedIsDuplicate && !hasNonPomodoroActive && !awaitingCompletion) {
      setOpenBucketId(null);
    }
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

  const handleFinishAndStartNext = async (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (!state || !upNext || busy) return;
    setBusy(true);
    try {
      if (event) {
        const rect = event.currentTarget.getBoundingClientRect();
        confettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
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

  const handleStartQueued = async () => {
    if (!upNext) return;
    await startQueuedItem(upNext);
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

  const toggleSound = () => {
    const next = !soundEnabled;
    setPomodoroSoundEnabled(next);
    if (next) playPomodoroSound("resume");
  };

  const openBrainDump = () => {
    router.push("/?capture=plan");
  };

  const activeLabel = completionMode
    ? "Complete"
    : paused
      ? "Paused"
      : state
        ? state.habitId
          ? "Habit focus"
          : state.mode === "burst"
          ? "Focus burst"
          : "In focus"
        : "Ready";

  return (
    <div className="fixed inset-0 z-[50] flex flex-col pointer-events-auto bg-[var(--color-bg)] bg-[image:var(--app-base-gradient)] text-[var(--color-text)]">
      <div className="absolute inset-0 z-0 pointer-events-none noise-bg" />
      <div className="absolute inset-0 z-0 pointer-events-none gradient-mesh opacity-90" />
      <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.7),transparent_50%)]" />

      {/* Top Nav Pill */}
      <div className="relative z-20 flex justify-center pt-6 px-4">
        <div className="glass-panel flex items-center h-12 px-2 rounded-full shadow-sm text-sm font-medium border border-white/60 max-w-full">
          <Link href="/" className="flex items-center gap-1.5 px-3 rounded-full hover:bg-white/20 transition-colors h-8 flex-shrink-0">
            <span className="text-[var(--color-accent)] text-lg leading-none" aria-hidden="true">✦</span>
            <span className="font-semibold text-[#1A1640]">ADDit</span>
          </Link>
          <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
          <nav aria-label="Primary" className="flex items-center gap-1 px-1 overflow-x-auto scrollbar-hide">
            {navLinks.map((link) => {
              const active =
                pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`px-3 rounded-full transition-colors h-8 flex items-center whitespace-nowrap ${
                    active
                      ? "bg-[#1A1640] text-white"
                      : "text-[var(--color-text-muted)] hover:bg-white/20 hover:text-[#1A1640]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="w-px h-4 bg-[var(--color-border)] mx-1" />
          <div className="hidden sm:block px-3 text-[var(--color-text-muted)] text-xs font-medium tabular-nums whitespace-nowrap">
            {new Date(now).toLocaleDateString(undefined, { weekday: "short" })} - {new Date(now).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundEnabled ? "Mute focus sounds" : "Enable focus sounds"}
            title={soundEnabled ? "Sound on" : "Sound off"}
            className="h-8 w-8 rounded-full text-[var(--color-text-muted)] hover:bg-white/20 hover:text-[#1A1640] active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
          >
            {soundEnabled ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5z" />
                <path d="m22 9-6 6" />
                <path d="m16 9 6 6" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Floating Left Card */}
      <div className="absolute left-6 xl:left-12 top-1/2 -translate-y-1/2 w-64 p-5 glass-panel rounded-3xl hidden lg:block z-20 border border-white/60">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)] mb-2">Why you're here</p>
        <p className="text-sm font-semibold leading-snug">
          {whyTitle}
        </p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-2 leading-relaxed">
          {whyDetail}
        </p>
      </div>

      {/* Floating Right Card */}
      <div className="absolute right-6 xl:right-12 top-1/2 -translate-y-1/2 w-64 p-5 glass-panel rounded-3xl hidden lg:block z-20 border border-white/60">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)] mb-2">So far today</p>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-3xl font-semibold tabular-nums">{todayFocusStat.value}</span>
          <span className="text-lg font-medium text-[var(--color-text-muted)]">{todayFocusStat.unit}</span>
        </div>
        <div className="flex gap-1 mt-3 h-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`flex-1 rounded-sm ${i < 5 ? 'bg-gradient-to-b from-[#F472B6] to-[#FBBF24] opacity-80' : 'bg-white/40'}`} />
          ))}
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-3">
          Peak was {peakHour} ✦
        </p>
      </div>

      {/* Center Layout */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 -mt-10">
        <div
          className={`focus-orb-wrap ${state && !paused && !completionMode ? "is-running" : ""}`}
          style={{ "--focus-progress": `${progress * 360}deg` } as React.CSSProperties & { "--focus-progress": string }}
        >
          <div className="focus-orb text-center p-8">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mb-2">
              {activeLabel} {state?.mode === "burst" && !state.habitId ? "" : "· FOCUS"}
            </span>
            <span className="text-7xl sm:text-[7.5rem] font-display-serif tabular-nums leading-none text-[#1A1640] -ml-2 mb-4">
              {state ? formatCountdown(remaining) : formatCountdown(selectedDurationMs)}
            </span>
            <span className="max-w-[20rem] text-lg sm:text-xl font-semibold text-[#1A1640] truncate px-4">
              {state?.intentionText ?? selectedIntention?.text ?? "Choose a task"}
            </span>
            <span className="text-xs font-medium text-[var(--color-text-muted)] mt-1 mb-6">
              {state
                ? `started ${new Date(state.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                : `${selectedMinutes} min ready`} · {displayedEnergy}
            </span>

            {/* Actions inside Orb */}
            {confirmCancel ? (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <span className="text-xs font-semibold text-[#e11d48]">Cancel?</span>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="h-9 px-4 rounded-full bg-[#e11d48] text-white text-xs font-semibold shadow-sm active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="h-9 px-4 rounded-full bg-white text-xs font-semibold shadow-sm border border-white/80 active:scale-[0.98] transition-all"
                >
                  Keep going
                </button>
              </div>
            ) : completionMode && state ? (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={state.mode === "burst" && !activeIsHabit ? () => setConfirmCancel(true) : handleSaveOnly}
                  disabled={busy}
                  className="h-9 px-4 rounded-full bg-white text-xs font-semibold shadow-sm border border-white/80 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {state.mode === "burst" && !activeIsHabit ? "Discard" : "Save only"}
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={busy}
                  className="h-9 px-5 rounded-full bg-[#1A1640] text-white text-xs font-semibold shadow-sm active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {state.mode === "burst" && !activeIsHabit ? "Save session" : "Tick off"}
                </button>
                <button
                  type="button"
                  onClick={handleFinishAndStartNext}
                  disabled={busy || !upNext}
                  className="h-9 px-4 rounded-full text-xs font-semibold text-[#1A1640] hover:bg-white/30 active:scale-[0.98] transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                >
                  Start next
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={state ? togglePause : handleStartBurst}
                  disabled={busy || (!state && hasNonPomodoroActive)}
                  className="h-9 px-4 rounded-full bg-white text-xs font-semibold shadow-sm border border-white/80 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center gap-1.5"
                >
                  {state ? (
                    paused ? (
                      "Resume"
                    ) : (
                      <>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        Pause
                      </>
                    )
                  ) : (
                    "Just Start"
                  )}
                </button>
                <button
                  type="button"
                  onClick={state ? handleFinish : handleStartSelected}
                  disabled={
                    busy ||
                    (state ? false : !selectedIntention || selectedIsDuplicate || hasNonPomodoroActive)
                  }
                  className="h-9 px-5 rounded-full bg-[#1A1640] text-white text-xs font-semibold shadow-sm active:scale-[0.98] transition-all disabled:opacity-60 flex items-center gap-1.5"
                >
                  {state ? "Finish" : "Start"} ✔
                </button>
                <button
                  type="button"
                  onClick={state ? () => setConfirmCancel(true) : handleQueueSelected}
                  disabled={!state && (!selectedIntention || selectedIsDuplicate)}
                  className={`h-9 px-4 rounded-full text-xs font-semibold hover:bg-white/30 active:scale-[0.98] transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
                    state ? "text-[#e11d48]" : "text-[#1A1640]"
                  }`}
                >
                  {state ? "Cancel" : "Queue"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Up Next Pill below orb */}
        <div className="mt-8 max-w-full">
          <div className="glass-panel h-10 rounded-full flex items-center px-1.5 shadow-sm border border-white/60 max-w-full overflow-hidden">
             <div className="h-7 px-3 rounded-full bg-white/50 flex items-center text-[9px] font-semibold tracking-widest text-[#7C3AED] uppercase mr-3 ml-1">
               Up Next
             </div>
             <span className="text-sm font-medium text-[#1A1640] truncate max-w-[90px] sm:max-w-[200px]">
               {upNext?.intentionText ?? selectedIntention?.text ?? "Add something"}
             </span>
             <span className="hidden sm:inline text-xs font-medium text-[var(--color-text-muted)] ml-3 mr-3 whitespace-nowrap">
               ~{upNext ? minutesFromMs(upNext.targetMs) : selectedMinutes} min · {upNext ? upNextEnergyLabel : displayedEnergy}
             </span>
             {upNext && (
               <button
                 type="button"
                 aria-label="Remove up next"
                 title="Remove up next"
                 onClick={() => removePomodoroQueueItem(upNext.id)}
                 className="h-7 w-7 rounded-full text-[#1A1640]/55 hover:bg-white/40 hover:text-[#e11d48] active:scale-[0.95] transition-all"
               >
                 ×
               </button>
             )}
             <button
               type="button"
               className="h-7 px-4 rounded-full bg-[#1A1640] text-white text-xs font-semibold ml-auto flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
               onClick={
                 canStartSelectedFromPill
                   ? handleStartSelected
                   : canQueueSelected
                     ? handleQueueSelected
                     : handleStartQueued
               }
               disabled={busy || (!canStartSelectedFromPill && !canQueueSelected && !upNext)}
             >
               {upNextActionLabel}
             </button>
          </div>
        </div>
        {hasNonPomodoroActive && (
          <p className="mt-3 text-xs font-semibold text-[#e11d48]">
            Finish the active Now timer before starting focus here.
          </p>
        )}
      </div>

      {(activePickerBucket || timerPickerOpen || habitPickerOpen || queuePanelOpen) && (
        <button
          type="button"
          aria-label="Close focus popup"
          className="absolute inset-0 z-[15] cursor-default"
          onClick={closeFloatingPanels}
        />
      )}

      {activePickerBucket && (
        <div className="absolute inset-x-0 bottom-24 z-[30] flex justify-center px-4 pointer-events-none">
          <section
            role="dialog"
            aria-label={`${activePickerBucket.label} tasks`}
            className="glass-panel pointer-events-auto w-full max-w-xl rounded-[2rem] border border-white/60 shadow-[0_28px_90px_-34px_rgba(40,20,80,0.38)] p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div
                className="mt-1 h-9 w-9 rounded-full flex-shrink-0 shadow-sm ring-1 ring-white/70"
                style={{
                  background: `linear-gradient(135deg, color-mix(in srgb, ${activePickerBucket.color} 85%, white), ${activePickerBucket.color})`,
                }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Choose task
                </p>
                <h2 className="text-lg font-semibold text-[#1A1640] truncate">
                  {activePickerBucket.label}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close task picker"
                onClick={() => setOpenBucketId(null)}
                className="h-9 w-9 rounded-full bg-white/45 hover:bg-white/65 text-[#1A1640]/70 hover:text-[#1A1640] active:scale-95 transition-all flex-shrink-0"
              >
                ×
              </button>
            </div>

            <div className="mt-4 max-h-[min(48vh,22rem)] overflow-y-auto pr-1 space-y-2">
              {activePickerBucket.intentions.map((intention) => {
                const selected = intention.id === selectedId;
                const isCurrent = intention.id === currentIntentionId;
                const isQueued = queuedIntentionIds.has(intention.id);
                const isPickedInitial = !state && selected;
                const queueDisabled = busy || isCurrent || isQueued || isPickedInitial;
                const queueLabel = isCurrent
                  ? "Now"
                  : isQueued
                    ? "Queued"
                    : isPickedInitial
                      ? "Picked"
                      : "Queue";
                return (
                  <div
                    key={intention.id}
                    className={`flex items-center gap-2 rounded-2xl p-1.5 transition-colors ${
                      selected ? "bg-white/60 shadow-sm" : "bg-white/30 hover:bg-white/45"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(intention.id)}
                      className="min-w-0 flex-1 rounded-xl px-3 py-2 text-left active:scale-[0.99] transition-transform"
                    >
                      <span className="block truncate text-sm font-medium text-[#1A1640]">
                        {intention.text}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-[var(--color-text-muted)]">
                        {energyLabel(intention.energy ?? null) ?? "energy open"} · {formatTimerChoice(selectedMinutes)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQueueIntention(intention)}
                      disabled={queueDisabled}
                      className={`h-9 px-3 rounded-full text-xs font-semibold active:scale-[0.97] transition-all flex-shrink-0 disabled:cursor-not-allowed ${
                        queueDisabled
                          ? "bg-white/35 text-[var(--color-text-muted)]"
                          : "bg-[#1A1640] text-white hover:shadow-sm"
                      }`}
                    >
                      {queueLabel}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartSelectedFromPicker}
                disabled={
                  busy ||
                  !selectedIntention ||
                  selectedIsDuplicate ||
                  hasNonPomodoroActive ||
                  awaitingCompletion
                }
                className="h-10 flex-1 rounded-full bg-[#1A1640] text-white text-xs font-semibold shadow-sm active:scale-[0.98] transition-all disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {state && !completionMode ? "Switch to selected" : "Start selected"}
              </button>
              <button
                type="button"
                onClick={() => setOpenBucketId(null)}
                className="h-10 px-4 rounded-full bg-white/45 hover:bg-white/65 text-xs font-semibold text-[#1A1640] active:scale-[0.98] transition-all"
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}

      {timerPickerOpen && (
        <div className="absolute inset-x-0 bottom-24 z-[30] flex justify-center px-4 pointer-events-none">
          <section
            role="dialog"
            aria-label="Timer length"
            className="glass-panel pointer-events-auto w-full max-w-sm rounded-[2rem] border border-white/60 shadow-[0_28px_90px_-34px_rgba(40,20,80,0.38)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Timer
                </p>
                <h2 className="text-lg font-semibold text-[#1A1640]">
                  {formatTimerChoice(selectedMinutes)}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close timer picker"
                onClick={() => setTimerPickerOpen(false)}
                className="h-9 w-9 rounded-full bg-white/45 hover:bg-white/65 text-[#1A1640]/70 hover:text-[#1A1640] active:scale-95 transition-all"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {POMODORO_PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => {
                    setTimerMinutes(minutes);
                    setTimerPickerOpen(false);
                  }}
                  className={`h-10 rounded-full text-xs font-semibold transition-all active:scale-[0.98] ${
                    selectedMinutes === minutes
                      ? "bg-[#1A1640] text-white"
                      : "bg-white/45 hover:bg-white/65 text-[#1A1640]"
                  }`}
                >
                  {minutes === 60 ? "1 hour" : `${minutes} min`}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  Exact minutes
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={timerDraft}
                  onChange={(event) => handleTimerDraftChange(event.currentTarget.value)}
                  onBlur={commitTimerDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitTimerDraft();
                      setTimerPickerOpen(false);
                    }
                  }}
                  className="mt-1 h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm font-semibold tabular-nums text-[#1A1640] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/45"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  commitTimerDraft();
                  setTimerPickerOpen(false);
                }}
                className="h-11 px-5 rounded-full bg-[#1A1640] text-white text-xs font-semibold active:scale-[0.98] transition-all"
              >
                Set
              </button>
            </div>
          </section>
        </div>
      )}

      {habitPickerOpen && (
        <div className="absolute inset-x-0 bottom-24 z-[30] flex justify-center px-4 pointer-events-none">
          <section
            role="dialog"
            aria-label="Habits"
            className="glass-panel pointer-events-auto w-full max-w-xl rounded-[2rem] border border-white/60 shadow-[0_28px_90px_-34px_rgba(40,20,80,0.38)] p-4 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Habits
                </p>
                <h2 className="text-lg font-semibold text-[#1A1640] truncate">
                  Add to focus
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close habits"
                onClick={() => setHabitPickerOpen(false)}
                className="h-9 w-9 rounded-full bg-white/45 hover:bg-white/65 text-[#1A1640]/70 hover:text-[#1A1640] active:scale-95 transition-all flex-shrink-0"
              >
                ×
              </button>
            </div>

            {habits.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-white/35 border border-white/60 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                No habits yet.
              </div>
            ) : (
              <div className="mt-4 max-h-[min(48vh,22rem)] overflow-y-auto pr-1 space-y-2">
                {habits.map((habit) => {
                  const isCurrent = habit.id === currentHabitId;
                  const isQueued = queuedHabitIds.has(habit.id);
                  const ticked = habit.completions.includes(todayDateStr);
                  return (
                    <div
                      key={habit.id}
                      className={`flex items-center gap-2 rounded-2xl p-1.5 transition-colors ${
                        isCurrent ? "bg-white/65 shadow-sm" : "bg-white/30 hover:bg-white/45"
                      }`}
                    >
                      <div
                        className="h-9 w-9 rounded-full flex-shrink-0 ring-1 ring-white/70"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${habit.color} ${ticked ? "82%" : "18%"}, white)`,
                          color: ticked ? "white" : habit.color,
                        }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1 px-1">
                        <p className="truncate text-sm font-medium text-[#1A1640]">{habit.name}</p>
                        <p className="truncate text-[11px] font-medium text-[var(--color-text-muted)]">
                          {ticked ? "done today" : "open today"} · {formatTimerChoice(selectedMinutes)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartHabit(habit)}
                        disabled={busy || hasNonPomodoroActive || awaitingCompletion || isCurrent}
                        className="h-9 px-3 rounded-full bg-[#1A1640] text-white text-xs font-semibold active:scale-[0.97] transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {state && !completionMode ? "Switch" : "Start"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQueueHabit(habit)}
                        disabled={busy || isCurrent || isQueued}
                        className={`h-9 px-3 rounded-full text-xs font-semibold active:scale-[0.97] transition-all flex-shrink-0 disabled:cursor-not-allowed ${
                          isCurrent || isQueued
                            ? "bg-white/35 text-[var(--color-text-muted)]"
                            : "bg-white/65 text-[#1A1640] hover:bg-white/80"
                        }`}
                      >
                        {isCurrent ? "Now" : isQueued ? "Queued" : "Queue"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {queuePanelOpen && (
        <div className="absolute inset-x-0 bottom-24 z-[30] flex justify-center px-4 pointer-events-none">
          <section
            role="dialog"
            aria-label="Focus queue"
            className="glass-panel pointer-events-auto w-full max-w-xl rounded-[2rem] border border-white/60 shadow-[0_28px_90px_-34px_rgba(40,20,80,0.38)] p-4 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Queue
                </p>
                <h2 className="text-lg font-semibold text-[#1A1640] truncate">
                  {queue.length === 1 ? "1 item" : `${queue.length} items`}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close queue"
                onClick={() => setQueuePanelOpen(false)}
                className="h-9 w-9 rounded-full bg-white/45 hover:bg-white/65 text-[#1A1640]/70 hover:text-[#1A1640] active:scale-95 transition-all flex-shrink-0"
              >
                ×
              </button>
            </div>

            {queue.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-white/35 border border-white/60 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                No queued items.
              </div>
            ) : (
              <div className="mt-4 max-h-[min(48vh,22rem)] overflow-y-auto pr-1 space-y-2">
                {queue.map((item, index) => {
                  const isFirst = index === 0;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-2 transition-colors ${
                        isFirst ? "bg-white/65 border-white/85 shadow-sm" : "bg-white/32 border-white/55"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-8 w-8 rounded-full bg-white/65 text-[#1A1640] text-xs font-semibold tabular-nums flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#1A1640]">
                            {item.intentionText}
                          </p>
                          <p className="truncate text-[11px] font-medium text-[var(--color-text-muted)]">
                            {item.habitId ? "habit" : "task"} · {minutesFromMs(item.targetMs)} min
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => moveQueueItem(item.id, -1)}
                          disabled={index === 0}
                          aria-label="Move queued item up"
                          title="Move up"
                          className="h-9 w-9 rounded-full bg-white/55 text-[#1A1640] hover:bg-white/75 active:scale-[0.96] transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQueueItem(item.id, 1)}
                          disabled={index === queue.length - 1}
                          aria-label="Move queued item down"
                          title="Move down"
                          className="h-9 w-9 rounded-full bg-white/55 text-[#1A1640] hover:bg-white/75 active:scale-[0.96] transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => startQueuedItem(item)}
                          disabled={busy || hasNonPomodoroActive}
                          className="h-9 px-3 rounded-full bg-[#1A1640] text-white text-xs font-semibold active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Start
                        </button>
                        <button
                          type="button"
                          onClick={() => removePomodoroQueueItem(item.id)}
                          aria-label="Remove queued item"
                          title="Remove"
                          className="h-9 w-9 rounded-full bg-white/55 text-[#1A1640]/60 hover:bg-white/75 hover:text-[#e11d48] active:scale-[0.96] transition-all"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Bottom Dock */}
      <div className="absolute bottom-3 sm:bottom-6 left-0 right-0 flex justify-center px-3 sm:px-4 z-20">
        <div className="glass-panel min-h-14 rounded-[1.65rem] sm:rounded-full flex items-center p-1.5 border border-white/60 shadow-sm gap-1.5 overflow-x-auto scrollbar-hide max-w-[min(100%,46rem)]">
          {dockBuckets.map((bucket) => {
            const isSelected = bucket.intentions.some((intention) => intention.id === selectedId);
            const isOpen = openBucketId === bucket.id;
            return (
              <button
                key={bucket.id}
                type="button"
                onClick={() => handleOpenBucket(bucket.id)}
                disabled={bucket.intentions.length === 0}
                aria-expanded={isOpen}
                className={`h-10 px-3 sm:px-4 rounded-full border transition-colors flex items-center gap-2 min-w-max max-w-[8.5rem] sm:max-w-none flex-shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
                  isOpen || isSelected
                    ? "bg-[#1A1640] border-[#1A1640]/80 text-white shadow-sm"
                    : "bg-white/70 border-white/85 text-[#1A1640] hover:bg-white/90"
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: bucket.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-xs font-semibold">{bucket.label}</span>
                <span className={`text-[10px] font-semibold ${isOpen || isSelected ? "text-white/70" : "text-[var(--color-text-muted)]"}`}>
                  {bucket.intentions.length}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleOpenTimerPicker}
            aria-expanded={timerPickerOpen}
            className={`h-10 px-3 rounded-full border transition-colors flex items-center gap-2 min-w-max flex-shrink-0 text-xs font-semibold ${
              timerPickerOpen
                ? "bg-[#1A1640] border-[#1A1640]/80 text-white shadow-sm"
                : "bg-white/70 border-white/85 hover:bg-white/90 text-[#1A1640]"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4l2.5 2" />
            </svg>
            <span>{formatTimerChoice(selectedMinutes)}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenHabits}
            aria-expanded={habitPickerOpen}
            className={`h-10 px-3 sm:px-4 rounded-full border transition-colors flex items-center gap-2 min-w-max flex-shrink-0 ${
              habitPickerOpen
                ? "bg-[#1A1640] border-[#1A1640]/80 text-white shadow-sm"
                : "bg-white/70 border-white/85 hover:bg-white/90 text-[#1A1640]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#EC4899]" aria-hidden="true" />
            <span className="text-xs font-semibold">Habits</span>
            <span className={`text-[10px] font-semibold ${habitPickerOpen ? "text-white/70" : "text-[var(--color-text-muted)]"}`}>
              {habits.length}
            </span>
          </button>

          <button
            type="button"
            onClick={handleOpenQueue}
            aria-expanded={queuePanelOpen}
            className={`h-10 px-3 sm:px-4 rounded-full border transition-colors flex items-center gap-2 min-w-max flex-shrink-0 ${
              queuePanelOpen
                ? "bg-[#1A1640] border-[#1A1640]/80 text-white shadow-sm"
                : "bg-white/70 border-white/85 hover:bg-white/90 text-[#1A1640]"
            }`}
          >
            <span className="text-xs font-semibold">Queue</span>
            <span className={`text-[10px] font-semibold ${queuePanelOpen ? "text-white/70" : "text-[var(--color-text-muted)]"}`}>
              {queue.length}
            </span>
          </button>

          <button
            type="button"
            onClick={openBrainDump}
            className="h-10 px-3 sm:px-4 rounded-full border border-white/85 bg-white/70 hover:bg-white/90 text-[#1A1640] transition-colors flex items-center gap-1.5 min-w-max flex-shrink-0 text-xs font-semibold"
          >
            <span aria-hidden="true">+</span>
            <span className="sm:hidden">Dump</span>
            <span className="hidden sm:inline">Brain dump</span>
          </button>
        </div>
      </div>
    </div>
  );
}
