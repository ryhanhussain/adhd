"use client";

import { useState, useEffect } from "react";
import { getGardenData, getGardenDates, type GardenData } from "@/lib/garden";
import { toLocalDateStr } from "@/lib/db";

interface CheckInGardenProps {
  hasLoggedToday: boolean;
}

function getCellOpacity(count: number): number {
  if (count === 0) return 0.08;
  if (count === 1) return 0.3;
  if (count <= 3) return 0.55;
  return 0.9;
}

const DAY_LABELS = ["M", "", "W", "", "F", "", ""];

export default function CheckInGarden({ hasLoggedToday }: CheckInGardenProps) {
  const [data, setData] = useState<GardenData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getGardenData().then(setData);
    const handle = () => getGardenData().then(setData);
    window.addEventListener("entry-updated", handle);
    return () => window.removeEventListener("entry-updated", handle);
  }, []);

  if (!data) return null;

  const today = toLocalDateStr(new Date());
  const compactDates = getGardenDates(4); // Last 4 weeks
  const expandedDates = getGardenDates(12); // Last 12 weeks

  const dates = expanded ? expandedDates : compactDates;
  const weeks = Math.ceil(dates.length / 7);

  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* Compact garden grid */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex flex-col items-end gap-0.5 group cursor-pointer"
        aria-label={`${data.totalDays} days planted. Tap to ${expanded ? "collapse" : "expand"} garden.`}
      >
        <div className="flex gap-0.5">
          {/* Day labels (only in expanded) */}
          {expanded && (
            <div className="flex flex-col gap-0.5 mr-0.5">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="flex items-center justify-end"
                  style={{ width: 8, height: 10 }}
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
                if (!date) return <div key={dayIdx} style={{ width: 10, height: 10 }} />;

                const count = data.dayCounts.get(date) || 0;
                const isToday = date === today;
                const isFuture = date > today;
                const opacity = isFuture ? 0.03 : getCellOpacity(count);

                return (
                  <div
                    key={dayIdx}
                    className={`rounded-[2px] transition-all duration-300 ${
                      isToday ? "ring-1 ring-[var(--color-accent)]/50" : ""
                    } ${isToday && count > 0 ? "animate-breathe" : ""}`}
                    style={{
                      width: 10,
                      height: 10,
                      backgroundColor: count > 0 ? "var(--color-accent)" : "var(--color-border)",
                      opacity,
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
        <span className="text-[10px] font-medium text-[var(--color-text-muted)]">
          {data.totalDays} {data.totalDays === 1 ? "day" : "days"} planted
        </span>
      </div>
    </div>
  );
}
