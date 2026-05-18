"use client";

import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/db";

export type HomeTab = "life" | "energy";

interface HomeTabsProps {
  value: HomeTab;
  onChange: (next: HomeTab) => void;
  /** Small-caps overline above the headline, e.g. "TODAY · TUESDAY". */
  overline?: string;
  /** Display headline; e.g. "May 12". When omitted, falls back to dateLabel. */
  headline?: string;
  /** One-line subtitle under the headline (greeting + counts). */
  subtitle?: string;
  /** Legacy single-line date label used when overline/headline aren't passed. */
  dateLabel?: string;
  /** Hide grouping controls when another surface owns the backlog controls. */
  showTabs?: boolean;
}

/**
 * Pill tab switcher for the home centerpiece. Persists selection in
 * IndexedDB Settings (synced via Supabase profiles row) so the choice
 * follows the user across devices.
 */
export default function HomeTabs({
  value,
  onChange,
  overline,
  headline,
  subtitle,
  dateLabel,
  showTabs = true,
}: HomeTabsProps) {
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

  const resolvedOverline = overline ?? "Today";
  const resolvedHeadline = headline ?? dateLabel ?? "";

  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)] mb-0.5">
          {resolvedOverline}
        </p>
        <h1 className="text-4xl lg:text-6xl font-black tracking-tight leading-none">
          {resolvedHeadline}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm lg:text-base text-[var(--color-text-muted)] leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {showTabs && (
        <div
          role="tablist"
          aria-label="Group intentions by"
          className="glass-control inline-flex p-1 rounded-full flex-shrink-0"
        >
          <TabButton active={value === "life"} onClick={() => set("life")}>
            Life areas
          </TabButton>
          <TabButton active={value === "energy"} onClick={() => set("energy")}>
            Energy
          </TabButton>
        </div>
      )}
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
          ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_10px_24px_-14px_var(--color-accent)]"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}
