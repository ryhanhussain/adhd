"use client";

import { useState, useEffect, useMemo } from "react";
import { getEntriesForDateRange, toLocalDateStr, type Entry } from "@/lib/db";
import { getWordFrequencies, type WordFrequency } from "@/lib/wordcloud";

function getWeekRange(): [string, string] {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [toLocalDateStr(monday), toLocalDateStr(sunday)];
}

// Deterministic pseudo-random rotation based on word string
function getRotation(word: string): number {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
  }
  return ((hash % 11) - 5); // Range: -5 to +5 degrees
}

// Map weight (0–1) to font size (px)
function getFontSize(weight: number): number {
  return 12 + weight * 16; // 12px to 28px
}

// Map weight (0–1) to opacity
function getOpacity(weight: number): number {
  return 0.4 + weight * 0.6; // 0.4 to 1.0
}

// Cycle through accent-derived hues
const COLOR_VARIANTS = [
  "var(--color-accent)",
  "color-mix(in srgb, var(--color-accent) 70%, var(--color-success))",
  "color-mix(in srgb, var(--color-accent) 80%, var(--color-text))",
  "color-mix(in srgb, var(--color-accent) 60%, var(--color-danger))",
];

export default function VibeCloud() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const [start, end] = getWeekRange();
    getEntriesForDateRange(start, end).then(setEntries);

    const handle = () => {
      const [s, e] = getWeekRange();
      getEntriesForDateRange(s, e).then(setEntries);
    };
    window.addEventListener("entry-updated", handle);
    return () => window.removeEventListener("entry-updated", handle);
  }, []);

  const words = useMemo(() => getWordFrequencies(entries, 30), [entries]);

  if (words.length === 0) return null;

  return (
    <div className="animate-fade-in">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
        This Week&apos;s Vibe
      </h3>

      <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-1.5 px-2">
        {words.map((w, i) => (
          <span
            key={w.word}
            className="inline-block transition-transform hover:scale-110 cursor-default"
            style={{
              fontSize: `${getFontSize(w.weight)}px`,
              opacity: getOpacity(w.weight),
              color: COLOR_VARIANTS[i % COLOR_VARIANTS.length],
              fontWeight: w.weight > 0.6 ? 700 : w.weight > 0.3 ? 600 : 500,
              transform: `rotate(${getRotation(w.word)}deg)`,
              animation: `fadeIn 0.4s ease ${i * 30}ms backwards`,
              lineHeight: 1.4,
            }}
            title={`"${w.word}" — ${w.count} times`}
          >
            {w.word}
          </span>
        ))}
      </div>
    </div>
  );
}
