"use client";

import { useEffect, useState } from "react";

export type HomeTab = "life" | "energy";

const STORAGE_KEY = "addit:home-tab";

interface HomeTabsProps {
  value: HomeTab;
  onChange: (next: HomeTab) => void;
  /** Date string for the small "Today" overline. */
  dateLabel: string;
}

/**
 * Pill tab switcher for the home centerpiece. Persists selection in
 * localStorage so a hard refresh keeps the user in the view they were last
 * using, rather than snapping back to "Life areas".
 */
export default function HomeTabs({ value, onChange, dateLabel }: HomeTabsProps) {
  const [hydrated, setHydrated] = useState(false);

  // Read persisted choice exactly once after mount (avoids SSR mismatch).
  useEffect(() => {
    if (hydrated) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "life" || stored === "energy") {
        if (stored !== value) onChange(stored);
      }
    } catch {
      // localStorage may be unavailable (private mode); silently fall back.
    }
    setHydrated(true);
  }, [hydrated, value, onChange]);

  const set = (next: HomeTab) => {
    if (next === value) return;
    onChange(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  };

  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] mb-0.5">
          Today
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{dateLabel}</h1>
      </div>
      <div
        role="tablist"
        aria-label="Group intentions by"
        className="inline-flex p-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
      >
        <TabButton active={value === "life"} onClick={() => set("life")}>
          Life areas
        </TabButton>
        <TabButton active={value === "energy"} onClick={() => set("energy")}>
          Energy
        </TabButton>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
        active
          ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-sm"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}
