/**
 * Pomodoro session state. Device-local (localStorage), not synced — a focus
 * session shouldn't follow you mid-flight to another device. Math is all
 * derived from Date.now() so backgrounded tabs stay accurate when refocused.
 */

export const POMODORO_PRESETS = [25, 45, 60] as const;
export type PomodoroPresetMinutes = (typeof POMODORO_PRESETS)[number];

export interface PomodoroState {
  entryId: string;
  intentionId: string;
  intentionText: string;
  targetMs: number;
  startedAt: number;
  pausedAt: number | null;
  accumulatedPausedMs: number;
}

const STORAGE_KEY = "addit-pomodoro";
export const POMODORO_EVENT = "pomodoro-updated";

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(POMODORO_EVENT));
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
      typeof parsed.intentionId !== "string" ||
      typeof parsed.intentionText !== "string" ||
      typeof parsed.targetMs !== "number" ||
      typeof parsed.startedAt !== "number"
    ) {
      return null;
    }
    return parsed;
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
