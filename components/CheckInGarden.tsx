"use client";

import { useState, useEffect } from "react";
import { getGardenData, getGardenDates, type GardenData } from "@/lib/garden";
import { toLocalDateStr } from "@/lib/db";

interface CheckInGardenProps {
  hasLoggedToday: boolean;
  /**
   * "compact" (default): ~10px cells, 4-week view by default, tap to expand to 12.
   * "hero": ~14px cells, 12-week view by default, staggered paint-in animation —
   * used as the visual centrepiece in the morning home hero.
   */
  variant?: "compact" | "hero";
}

function getCellOpacity(count: number): number {
  if (count === 0) return 0.18;
  if (count === 1) return 0.4;
  if (count <= 3) return 0.65;
  return 1.0;
}

const DAY_LABELS = ["M", "", "W", "", "F", "", ""];

export default function CheckInGarden({ hasLoggedToday, variant = "compact" }: CheckInGardenProps) {
  const [data, setData] = useState<GardenData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getGardenData().then(setData);
    const handle = () => getGardenData().then(setData);
    window.addEventListener("entry-updated", handle);
    return () => window.removeEventListener("entry-updated", handle);
  }, []);

  if (!data) return null;

  const isHero = variant === "hero";
  const cellSize = isHero ? 14 : 10;
  const labelWidth = isHero ? 10 : 8;

  const today = toLocalDateStr(new Date());
  const compactDates = getGardenDates(4);
  const expandedDates = getGardenDates(12);

  // Hero defaults to the 12-week view without needing a tap; still tap-toggles.
  const showExpanded = isHero ? !expanded : expanded;
  const dates = showExpanded ? expandedDates : compactDates;
  const weeks = Math.ceil(dates.length / 7);
  const showLabels = showExpanded;

  return (
    <div className={`flex flex-col gap-1.5 ${isHero ? "items-start" : "items-end"}`}>
      {/* Garden grid */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex flex-col gap-0.5 group cursor-pointer ${isHero ? "items-start" : "items-end"}`}
        aria-label={`${data.totalDays} days planted. Tap to ${showExpanded ? "collapse" : "expand"} garden.`}
      >
        <div className="flex gap-0.5">
          {/* Day labels (only when expanded) */}
          {showLabels && (
            <div className="flex flex-col gap-0.5 mr-0.5">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="flex items-center justify-end"
                  style={{ width: labelWidth, height: cellSize }}
                >
                  <span className="text-[6px] text-[var(--color-text-muted)]">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Grid columns (each column = 1 week) */}
          {Array.from({ length: weeks }, (_, weekIdx) => (
            <div key={weekIdx} className="flex flex-col gap-0.5">
              {Array.from({ length: 7 }, (_, dayIdx) => {
                const dateIdx = weekIdx * 7 + dayIdx;
                const date = dates[dateIdx];
                if (!date)
                  return <div key={dayIdx} style={{ width: cellSize, height: cellSize }} />;

                const count = data.dayCounts.get(date) || 0;
                const isToday = date === today;
                const isFuture = date > today;
                const opacity = isFuture ? 0.03 : getCellOpacity(count);

                const heroDelay = isHero ? `${weekIdx * 20}ms` : undefined;

                return (
                  <div
                    key={dayIdx}
                    className={`rounded-[2px] transition-all duration-300 ${
                      isToday ? "ring-1 ring-[var(--color-accent)]/50" : ""
                    } ${isToday && count > 0 ? "animate-breathe" : ""} ${
                      isHero ? "animate-fade-in" : ""
                    }`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: count > 0 ? "var(--color-accent)" : "var(--color-border)",
                      opacity,
                      animationDelay: heroDelay,
                    }}
                    title={`${date}: ${count} ${count === 1 ? "entry" : "entries"}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </button>

      {/* Label */}
      <div className="flex items-center gap-1.5">
        {hasLoggedToday && (
          <span className="text-[10px] text-[var(--color-success)]">●</span>
        )}
        <span className={`font-medium text-[var(--color-text-muted)] ${isHero ? "text-xs" : "text-[10px]"}`}>
          {data.totalDays} {data.totalDays === 1 ? "day" : "days"} planted
        </span>
      </div>
    </div>
  );
}
