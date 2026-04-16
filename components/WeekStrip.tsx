"use client";

import { useState, useEffect } from "react";
import { getEntriesForDateRange, type Entry } from "@/lib/db";
import { getCategoryStyle, type Category } from "@/lib/categories";

interface WeekStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  categories: Category[];
}

function getWeekDates(centerDate: string): string[] {
  const d = new Date(centerDate + "T12:00:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date.toISOString().split("T")[0]);
  }
  return dates;
}

function getDayLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" });
}

function getDayNumber(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").getDate().toString();
}

export default function WeekStrip({ selectedDate, onSelectDate, categories }: WeekStripProps) {
  const [entriesByDate, setEntriesByDate] = useState<Record<string, Entry[]>>({});
  const weekDates = getWeekDates(selectedDate);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const start = weekDates[0];
    const end = weekDates[6];
    getEntriesForDateRange(start, end).then((entries) => {
      const grouped: Record<string, Entry[]> = {};
      for (const e of entries) {
        if (!grouped[e.date]) grouped[e.date] = [];
        grouped[e.date].push(e);
      }
      setEntriesByDate(grouped);
    });
  }, [selectedDate]);

  return (
    <div className="flex gap-1.5 mb-5 px-1">
      {weekDates.map((date) => {
        const isSelected = date === selectedDate;
        const isToday = date === today;
        const dayEntries = entriesByDate[date] || [];

        return (
          <button
            key={date}
            onClick={() => onSelectDate(date)}
            className={`flex-1 flex flex-col items-center gap-1.5 pb-2 pt-2.5 rounded-[18px] transition-all duration-300 active:scale-[0.94] relative overflow-hidden ${
              isSelected
                ? "bg-[var(--color-surface)] shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)] border border-[var(--color-border)] ring-1 ring-[var(--color-border)]"
                : "hover:bg-[var(--color-surface)] border border-transparent opacity-80 hover:opacity-100"
            }`}
          >
            {isSelected && (
              <div className="absolute top-0 inset-x-0 h-[3px] bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]" />
            )}
            
            <span className={`text-[10px] font-bold tracking-widest uppercase ${
              isSelected ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] mt-[3px]"
            }`}>
              {getDayLabel(date)}
            </span>
            <span className={`text-[16px] leading-none font-bold tabular-nums ${
              isSelected ? "text-[var(--color-text)]" : isToday ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
            }`}>
              {getDayNumber(date)}
            </span>
            
            {/* Mini blocks */}
            <div className="flex gap-[2px] h-[14px] items-end px-1 w-full justify-center mt-auto">
              {dayEntries.slice(0, 5).map((entry, i) => {
                const cat = getCategoryStyle(entry.tags[0] || "Other", categories);
                const duration = (entry.endTime && entry.startTime) ? Math.max(entry.endTime - entry.startTime, 0) : 0;
                const h = Math.max(4, Math.min(14, (duration / 3600000) * 10));
                return (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{
                      width: 3.5,
                      height: h,
                      backgroundColor: cat.color,
                      opacity: isSelected ? 1 : 0.6,
                    }}
                  />
                );
              })}
            </div>

            {isToday && !isSelected && (
              <div className="absolute bottom-1 w-1 h-1 rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
