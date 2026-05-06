"use client";

import { useEffect, useState } from "react";
import type { Entry } from "@/lib/db";

function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface ActiveTimerCardProps {
  /** The currently running entry (endTime === 0). When null, the card renders nothing. */
  activeEntry: Entry | null | undefined;
  /** Closes the timer; the parent owns the DB update. */
  onFinish: () => void;
  className?: string;
}

/**
 * Standalone card for the running timer. Same visual treatment as the inline
 * block previously hard-coded in `app/page.tsx`, extracted so it can render in
 * either the main column (mobile) or the desktop right rail without
 * duplicating the elapsed-time effect.
 */
export default function ActiveTimerCard({ activeEntry, onFinish, className }: ActiveTimerCardProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!activeEntry) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  if (!activeEntry) return null;

  return (
    <div
      className={`rounded-2xl p-4 border-2 border-[var(--color-accent)] animate-fade-in animate-breathe ${className ?? ""}`}
      style={{ backgroundColor: "var(--color-accent-soft)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-now-pulse" />
          <span className="text-xs font-semibold text-[var(--color-accent)]">Active now</span>
        </div>
        <span className="text-sm font-semibold tabular-nums text-[var(--color-accent)]">
          {formatElapsed(now - activeEntry.startTime)}
        </span>
      </div>
      <p className="text-sm mb-3">{activeEntry.summary || activeEntry.text}</p>
      <button
        onClick={onFinish}
        className="w-full h-11 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium active:scale-[0.98] transition-transform"
      >
        Just Finished
      </button>
    </div>
  );
}
