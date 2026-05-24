"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  getCompletedIntentionsForDateRange,
  toLocalDateStr,
  type Intention,
} from "@/lib/db";
import { Button, EmptyState, IconButton, MetadataChip, PageHeader, PageShell, Panel, cn } from "@/components/ui/primitives";

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
    <PageShell maxWidth="xl">
      <PageHeader
        eyebrow="Calendar"
        title={monthTitle(month)}
        description="Completed tasks by day."
        actions={
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 sm:flex">
            <IconButton
              label="Previous month"
              onClick={() => setMonth((current) => addMonths(current, -1))}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </IconButton>
            <Button
              onClick={() => {
                const now = new Date();
                setMonth(startOfMonth(now));
                setSelectedDate(toLocalDateStr(now));
              }}
              variant="primary"
            >
              <CalendarDays size={17} />
              Today
            </Button>
            <IconButton
              label="Next month"
              onClick={() => setMonth((current) => addMonths(current, 1))}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </IconButton>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <Panel className="p-2 sm:p-3">
          <div className="grid grid-cols-7 border-b border-[var(--color-border)] pb-2">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="text-center text-[10px] font-black uppercase tracking-[0.12em] text-[var(--color-text-muted)] sm:text-[11px]"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-1.5">
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
                  className={cn(
                    "flex aspect-square min-h-12 flex-col items-start rounded-xl border p-1.5 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] sm:min-h-20 sm:p-2 lg:min-h-24",
                    selected
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_12px_30px_-24px_var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-surface-elevated)]",
                    !inMonth && "opacity-45"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-lg text-xs font-black sm:h-7 sm:w-7",
                      isToday && "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {count > 0 && (
                    <span className="mt-auto inline-flex min-h-5 items-center rounded-full bg-[var(--color-bg)] px-1.5 text-[10px] font-black text-[var(--color-text)] sm:min-h-6 sm:px-2 sm:text-[11px]">
                      <span className="sm:hidden">{count}</span>
                      <span className="hidden sm:inline">{count} done</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel as="aside" className="lg:sticky lg:top-24">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                Selected day
              </p>
              <h2 className="mt-1 text-lg font-black leading-tight">{dayTitle(selectedDate)}</h2>
            </div>
            <MetadataChip tone={selectedTasks.length > 0 ? "success" : "neutral"}>
              <CalendarCheck2 size={13} />
              {selectedTasks.length}
            </MetadataChip>
          </div>

          {selectedTasks.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {selectedTasks.map((task) => (
                <li
                  key={task.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm font-bold"
                >
                  <CheckCircle2 size={16} className="mt-0.5 text-[var(--color-success)]" aria-hidden="true" />
                  <span className="min-w-0 break-words">{task.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<CalendarDays size={20} />}
              title="No completed tasks"
              description="Completed work for this day will appear here."
              className="mt-4 py-8"
            />
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
