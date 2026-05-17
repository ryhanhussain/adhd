/**
 * Pomodoro session state. Device-local (localStorage), not synced — a focus
 * session shouldn't follow you mid-flight to another device. Math is all
 * derived from Date.now() so backgrounded tabs stay accurate when refocused.
 */

export const POMODORO_PRESETS = [25, 40, 60] as const;
export type PomodoroPresetMinutes = (typeof POMODORO_PRESETS)[number];

export interface PomodoroState {
  entryId: string;
  mode: "intention" | "burst";
  intentionId: string | null;
  habitId?: string | null;
  intentionText: string;
  targetMs: number;
  startedAt: number;
  pausedAt: number | null;
  accumulatedPausedMs: number;
  notifiedAt?: number | null;
}

export interface PomodoroQueueItem {
  id: string;
  intentionId: string | null;
  habitId?: string | null;
  intentionText: string;
  targetMs: number;
  queuedAt: number;
}

const STORAGE_KEY = "addit-pomodoro";
const QUEUE_STORAGE_KEY = "addit-pomodoro-queue";
export const POMODORO_EVENT = "pomodoro-updated";
export const POMODORO_QUEUE_EVENT = "pomodoro-queue-updated";

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(POMODORO_EVENT));
  }
}

function emitQueue() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(POMODORO_QUEUE_EVENT));
  }
}

export function getPomodoroState(): PomodoroState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PomodoroState;
    if (
      typeof parsed.entryId !== "string" ||
      typeof parsed.intentionText !== "string" ||
      typeof parsed.targetMs !== "number" ||
      typeof parsed.startedAt !== "number"
    ) {
      return null;
    }
    const mode = parsed.mode === "burst" ? "burst" : "intention";
    const intentionId =
      mode === "burst"
        ? null
        : typeof parsed.intentionId === "string"
          ? parsed.intentionId
          : null;
    const habitId =
      typeof (parsed as Partial<PomodoroState>).habitId === "string"
        ? (parsed as Partial<PomodoroState>).habitId
        : null;
    if (mode === "intention" && !intentionId) return null;
    return {
      ...parsed,
      mode,
      intentionId,
      habitId,
      pausedAt: typeof parsed.pausedAt === "number" ? parsed.pausedAt : null,
      accumulatedPausedMs:
        typeof parsed.accumulatedPausedMs === "number" ? parsed.accumulatedPausedMs : 0,
      notifiedAt: typeof parsed.notifiedAt === "number" ? parsed.notifiedAt : null,
    };
  } catch {
    return null;
  }
}

export function setPomodoroState(state: PomodoroState | null): void {
  if (typeof window === "undefined") return;
  if (state == null) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  emit();
}

export function clearPomodoroState(): void {
  setPomodoroState(null);
}

export function markPomodoroNotified(state: PomodoroState, notifiedAt: number = Date.now()): PomodoroState {
  const next = { ...state, notifiedAt };
  setPomodoroState(next);
  return next;
}

function sanitizeQueueItem(raw: unknown): PomodoroQueueItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<PomodoroQueueItem>;
  if (
    typeof item.id !== "string" ||
    typeof item.intentionText !== "string" ||
    typeof item.targetMs !== "number" ||
    typeof item.queuedAt !== "number"
  ) {
    return null;
  }
  return {
    id: item.id,
    intentionId: typeof item.intentionId === "string" ? item.intentionId : null,
    habitId: typeof item.habitId === "string" ? item.habitId : null,
    intentionText: item.intentionText,
    targetMs: item.targetMs,
    queuedAt: item.queuedAt,
  };
}

export function getPomodoroQueue(): PomodoroQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeQueueItem).filter((x): x is PomodoroQueueItem => !!x);
  } catch {
    return [];
  }
}

export function setPomodoroQueue(items: PomodoroQueueItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
  emitQueue();
}

export function enqueuePomodoroTask(
  task: Omit<PomodoroQueueItem, "id" | "queuedAt"> & Partial<Pick<PomodoroQueueItem, "id" | "queuedAt">>
): PomodoroQueueItem | null {
  const queue = getPomodoroQueue();
  if (task.intentionId && queue.some((item) => item.intentionId === task.intentionId)) {
    return null;
  }
  if (task.habitId && queue.some((item) => item.habitId === task.habitId)) {
    return null;
  }
  const item: PomodoroQueueItem = {
    id: task.id ?? crypto.randomUUID(),
    intentionId: task.intentionId,
    habitId: task.habitId ?? null,
    intentionText: task.intentionText,
    targetMs: task.targetMs,
    queuedAt: task.queuedAt ?? Date.now(),
  };
  setPomodoroQueue([...queue, item]);
  return item;
}

export function removePomodoroQueueItem(id: string): void {
  setPomodoroQueue(getPomodoroQueue().filter((item) => item.id !== id));
}

export function reorderPomodoroQueue(ids: string[]): void {
  const byId = new Map(getPomodoroQueue().map((item) => [item.id, item]));
  const next = ids.map((id) => byId.get(id)).filter((item): item is PomodoroQueueItem => !!item);
  const ordered = new Set(ids);
  for (const item of byId.values()) {
    if (!ordered.has(item.id)) next.push(item);
  }
  setPomodoroQueue(next);
}

export function popNextPomodoroQueueItem(): PomodoroQueueItem | null {
  const [next, ...rest] = getPomodoroQueue();
  setPomodoroQueue(rest);
  return next ?? null;
}

/**
 * Returns the remaining countdown in ms, accounting for any paused interval.
 * Clamped at 0 (never negative).
 */
export function getRemainingMs(state: PomodoroState, now: number = Date.now()): number {
  const pausedNow = state.pausedAt != null ? now - state.pausedAt : 0;
  const elapsed = now - state.startedAt - state.accumulatedPausedMs - pausedNow;
  return Math.max(0, state.targetMs - elapsed);
}

export function getElapsedMs(state: PomodoroState, now: number = Date.now()): number {
  const pausedNow = state.pausedAt != null ? now - state.pausedAt : 0;
  return Math.max(0, now - state.startedAt - state.accumulatedPausedMs - pausedNow);
}

export function isPaused(state: PomodoroState): boolean {
  return state.pausedAt != null;
}

export function pausePomodoro(): void {
  const s = getPomodoroState();
  if (!s || s.pausedAt != null) return;
  setPomodoroState({ ...s, pausedAt: Date.now() });
}

export function resumePomodoro(): void {
  const s = getPomodoroState();
  if (!s || s.pausedAt == null) return;
  const pausedDuration = Date.now() - s.pausedAt;
  setPomodoroState({
    ...s,
    pausedAt: null,
    accumulatedPausedMs: s.accumulatedPausedMs + pausedDuration,
  });
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
