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
import { getEnergyLabel } from "@/lib/energy";
import type { EnergyLevel } from "@/lib/db";

interface PomodoroCardProps {
  className?: string;
  /**
   * "soft" (default) — pastel accent surface used in mobile inline flow.
   * "dark" — high-contrast IN-FOCUS card for the desktop right rail.
   */
  variant?: "soft" | "dark";
  /** Bucket name to display in the dark variant subtitle. Optional. */
  bucketName?: string | null;
  /** Energy level for the running intention; rendered in the dark subtitle. */
  energy?: EnergyLevel | null;
}

function formatStartedAt(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatElapsedReadable(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return "less than a minute";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

export default function PomodoroCard({
  className,
  variant = "soft",
  bucketName,
  energy,
}: PomodoroCardProps) {
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
  const isBurst = state.mode === "burst";

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
    if (!isBurst && state.intentionId) {
      await updateIntention(state.intentionId, {
        completed: true,
        completedAt: finishedAt,
        entryId: state.entryId,
      });
    }

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
            {isBurst ? "Focus burst complete" : "Pomodoro complete"}
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
            {isBurst ? "Save session" : "Tick it off"}
          </button>
          {isBurst ? (
            <button
              onClick={handleCancel}
              className="flex-1 h-11 rounded-lg bg-[var(--color-bg)]/80 border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-muted)] active:scale-[0.98] transition-transform"
            >
              Discard
            </button>
          ) : (
            <button
              onClick={handleKeepOpen}
              className="flex-1 h-11 rounded-lg bg-[var(--color-bg)]/80 border border-[var(--color-border)] text-sm font-medium active:scale-[0.98] transition-transform"
            >
              Keep it open
            </button>
          )}
        </div>
      </div>
    );
  }

  if (variant === "dark") {
    const energyLabel = energy ? `${getEnergyLabel(energy).toLowerCase()} energy` : null;
    const subtitleBits = [bucketName, energyLabel, `started ${formatStartedAt(state.startedAt)}`].filter(
      (v): v is string => !!v
    );

    return (
      <div
        className={`bg-[#15172A]/70 backdrop-blur-xl border border-white/10 shadow-2xl text-white rounded-2xl p-5 flex flex-col gap-3 animate-fade-in ${className ?? ""}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full bg-white ${paused ? "opacity-40" : "animate-now-pulse"}`}
            aria-hidden="true"
          />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
            {paused ? "Paused" : isBurst ? "Just started" : "In focus"}
          </span>
        </div>
        <p className="text-5xl font-black tabular-nums tracking-tight text-center leading-none">
          {formatCountdown(remaining)}
        </p>
        <div className="text-center">
          <p className="text-sm font-medium leading-snug truncate">{state.intentionText}</p>
          {subtitleBits.length > 0 && (
            <p className="text-[11px] text-white/55 mt-0.5 truncate">
              {subtitleBits.join(" · ")}
            </p>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
          <div
            className="h-full bg-gradient-to-r from-pink-400 to-purple-400 transition-[width] duration-500 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        {confirmCancel ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/60 flex-1">Cancel this session?</span>
            <button
              onClick={handleCancel}
              className="h-9 px-3 rounded-lg bg-red-500 text-white text-xs font-semibold active:scale-[0.98] transition-transform"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmCancel(false)}
              className="h-9 px-3 rounded-lg bg-white/10 text-white/80 text-xs font-medium active:scale-[0.98] transition-transform"
            >
              Keep going
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={togglePause}
              className="h-10 rounded-lg bg-white/10 text-white/80 text-sm font-medium active:scale-[0.98] transition-transform"
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={handleFinishEarly}
              className="h-10 rounded-lg bg-white text-black text-sm font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5"
            >
              Finish
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button
              onClick={() => setConfirmCancel(true)}
              className="h-10 rounded-lg border border-red-400/30 bg-red-400/10 text-red-400 text-sm font-medium active:scale-[0.98] transition-transform"
            >
              Cancel
            </button>
          </div>
        )}
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
            {paused ? "Paused" : isBurst ? "Just Start" : "Focus session"}
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
