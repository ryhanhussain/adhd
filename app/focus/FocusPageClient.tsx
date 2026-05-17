"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  addIntentions,
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
import { getEnergyEmoji } from "@/lib/energy";
import type { ParsedIntention } from "@/lib/gemini";
import BrainDumpInput from "@/components/BrainDumpInput";
import BottomSheet from "@/components/BottomSheet";

const DEFAULT_DURATION_MINUTES = 25;
const FALLBACK_BUCKET_COLOR = "#a1a1aa";
const MIN_TIMER_MINUTES = 1;
const MAX_TIMER_MINUTES = 180;
const TASK_GROUP_ALL = "all";
const TASK_GROUP_HABITS = "habits";

type FocusTaskBucket = {
  id: string;
  label: string;
  color: string;
  intentions: Intention[];
};

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

function taskBucketFor(intention: Intention, buckets: FocusTaskBucket[]): FocusTaskBucket | null {
  return buckets.find((bucket) => bucket.intentions.some((candidate) => candidate.id === intention.id)) ?? null;
}

function TaskMetaMarks({
  bucket,
  energy,
}: {
  bucket?: FocusTaskBucket | null;
  energy?: EnergyLevel | null;
}) {
  return (
    <span className="mt-1 flex h-4 items-center gap-1.5" aria-hidden="true">
      {bucket && (
        <span
          className="h-2 w-2 rounded-full ring-1 ring-white/70"
          style={{ backgroundColor: bucket.color }}
        />
      )}
      {energy ? (
        <span className="text-[12px] leading-none">
          {getEnergyEmoji(energy)}
        </span>
      ) : !bucket ? (
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]/50"
        />
      ) : null}
    </span>
  );
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
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [taskGroupId, setTaskGroupId] = useState<string>(TASK_GROUP_ALL);
  const [habitPickerOpen, setHabitPickerOpen] = useState(false);
  const [queuePanelOpen, setQueuePanelOpen] = useState(false);
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);
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
    if (!openBucketId && !taskPickerOpen && !timerPickerOpen && !habitPickerOpen && !queuePanelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenBucketId(null);
        setTaskPickerOpen(false);
        setTimerPickerOpen(false);
        setHabitPickerOpen(false);
        setQueuePanelOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openBucketId, taskPickerOpen, timerPickerOpen, habitPickerOpen, queuePanelOpen]);

  useEffect(() => {
    if (autoStartedRef.current || state) return;
    if (searchParams.get("start") !== "burst") return;
    autoStartedRef.current = true;
    void startPomodoroSession(focusBurstTask());
    router.replace("/focus");
  }, [router, searchParams, state]);

  useEffect(() => {
    if (!brainDumpOpen) return;
    let innerId = 0;
    const outerId = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(() => {
        document.getElementById("brain-dump-textarea")?.focus({ preventScroll: true });
      });
    });
    return () => {
      cancelAnimationFrame(outerId);
      cancelAnimationFrame(innerId);
    };
  }, [brainDumpOpen]);

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

  const taskBuckets = useMemo<FocusTaskBucket[]>(() => {
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
      ...(uncategorized.length > 0 || (byCategory.length === 0 && intentions.length > 0)
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

    return buckets;
  }, [intentionCategories, intentions]);

  const dockBuckets = taskBuckets;
  const activePickerBucket = openBucketId
    ? dockBuckets.find((bucket) => bucket.id === openBucketId) ?? null
    : null;
  const mobileTaskIntentions = useMemo(() => {
    if (taskGroupId === TASK_GROUP_ALL) {
      return taskBuckets.flatMap((bucket) => bucket.intentions);
    }
    return taskBuckets.find((bucket) => bucket.id === taskGroupId)?.intentions ?? [];
  }, [taskBuckets, taskGroupId]);
  const mobileTaskGroupLabel =
    taskGroupId === TASK_GROUP_HABITS
      ? "Habits"
      : taskGroupId === TASK_GROUP_ALL
        ? "All tasks"
        : taskBuckets.find((bucket) => bucket.id === taskGroupId)?.label ?? "Tasks";

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
    setTaskPickerOpen(false);
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
        setHabitPickerOpen(false);
        setTaskPickerOpen(false);
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
    setTaskPickerOpen(false);
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
      closeFloatingPanels();
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
    setTaskPickerOpen(false);
    setTimerPickerOpen(false);
    setHabitPickerOpen(false);
    setQueuePanelOpen(false);
    setOpenBucketId((current) => (current === bucketId ? null : bucketId));
  };

  const handleOpenTaskPicker = () => {
    setOpenBucketId(null);
    setTimerPickerOpen(false);
    setHabitPickerOpen(false);
    setQueuePanelOpen(false);
    setTaskPickerOpen((current) => !current);
  };

  const handleOpenTimerPicker = () => {
    setOpenBucketId(null);
    setTaskPickerOpen(false);
    setHabitPickerOpen(false);
    setQueuePanelOpen(false);
    setTimerPickerOpen((current) => !current);
  };

  const handleOpenHabits = () => {
    setOpenBucketId(null);
    setTaskPickerOpen(false);
    setTimerPickerOpen(false);
    setQueuePanelOpen(false);
    setHabitPickerOpen((current) => !current);
  };

  const handleOpenQueue = () => {
    setOpenBucketId(null);
    setTaskPickerOpen(false);
    setTimerPickerOpen(false);
    setHabitPickerOpen(false);
    setQueuePanelOpen((current) => !current);
  };

  const handleStartSelectedFromPicker = async () => {
    await handleStartSelected();
    if (selectedIntention && !selectedIsDuplicate && !hasNonPomodoroActive && !awaitingCompletion) {
      setOpenBucketId(null);
      setTaskPickerOpen(false);
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

  const handleIntentionsParsed = async (parsed: ParsedIntention[]) => {
    const actionable = parsed.filter((item) => item.text.trim().length > 0);
    if (actionable.length === 0) return;

    const createdAt = Date.now();
    const date = toLocalDateStr(createdAt);
    const maxOrder = intentions.reduce((acc, intention) => Math.max(acc, intention.order), -1);
    const newIntentions: Intention[] = actionable.map((item, index) => ({
      id: crypto.randomUUID(),
      text: item.text.trim(),
      date,
      completed: false,
      completedAt: null,
      entryId: null,
      order: maxOrder + 1 + index,
      createdAt,
      categoryId: item.categoryId ?? null,
      energy: item.energy ?? null,
      updatedAt: createdAt,
      deleted: false,
      syncedAt: null,
    }));

    await addIntentions(newIntentions);
    const firstNewIntention = newIntentions[0];
    setSelectedId(firstNewIntention.id);
    setTaskGroupId(firstNewIntention.categoryId ?? TASK_GROUP_ALL);
    window.dispatchEvent(new Event("entry-updated"));
    await refreshData();
  };

  const openBrainDump = () => {
    closeFloatingPanels();
    setBrainDumpOpen(true);
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
      <div className="relative z-20 flex justify-center pt-3 sm:pt-6 px-2 sm:px-4">
        <div className="glass-panel flex items-center h-11 sm:h-12 px-1.5 sm:px-2 rounded-full shadow-sm text-xs sm:text-sm font-medium border border-white/60 max-w-full">
          <Link href="/" className="flex items-center gap-1.5 px-2.5 sm:px-3 rounded-full hover:bg-white/20 transition-colors h-8 flex-shrink-0">
            <span className="text-[var(--color-accent)] text-lg leading-none" aria-hidden="true">✦</span>
            <span className="font-semibold text-[#1A1640]">ADDit</span>
          </Link>
          <div className="hidden sm:block w-px h-4 bg-[var(--color-border)] mx-1" />
          <span className="sm:hidden h-8 px-3 rounded-full bg-[#1A1640] text-white flex items-center font-semibold">
            Focus
          </span>
          <nav aria-label="Primary" className="hidden sm:flex items-center gap-1 px-1 overflow-x-auto scrollbar-hide">
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
          <div className="hidden sm:block w-px h-4 bg-[var(--color-border)] mx-1" />
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
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-3 pt-3 pb-24 sm:px-4 sm:pt-0 sm:pb-0 sm:-mt-10">
        <div
          className={`focus-orb-wrap ${state && !paused && !completionMode ? "is-running" : ""}`}
          style={{ "--focus-progress": `${progress * 360}deg` } as React.CSSProperties & { "--focus-progress": string }}
        >
          <div className="focus-orb text-center p-6 sm:p-8">
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.18em] sm:tracking-[0.2em] text-[var(--color-text-muted)] mb-1 sm:mb-2">
              {activeLabel} {state?.mode === "burst" && !state.habitId ? "" : "· FOCUS"}
            </span>
            <span className="text-[4.25rem] sm:text-[7.5rem] font-display-serif tabular-nums leading-none text-[#1A1640] -ml-1 sm:-ml-2 mb-2 sm:mb-4">
              {state ? formatCountdown(remaining) : formatCountdown(selectedDurationMs)}
            </span>
            <span className="max-w-[14rem] sm:max-w-[20rem] text-base sm:text-xl font-semibold text-[#1A1640] truncate px-3 sm:px-4">
              {state?.intentionText ?? selectedIntention?.text ?? "Choose a task"}
            </span>
            <span className="text-[11px] sm:text-xs font-medium text-[var(--color-text-muted)] mt-0.5 sm:mt-1 mb-3 sm:mb-6">
              {state
                ? `started ${new Date(state.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                : `${selectedMinutes} min ready`} · {displayedEnergy}
            </span>

            {/* Actions inside Orb */}
            {confirmCancel ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-1 sm:mt-2">
                <span className="text-xs font-semibold text-[#e11d48]">Cancel?</span>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="h-9 px-3 sm:px-4 rounded-full bg-[#e11d48] text-white text-xs font-semibold shadow-sm active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="h-9 px-3 sm:px-4 rounded-full bg-white text-xs font-semibold shadow-sm border border-white/80 active:scale-[0.98] transition-all"
                >
                  Keep going
                </button>
              </div>
            ) : completionMode && state ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-1 sm:mt-2">
                <button
                  type="button"
                  onClick={state.mode === "burst" && !activeIsHabit ? () => setConfirmCancel(true) : handleSaveOnly}
                  disabled={busy}
                  className="h-9 px-3 sm:px-4 rounded-full bg-white text-xs font-semibold shadow-sm border border-white/80 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {state.mode === "burst" && !activeIsHabit ? "Discard" : "Save only"}
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={busy}
                  className="h-9 px-4 sm:px-5 rounded-full bg-[#1A1640] text-white text-xs font-semibold shadow-sm active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {state.mode === "burst" && !activeIsHabit ? "Save session" : "Tick off"}
                </button>
                <button
                  type="button"
                  onClick={handleFinishAndStartNext}
                  disabled={busy || !upNext}
                  className="h-9 px-3 sm:px-4 rounded-full text-xs font-semibold text-[#1A1640] hover:bg-white/30 active:scale-[0.98] transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                >
                  Start next
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-1 sm:mt-2">
                <button
                  type="button"
                  onClick={state ? togglePause : handleStartBurst}
                  disabled={busy || (!state && hasNonPomodoroActive)}
                  className="h-9 px-3 sm:px-4 rounded-full bg-white text-xs font-semibold shadow-sm border border-white/80 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center gap-1.5"
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
                  className="h-9 px-4 sm:px-5 rounded-full bg-[#1A1640] text-white text-xs font-semibold shadow-sm active:scale-[0.98] transition-all disabled:opacity-60 flex items-center gap-1.5"
                >
                  {state ? "Finish" : "Start"} ✔
                </button>
                <button
                  type="button"
                  onClick={state ? () => setConfirmCancel(true) : handleQueueSelected}
                  disabled={!state && (!selectedIntention || selectedIsDuplicate)}
                  className={`h-9 px-3 sm:px-4 rounded-full text-xs font-semibold hover:bg-white/30 active:scale-[0.98] transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
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
        <div className="mt-4 sm:mt-8 w-full max-w-[21rem] sm:max-w-[30rem]">
          <div className="glass-panel h-10 rounded-full flex items-center px-1.5 shadow-sm border border-white/60 max-w-full overflow-hidden">
            <div className="h-7 px-2.5 sm:px-3 rounded-full bg-white/50 flex items-center text-[9px] font-semibold tracking-widest text-[#7C3AED] uppercase mr-2 sm:mr-3 ml-1 flex-shrink-0">
              Up Next
            </div>
            <span className="text-sm font-medium text-[#1A1640] truncate min-w-0 max-w-[7rem] sm:max-w-[200px]">
              {upNext?.intentionText ?? selectedIntention?.text ?? "Add something"}
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

      {(activePickerBucket || taskPickerOpen || timerPickerOpen || habitPickerOpen || queuePanelOpen) && (
        <button
          type="button"
          aria-label="Close focus popup"
          className="absolute inset-0 z-[15] cursor-default"
          onClick={closeFloatingPanels}
        />
      )}

      {taskPickerOpen && (
        <div className="focus-popover absolute inset-x-0 z-[30] flex justify-center px-3 pointer-events-none sm:hidden">
          <section
            role="dialog"
            aria-label="Tasks"
            className="focus-popup-panel pointer-events-auto flex max-h-[min(72dvh,34rem)] w-full max-w-lg flex-col rounded-[1.75rem] border border-white/60 shadow-[0_28px_90px_-34px_rgba(40,20,80,0.38)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Tasks
                </p>
                <h2 className="truncate text-lg font-semibold text-[#1A1640]">
                  {mobileTaskGroupLabel}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close tasks"
                onClick={() => setTaskPickerOpen(false)}
                className="h-9 w-9 rounded-full bg-white/45 text-[#1A1640]/70 transition-all hover:bg-white/65 hover:text-[#1A1640] active:scale-95 flex-shrink-0"
              >
                ×
              </button>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                type="button"
                onClick={() => setTaskGroupId(TASK_GROUP_ALL)}
                className={`h-9 rounded-full px-3 text-xs font-semibold transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                  taskGroupId === TASK_GROUP_ALL
                    ? "bg-[#1A1640] text-white"
                    : "bg-white/50 text-[#1A1640] hover:bg-white/70"
                }`}
              >
                All
              </button>
              {taskBuckets.map((bucket) => (
                <button
                  key={bucket.id}
                  type="button"
                  onClick={() => setTaskGroupId(bucket.id)}
                  className={`h-9 max-w-[8.5rem] rounded-full px-3 text-xs font-semibold transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                    taskGroupId === bucket.id
                      ? "bg-[#1A1640] text-white"
                      : "bg-white/50 text-[#1A1640] hover:bg-white/70"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: bucket.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{bucket.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTaskGroupId(TASK_GROUP_HABITS)}
                className={`h-9 rounded-full px-3 text-xs font-semibold transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                  taskGroupId === TASK_GROUP_HABITS
                    ? "bg-[#1A1640] text-white"
                    : "bg-white/50 text-[#1A1640] hover:bg-white/70"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#EC4899]" aria-hidden="true" />
                Habits
              </button>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 space-y-2">
              {taskGroupId === TASK_GROUP_HABITS ? (
                habits.length === 0 ? (
                  <div className="rounded-2xl border border-white/60 bg-white/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                    No habits yet.
                  </div>
                ) : (
                  habits.map((habit) => {
                    const isCurrent = habit.id === currentHabitId;
                    const isQueued = queuedHabitIds.has(habit.id);
                    const ticked = habit.completions.includes(todayDateStr);
                    return (
                      <div
                        key={habit.id}
                        className={`flex items-center gap-2 rounded-2xl p-1.5 transition-colors ${
                          isCurrent ? "bg-white/65 shadow-sm" : "bg-white/30"
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
                              : "bg-white/65 text-[#1A1640]"
                          }`}
                        >
                          {isCurrent ? "Now" : isQueued ? "Queued" : "Queue"}
                        </button>
                      </div>
                    );
                  })
                )
              ) : mobileTaskIntentions.length === 0 ? (
                <div className="rounded-2xl border border-white/60 bg-white/35 px-4 py-5 text-sm text-[var(--color-text-muted)]">
                  No open tasks here.
                </div>
              ) : (
                mobileTaskIntentions.map((intention) => {
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
                  const bucket = taskBucketFor(intention, taskBuckets);
                  return (
                    <div
                      key={intention.id}
                      className={`flex items-center gap-2 rounded-2xl p-1.5 transition-colors ${
                        selected ? "bg-white/65 shadow-sm" : "bg-white/30"
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
                        <TaskMetaMarks bucket={bucket} energy={intention.energy ?? null} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQueueIntention(intention)}
                        disabled={queueDisabled}
                        className={`h-9 px-3 rounded-full text-xs font-semibold active:scale-[0.97] transition-all flex-shrink-0 disabled:cursor-not-allowed ${
                          queueDisabled
                            ? "bg-white/35 text-[var(--color-text-muted)]"
                            : "bg-[#1A1640] text-white"
                        }`}
                      >
                        {queueLabel}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {taskGroupId !== TASK_GROUP_HABITS && (
              <div className="mt-3 flex items-center gap-2">
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
                  className="h-11 flex-1 rounded-full bg-[#1A1640] text-white text-xs font-semibold shadow-sm active:scale-[0.98] transition-all disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {selectedIntention
                    ? state && !completionMode
                      ? "Switch to selected"
                      : "Start selected"
                    : "Choose a task"}
                </button>
                <button
                  type="button"
                  onClick={() => setTaskPickerOpen(false)}
                  className="h-11 px-4 rounded-full bg-white/45 text-xs font-semibold text-[#1A1640] transition-all hover:bg-white/65 active:scale-[0.98]"
                >
                  Done
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {activePickerBucket && (
        <div className="focus-popover absolute inset-x-0 z-[30] hidden justify-center px-4 pointer-events-none sm:flex">
          <section
            role="dialog"
            aria-label={`${activePickerBucket.label} tasks`}
            className="focus-popup-panel pointer-events-auto w-full max-w-xl rounded-[2rem] border border-white/60 shadow-[0_28px_90px_-34px_rgba(40,20,80,0.38)] p-4 sm:p-5"
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
                      <TaskMetaMarks energy={intention.energy ?? null} />
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
        <div className="focus-popover absolute inset-x-0 z-[30] flex justify-center px-3 sm:px-4 pointer-events-none">
          <section
            role="dialog"
            aria-label="Timer length"
            className="focus-popup-panel pointer-events-auto w-full max-w-sm rounded-[2rem] border border-white/60 shadow-[0_28px_90px_-34px_rgba(40,20,80,0.38)] p-4"
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
        <div className="focus-popover absolute inset-x-0 z-[30] hidden justify-center px-4 pointer-events-none sm:flex">
          <section
            role="dialog"
            aria-label="Habits"
            className="focus-popup-panel pointer-events-auto w-full max-w-xl rounded-[2rem] border border-white/60 shadow-[0_28px_90px_-34px_rgba(40,20,80,0.38)] p-4 sm:p-5"
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
        <div className="focus-popover absolute inset-x-0 z-[30] flex justify-center px-3 sm:px-4 pointer-events-none">
          <section
            role="dialog"
            aria-label="Focus queue"
            className="focus-popup-panel pointer-events-auto w-full max-w-xl rounded-[2rem] border border-white/60 shadow-[0_28px_90px_-34px_rgba(40,20,80,0.38)] p-4 sm:p-5"
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

      <BottomSheet
        open={brainDumpOpen}
        onClose={() => setBrainDumpOpen(false)}
        ariaLabel="Brain dump"
      >
        <div className="px-4 pb-5 pt-1">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Brain dump
            </span>
            <button
              type="button"
              onClick={() => setBrainDumpOpen(false)}
              className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-text)]/5 active:scale-90 transition-all"
              aria-label="Close brain dump"
            >
              ×
            </button>
          </div>
          <BrainDumpInput
            onIntentionsParsed={handleIntentionsParsed}
            onClose={() => setBrainDumpOpen(false)}
            intentionCategories={intentionCategories}
          />
        </div>
      </BottomSheet>

      {/* Bottom Dock */}
      <div className="focus-dock absolute left-0 right-0 flex justify-center px-3 sm:px-4 z-20">
        <div className="glass-panel grid h-16 w-full max-w-[23rem] grid-cols-4 gap-1.5 rounded-[1.4rem] border border-white/60 p-1.5 shadow-sm sm:hidden">
          <button
            type="button"
            onClick={handleOpenTaskPicker}
            aria-expanded={taskPickerOpen}
            className={`relative rounded-[1.05rem] border transition-colors flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
              taskPickerOpen || !!selectedIntention
                ? "bg-[#1A1640] border-[#1A1640]/80 text-white shadow-sm"
                : "bg-white/70 border-white/85 text-[#1A1640] active:bg-white/90"
            }`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 6h13" />
              <path d="M8 12h13" />
              <path d="M8 18h13" />
              <path d="M3 6h.01" />
              <path d="M3 12h.01" />
              <path d="M3 18h.01" />
            </svg>
            <span>Tasks</span>
          </button>

          <button
            type="button"
            onClick={handleOpenTimerPicker}
            aria-expanded={timerPickerOpen}
            className={`relative rounded-[1.05rem] border transition-colors flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
              timerPickerOpen
                ? "bg-[#1A1640] border-[#1A1640]/80 text-white shadow-sm"
                : "bg-white/70 border-white/85 text-[#1A1640] active:bg-white/90"
            }`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4l2.5 2" />
            </svg>
            <span>Timer</span>
          </button>

          <button
            type="button"
            onClick={handleOpenQueue}
            aria-expanded={queuePanelOpen}
            className={`relative rounded-[1.05rem] border transition-colors flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
              queuePanelOpen
                ? "bg-[#1A1640] border-[#1A1640]/80 text-white shadow-sm"
                : "bg-white/70 border-white/85 text-[#1A1640] active:bg-white/90"
            }`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 7h10" />
              <path d="M7 12h10" />
              <path d="M7 17h6" />
            </svg>
            <span>Queue</span>
          </button>

          <button
            type="button"
            onClick={openBrainDump}
            className="rounded-[1.05rem] border border-white/85 bg-white/70 text-[#1A1640] transition-colors flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold active:bg-white/90"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            <span>Dump</span>
          </button>
        </div>

        <div className="glass-panel hidden min-h-14 rounded-full items-center p-1.5 border border-white/60 shadow-sm gap-1.5 overflow-x-auto scrollbar-hide max-w-[calc(100vw-2rem)] xl:max-w-[60rem] sm:flex">
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
                className={`h-10 max-w-[10rem] px-4 rounded-full border transition-colors flex items-center gap-2 min-w-0 flex-shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
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
            <span>Timer</span>
          </button>

          <button
            type="button"
            onClick={handleOpenHabits}
            aria-expanded={habitPickerOpen}
            className={`h-10 px-4 rounded-full border transition-colors flex items-center gap-2 min-w-max flex-shrink-0 ${
              habitPickerOpen
                ? "bg-[#1A1640] border-[#1A1640]/80 text-white shadow-sm"
                : "bg-white/70 border-white/85 hover:bg-white/90 text-[#1A1640]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#EC4899]" aria-hidden="true" />
            <span className="text-xs font-semibold">Habits</span>
          </button>

          <button
            type="button"
            onClick={handleOpenQueue}
            aria-expanded={queuePanelOpen}
            className={`h-10 px-4 rounded-full border transition-colors flex items-center gap-2 min-w-max flex-shrink-0 ${
              queuePanelOpen
                ? "bg-[#1A1640] border-[#1A1640]/80 text-white shadow-sm"
                : "bg-white/70 border-white/85 hover:bg-white/90 text-[#1A1640]"
            }`}
          >
            <span className="text-xs font-semibold">Queue</span>
          </button>

          <button
            type="button"
            onClick={openBrainDump}
            className="h-10 px-4 rounded-full border border-white/85 bg-white/70 hover:bg-white/90 text-[#1A1640] transition-colors flex items-center gap-1.5 min-w-max flex-shrink-0 text-xs font-semibold"
          >
            <span aria-hidden="true">+</span>
            <span>Brain dump</span>
          </button>
        </div>
      </div>
    </div>
  );
}
