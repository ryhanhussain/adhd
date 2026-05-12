"use client";

import { useEffect, useRef, useState } from "react";
import { deleteEntry, updateEntry, updateIntention } from "@/lib/db";
import {
  clearPomodoroState,
  formatCountdown,
  getElapsedMs,
  getPomodoroState,
  getRemainingMs,
  isPaused,
  pausePomodoro,
  POMODORO_EVENT,
  resumePomodoro,
  type PomodoroState,
} from "@/lib/pomodoro";
import { notifyPomodoroComplete } from "@/lib/notifications";
import { confettiBurst } from "@/lib/confetti";

interface PomodoroCardProps {
  className?: string;
}

function formatElapsedReadable(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return "less than a minute";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

export default function PomodoroCard({ className }: PomodoroCardProps) {
  const [state, setState] = useState<PomodoroState | null>(() =>
    typeof window === "undefined" ? null : getPomodoroState()
  );
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const notifiedRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sync = () => setState(getPomodoroState());
    window.addEventListener(POMODORO_EVENT, sync);
    return () => window.removeEventListener(POMODORO_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!state) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (!state || done) return;
    const remaining = getRemainingMs(state, now);
    if (remaining <= 0 && state.pausedAt == null) {
      if (!notifiedRef.current) {
        notifiedRef.current = true;
        notifyPomodoroComplete(state.intentionText);
      }
      setDone(true);
    }
  }, [state, now, done]);

  useEffect(() => {
    if (done) {
      buttonRef.current?.focus();
    }
  }, [done]);

  if (!state) return null;

  const remaining = getRemainingMs(state, now);
  const paused = isPaused(state);
  const progress = Math.min(1, Math.max(0, 1 - remaining / state.targetMs));

  const reset = () => {
    notifiedRef.current = false;
    setDone(false);
    setConfirmCancel(false);
    clearPomodoroState();
  };

  const handleTick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const finishedAt = Date.now();
    await updateEntry(state.entryId, {
      endTime: finishedAt,
      summary: state.intentionText,
    });
    await updateIntention(state.intentionId, {
      completed: true,
      completedAt: finishedAt,
      entryId: state.entryId,
    });

    confettiBurst(x, y);
    reset();
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleKeepOpen = async () => {
    await updateEntry(state.entryId, { endTime: Date.now() });
    reset();
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleCancel = async () => {
    await deleteEntry(state.entryId);
    reset();
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleFinishEarly = () => {
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      notifyPomodoroComplete(state.intentionText);
    }
    setDone(true);
  };

  const togglePause = () => {
    if (paused) resumePomodoro();
    else pausePomodoro();
  };

  if (done) {
    const elapsed = getElapsedMs(state, now);
    return (
      <div
        className={`rounded-2xl p-4 border-2 border-[var(--color-accent)] animate-fade-in ${className ?? ""}`}
        style={{ backgroundColor: "var(--color-accent-soft)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
          <span className="text-xs font-semibold text-[var(--color-accent)]">
            Pomodoro complete
          </span>
        </div>
        <p className="text-sm font-medium mb-1">{state.intentionText}</p>
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          Focused for {formatElapsedReadable(elapsed)}.
        </p>
        <div className="flex gap-2">
          <button
            ref={buttonRef}
            onClick={handleTick}
            className="flex-1 h-11 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            Tick it off
          </button>
          <button
            onClick={handleKeepOpen}
            className="flex-1 h-11 rounded-lg bg-[var(--color-bg)]/80 border border-[var(--color-border)] text-sm font-medium active:scale-[0.98] transition-transform"
          >
            Keep it open
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl p-4 border-2 border-[var(--color-accent)] animate-fade-in ${
        paused ? "" : "animate-breathe"
      } ${className ?? ""}`}
      style={{ backgroundColor: "var(--color-accent-soft)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full bg-[var(--color-accent)] ${
              paused ? "opacity-50" : "animate-now-pulse"
            }`}
          />
          <span className="text-xs font-semibold text-[var(--color-accent)]">
            {paused ? "Paused" : "Focus session"}
          </span>
        </div>
        <span className="text-2xl font-bold tabular-nums text-[var(--color-accent)]">
          {formatCountdown(remaining)}
        </span>
      </div>

      <p className="text-sm mb-3">{state.intentionText}</p>

      <div
        className="h-1.5 rounded-full bg-[var(--color-bg)]/60 overflow-hidden mb-3"
        aria-hidden="true"
      >
        <div
          className="h-full bg-[var(--color-accent)] transition-[width] duration-500 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {confirmCancel ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)] flex-1">Cancel this session?</span>
          <button
            onClick={handleCancel}
            className="h-9 px-3 rounded-lg bg-red-500/90 text-white text-xs font-semibold active:scale-[0.98] transition-transform"
          >
            Yes, cancel
          </button>
          <button
            onClick={() => setConfirmCancel(false)}
            className="h-9 px-3 rounded-lg bg-[var(--color-bg)]/80 border border-[var(--color-border)] text-xs font-medium active:scale-[0.98] transition-transform"
          >
            Keep going
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={togglePause}
            className="h-10 rounded-lg bg-[var(--color-bg)]/80 border border-[var(--color-border)] text-sm font-medium active:scale-[0.98] transition-transform"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={handleFinishEarly}
            className="h-10 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            Finish
          </button>
          <button
            onClick={() => setConfirmCancel(true)}
            className="h-10 rounded-lg bg-[var(--color-bg)]/80 border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-muted)] active:scale-[0.98] transition-transform"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
