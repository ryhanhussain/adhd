"use client";

import type { Intention, PriorityLevel, TimeRequired } from "@/lib/db";
import TaskRow from "./TaskRow";

export type TaskSortMode =
  | "urgency-desc"
  | "urgency-asc"
  | "time-asc"
  | "time-desc"
  | "manual";

interface TaskListProps {
  tasks: Intention[];
  visibleTasks: Intention[];
  expanded: boolean;
  sortMode: TaskSortMode;
  onExpandedChange: (expanded: boolean) => void;
  onSortModeChange: (mode: TaskSortMode) => void;
  onComplete: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStartFocus: (id: string) => void;
  onTextChange: (id: string, text: string) => Promise<void>;
  onPriorityChange: (id: string, priority: PriorityLevel | null) => Promise<void>;
  onTimeRequiredChange: (id: string, timeRequired: TimeRequired | null) => Promise<void>;
}

const sortOptions: { value: TaskSortMode; label: string }[] = [
  { value: "urgency-desc", label: "Urgency: high to low" },
  { value: "urgency-asc", label: "Urgency: low to high" },
  { value: "time-asc", label: "Time: quick to long" },
  { value: "time-desc", label: "Time: long to quick" },
  { value: "manual", label: "Manual" },
];

export default function TaskList({
  tasks,
  visibleTasks,
  expanded,
  sortMode,
  onExpandedChange,
  onSortModeChange,
  onComplete,
  onDelete,
  onStartFocus,
  onTextChange,
  onPriorityChange,
  onTimeRequiredChange,
}: TaskListProps) {
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold tracking-tight">Tasks</h2>
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {tasks.length === 0 ? "Nothing active" : `${tasks.length} active`}
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
          Sort
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as TaskSortMode)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs font-semibold text-[var(--color-text)]"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleTasks.length > 0 ? (
        <div className="flex flex-col gap-2">
          {visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              editable={expanded}
              onComplete={onComplete}
              onDelete={onDelete}
              onStartFocus={onStartFocus}
              onTextChange={onTextChange}
              onPriorityChange={onPriorityChange}
              onTimeRequiredChange={onTimeRequiredChange}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center">
          <p className="text-sm font-semibold">No tasks yet.</p>
        </div>
      )}

      {tasks.length > 5 && (
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="mt-3 h-10 w-full rounded-md border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        >
          {expanded ? "Show less" : `View all (${hiddenCount} more)`}
        </button>
      )}
    </section>
  );
}
