"use client";

import React, { useState, useEffect } from "react";
import { getEntriesForDateRange, type Entry, type EnergyLevel } from "@/lib/db";
import { getWeeklyEnergyData, getEnergyColor } from "@/lib/energy";

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

function getWeekEnd(startDate: string): string {
  const d = new Date(startDate + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

// Map multiple energy levels in one cell to a dominant one
function dominantEnergy(levels: EnergyLevel[]): EnergyLevel {
  const counts = { high: 0, medium: 0, low: 0, scattered: 0 };
  for (const l of levels) counts[l]++;
  const max = Math.max(counts.high, counts.medium, counts.low, counts.scattered);
  if (counts.high === max) return "high";
  if (counts.medium === max) return "medium";
  if (counts.low === max) return "low";
  return "scattered";
}

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

export default function WeeklyEnergyHeatmap() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const weekStart = getWeekStart();
    const weekEnd = getWeekEnd(weekStart);
    getEntriesForDateRange(weekStart, weekEnd).then(setEntries);

    const handle = () => {
      const ws = getWeekStart();
      getEntriesForDateRange(ws, getWeekEnd(ws)).then(setEntries);
    };
    window.addEventListener("entry-updated", handle);
    return () => window.removeEventListener("entry-updated", handle);
  }, []);

  const weekStart = getWeekStart();
  const data = getWeeklyEnergyData(entries, weekStart);

  // Check if there's any energy data at all
  const totalEnergy = data.summary.high + data.summary.medium + data.summary.low + data.summary.scattered;
  if (totalEnergy === 0) return null;

  const today = new Date().getDay();
  const todayIdx = today === 0 ? 6 : today - 1;

  return (
    <div className="animate-fade-in">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
        Energy Patterns
      </h3>

      {/* Heatmap grid */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `24px repeat(7, 1fr)` }}>
          {/* Header row: day labels */}
          <div /> {/* empty corner */}
          {data.days.map((d, i) => (
            <div
              key={d.date}
              className="text-[8px] font-medium text-center pb-1"
              style={{ color: i === todayIdx ? "var(--color-accent)" : "var(--color-text-muted)", minWidth: 28 }}
            >
              {d.day}
            </div>
          ))}

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <React.Fragment key={hour}>
              <div className="text-[7px] text-[var(--color-text-muted)] text-right pr-1 leading-none flex items-center justify-end">
                {hour % 12 || 12}{hour >= 12 ? "p" : "a"}
              </div>
              {data.days.map((d) => {
                const levels = d.hourly.get(hour);
                const hasData = levels && levels.length > 0;
                const color = hasData ? getEnergyColor(dominantEnergy(levels)) : undefined;

                return (
                  <div
                    key={`${d.date}-${hour}`}
                    className="rounded-sm transition-colors"
                    style={{
                      width: 28,
                      height: 10,
                      backgroundColor: hasData ? color : "var(--color-border)",
                      opacity: hasData ? 0.85 : 0.15,
                    }}
                    title={hasData ? `${d.day} ${hour % 12 || 12}${hour >= 12 ? "PM" : "AM"}: ${dominantEnergy(levels)}` : undefined}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-2 justify-center">
        {(["high", "medium", "low", "scattered"] as const).map((level) => (
          <div key={level} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: getEnergyColor(level) }}
            />
            <span className="text-[8px] text-[var(--color-text-muted)] capitalize">{level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
