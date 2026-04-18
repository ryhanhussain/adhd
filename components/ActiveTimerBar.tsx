"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { getEntriesByDate, updateEntry, type Entry } from "@/lib/db";

function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function ActiveTimerBar() {
  const pathname = usePathname();
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finishing, setFinishing] = useState(false);

  const checkForActive = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const entries = await getEntriesByDate(today);
    const active = entries.find((e) => e.endTime === 0) || null;
    setActiveEntry(active);
  }, []);

  useEffect(() => {
    checkForActive();
    const interval = setInterval(checkForActive, 30000);

    const handleUpdate = () => checkForActive();
    window.addEventListener("entry-updated", handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener("entry-updated", handleUpdate);
    };
  }, [checkForActive]);

  useEffect(() => {
    if (!activeEntry) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  const handleFinish = async () => {
    if (!activeEntry || finishing) return;
    setFinishing(true);
    await updateEntry(activeEntry.id, { endTime: Date.now() });
    setActiveEntry(null);
    setFinishing(false);
    window.dispatchEvent(new Event("entry-updated"));
  };

  // Hide on home page (it has its own active card) or if no timer
  if (pathname === "/" || !activeEntry) return null;

  const elapsed = now - activeEntry.startTime;
  const displayText = activeEntry.summary || activeEntry.text;
  const truncatedText =
    displayText.length > 30
      ? displayText.slice(0, 30) + "…"
      : displayText;

  return (
    <div className="nav-dock fixed above-nav left-1/2 -translate-x-1/2 z-[45] w-full max-w-[20rem] px-4 transition-opacity duration-150">
      <div 
        className="glass-panel flex items-center gap-3 px-3 py-2 rounded-2xl shadow-xl animate-pop-in border border-[var(--color-accent)]/30 pointer-events-auto"
      >
        <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-now-pulse flex-shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{truncatedText}</span>
        <span className="text-sm font-bold tabular-nums text-[var(--color-accent)] flex-shrink-0 tracking-tight">
          {formatElapsed(elapsed)}
        </span>
        <button
          onClick={handleFinish}
          disabled={finishing}
          aria-label="Finish active timer"
          className="px-4 h-9 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-xs font-bold transition-all duration-300 hover:scale-[1.05] hover:shadow-[0_0_15px_var(--color-accent-soft)] active:scale-[0.95] disabled:opacity-50 disabled:hover:scale-100 flex-shrink-0"
        >
          Done
        </button>
      </div>
    </div>
  );
}
