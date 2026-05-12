"use client";

import { useEffect, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import {
  addEntry,
  getActiveIntentions,
  toLocalDateStr,
  type Intention,
} from "@/lib/db";
import {
  POMODORO_PRESETS,
  setPomodoroState,
  type PomodoroPresetMinutes,
} from "@/lib/pomodoro";
import { ensureNotificationPermission } from "@/lib/notifications";

interface PomodoroSheetProps {
  open: boolean;
  onClose: () => void;
  /** When a timer is already running, the sheet blocks start with this message. */
  hasActiveTimer: boolean;
}

export default function PomodoroSheet({ open, onClose, hasActiveTimer }: PomodoroSheetProps) {
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getActiveIntentions().then((rows) => {
      if (cancelled) return;
      setIntentions(rows);
      setSelectedId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : null));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setStarting(false);
    }
  }, [open]);

  const handleStart = async (minutes: PomodoroPresetMinutes) => {
    if (!selectedId || starting || hasActiveTimer) return;
    const intention = intentions.find((i) => i.id === selectedId);
    if (!intention) return;

    setStarting(true);
    void ensureNotificationPermission();

    const now = Date.now();
    const entryId = crypto.randomUUID();
    await addEntry({
      id: entryId,
      text: intention.text,
      timestamp: now,
      startTime: now,
      endTime: 0,
      date: toLocalDateStr(now),
      location: null,
      tags: [],
      energy: intention.energy ?? null,
      summary: null,
      createdAt: now,
    });

    setPomodoroState({
      entryId,
      intentionId: intention.id,
      intentionText: intention.text,
      targetMs: minutes * 60 * 1000,
      startedAt: now,
      pausedAt: null,
      accumulatedPausedMs: 0,
    });

    window.dispatchEvent(new Event("entry-updated"));
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Start a focus session">
      <div className="px-5 pb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Focus session</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-text)]/5 active:scale-90 transition-all"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {hasActiveTimer ? (
          <div className="rounded-xl p-4 bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/30 text-sm">
            A timer is already running. Finish it first, then start a Pomodoro.
          </div>
        ) : intentions.length === 0 ? (
          <div className="rounded-xl p-4 bg-[var(--color-bg)]/60 border border-[var(--color-border)] text-sm text-[var(--color-text-muted)]">
            No intentions yet — add one via Brain Dump first.
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Pick a task
            </p>
            <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto mb-4 pr-1">
              {intentions.map((intention) => {
                const isSelected = intention.id === selectedId;
                return (
                  <button
                    key={intention.id}
                    onClick={() => setSelectedId(intention.id)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                      isSelected
                        ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]"
                        : "bg-[var(--color-bg)]/80 border-[var(--color-border)] hover:bg-[var(--color-bg)]"
                    }`}
                  >
                    {intention.text}
                  </button>
                );
              })}
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Duration
            </p>
            <div className="grid grid-cols-3 gap-2">
              {POMODORO_PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  onClick={() => handleStart(minutes)}
                  disabled={!selectedId || starting}
                  className="h-14 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/80 font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[var(--color-bg)] enabled:active:scale-[0.98] transition-all"
                >
                  {minutes === 60 ? "1 hr" : `${minutes} min`}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
