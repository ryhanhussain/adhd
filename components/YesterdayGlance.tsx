"use client";

import { useEffect, useState } from "react";
import { getEntriesByDate, toLocalDateStr, type Entry } from "@/lib/db";
import { getEntryDuration, getTopCategoryForEntries } from "@/lib/analysis";
import { useCategories } from "@/lib/useCategories";
import CheckInGarden from "./CheckInGarden";

interface YesterdayGlanceProps {
  greeting: string;
  entriesTodayCount: number;
  hasLoggedToday: boolean;
}

function formatMinutes(m: number): string {
  if (m <= 0) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

function yesterdayDateStr(): string {
  return toLocalDateStr(new Date(Date.now() - 864e5));
}

export default function YesterdayGlance({
  greeting,
  entriesTodayCount,
  hasLoggedToday,
}: YesterdayGlanceProps) {
  const categories = useCategories();
  const [yesterdayEntries, setYesterdayEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const d = yesterdayDateStr();
    getEntriesByDate(d).then((rows) => {
      setYesterdayEntries(rows);
      setLoaded(true);
    });
    const handle = () => {
      getEntriesByDate(yesterdayDateStr()).then(setYesterdayEntries);
    };
    window.addEventListener("entry-updated", handle);
    return () => window.removeEventListener("entry-updated", handle);
  }, []);

  const totalMins = yesterdayEntries.reduce((sum, e) => sum + getEntryDuration(e), 0);
  const topCat = getTopCategoryForEntries(yesterdayEntries, categories);

  const recap =
    loaded && yesterdayEntries.length > 0 && totalMins > 0
      ? topCat
        ? `Yesterday: ${formatMinutes(totalMins)}, mostly ${topCat.name}`
        : `Yesterday: ${formatMinutes(totalMins)} logged`
      : loaded
        ? "Fresh start — what's today?"
        : null;

  // Subtle gradient tint derived from yesterday's top category, mixed with
  // the accent-soft token so light/dark themes both stay calm.
  const tintStyle = topCat
    ? {
        backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${topCat.color} 14%, transparent) 0%, transparent 60%)`,
      }
    : undefined;

  return (
    <div
      className="glass-panel rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden animate-fade-in"
      style={tintStyle}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
          {entriesTodayCount > 0 && (
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {entriesTodayCount} {entriesTodayCount === 1 ? "entry" : "entries"} today
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-center py-2">
        <CheckInGarden hasLoggedToday={hasLoggedToday} variant="hero" />
      </div>

      {recap && (
        <p className="text-sm text-[var(--color-text-muted)] text-center animate-fade-in">
          {recap}
        </p>
      )}
    </div>
  );
}
