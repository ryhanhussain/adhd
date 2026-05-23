"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCompletedIntentionsForDateRange,
  toLocalDateStr,
  type Intention,
} from "@/lib/db";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + (6 - d.getDay()));
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthTitle(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dayTitle(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function tasksByDate(tasks: Intention[]): Map<string, Intention[]> {
  const map = new Map<string, Intention[]>();
  for (const task of tasks) {
    if (!task.completedAt) continue;
    const date = toLocalDateStr(task.completedAt);
    const existing = map.get(date) ?? [];
    existing.push(task);
    map.set(date, existing);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  }
  return map;
}

export default function MonthlyCalendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateStr(new Date()));
  const [completed, setCompleted] = useState<Intention[]>([]);

  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    const days: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      days.push(new Date(d));
    }
    return days;
  }, [month]);

  const range = useMemo(() => {
    const first = grid[0] ?? startOfMonth(month);
    const last = grid[grid.length - 1] ?? endOfMonth(month);
    return { start: toLocalDateStr(first), end: toLocalDateStr(last) };
  }, [grid, month]);

  const load = useCallback(async () => {
    setCompleted(await getCompletedIntentionsForDateRange(range.start, range.end));
  }, [range.end, range.start]);

  useEffect(() => {
    void load();
    const handleUpdate = () => void load();
    window.addEventListener("entry-updated", handleUpdate);
    return () => window.removeEventListener("entry-updated", handleUpdate);
  }, [load]);

  const grouped = useMemo(() => tasksByDate(completed), [completed]);
  const selectedTasks = grouped.get(selectedDate) ?? [];
  const today = toLocalDateStr(new Date());

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-20">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Calendar
          </p>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{monthTitle(month)}</h1>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => setMonth((current) => addMonths(current, -1))}
            className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm font-semibold"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setMonth(startOfMonth(now));
              setSelectedDate(toLocalDateStr(now));
            }}
            className="h-10 rounded-lg bg-[var(--color-accent)] px-3 text-sm font-semibold text-[var(--color-on-accent)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMonth((current) => addMonths(current, 1))}
            className="h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm font-semibold"
          >
            Next
          </button>
        </div>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2 sm:p-3">
        <div className="grid grid-cols-7 border-b border-[var(--color-border)] pb-2">
          {weekdayLabels.map((label) => (
            <div key={label} className="text-center text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              {label}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {grid.map((date) => {
            const dateStr = toLocalDateStr(date);
            const count = grouped.get(dateStr)?.length ?? 0;
            const inMonth = date.getMonth() === month.getMonth();
            const isToday = dateStr === today;
            const selected = dateStr === selectedDate;
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setSelectedDate(dateStr)}
                className={`flex min-h-20 flex-col items-start rounded-lg border p-2 text-left transition-colors sm:min-h-28 ${
                  selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]/50"
                } ${inMonth ? "" : "opacity-45"}`}
              >
                <span
                  className={`grid h-7 w-7 place-items-center rounded-md text-xs font-bold ${
                    isToday ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]" : ""
                  }`}
                >
                  {date.getDate()}
                </span>
                {count > 0 && (
                  <span className="mt-auto rounded-md bg-[var(--color-bg)] px-2 py-1 text-[11px] font-bold text-[var(--color-text)]">
                    {count} done
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <h2 className="text-base font-bold">{dayTitle(selectedDate)}</h2>
        {selectedTasks.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {selectedTasks.map((task) => (
              <li key={task.id} className="rounded-lg bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold">
                {task.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm font-medium text-[var(--color-text-muted)]">No completed tasks.</p>
        )}
      </aside>
    </div>
  );
}
