"use client";

import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/db";

export type HomeTab = "life" | "energy";

interface HomeTabsProps {
  value: HomeTab;
  onChange: (next: HomeTab) => void;
  /** Date string for the small "Today" overline. */
  dateLabel: string;
}

/**
 * Pill tab switcher for the home centerpiece. Persists selection in
 * IndexedDB Settings (synced via Supabase profiles row) so the choice
 * follows the user across devices.
 */
export default function HomeTabs({ value, onChange, dateLabel }: HomeTabsProps) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!hydrated) {
      void (async () => {
        try {
          const settings = await getSettings();
          const stored = settings.homeTab;
          if (!cancelled && (stored === "life" || stored === "energy") && stored !== value) {
            onChange(stored);
          }
        } catch {
          // IndexedDB may be unavailable; fall through with default.
        }
        if (!cancelled) setHydrated(true);
      })();
    }

    // React to remote pulls (categoriesSync applied a newer tab from another device).
    const onRemote = () => {
      void (async () => {
        try {
          const settings = await getSettings();
          const stored = settings.homeTab;
          if (!cancelled && (stored === "life" || stored === "energy") && stored !== value) {
            onChange(stored);
          }
        } catch { /* ignore */ }
      })();
    };
    window.addEventListener("home-tab-updated", onRemote);
    return () => {
      cancelled = true;
      window.removeEventListener("home-tab-updated", onRemote);
    };
  }, [hydrated, value, onChange]);

  const set = (next: HomeTab) => {
    if (next === value) return;
    onChange(next);
    void saveSettings({ homeTab: next });
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
