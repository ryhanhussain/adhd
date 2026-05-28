"use client";

import type { ReactNode } from "react";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Clock3, Inbox, ListOrdered } from "lucide-react";
import type { Intention, PriorityLevel, TimeRequired } from "@/lib/db";
import { Button, EmptyState, Panel, SectionHeader, SegmentedControl } from "@/components/ui/primitives";
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
  loading?: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSortModeChange: (mode: TaskSortMode) => void;
  onComplete: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTextChange: (id: string, text: string) => Promise<void>;
  onPriorityChange: (id: string, priority: PriorityLevel | null) => Promise<void>;
  onTimeRequiredChange: (id: string, timeRequired: TimeRequired | null) => Promise<void>;
}

const sortOptions: { value: TaskSortMode; label: string; icon?: ReactNode }[] = [
  { value: "urgency-desc", label: "High first", icon: <ArrowDownNarrowWide size={14} /> },
  { value: "urgency-asc", label: "Low first", icon: <ArrowUpNarrowWide size={14} /> },
  { value: "time-asc", label: "Quick first", icon: <Clock3 size={14} /> },
  { value: "time-desc", label: "Long first", icon: <Clock3 size={14} /> },
  { value: "manual", label: "Manual" },
];

export default function TaskList({
  tasks,
  visibleTasks,
  expanded,
  sortMode,
  loading = false,
  onExpandedChange,
  onSortModeChange,
  onComplete,
  onDelete,
  onTextChange,
  onPriorityChange,
  onTimeRequiredChange,
}: TaskListProps) {
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);

  return (
    <Panel className="grid gap-4">
      <SectionHeader
        title="Tasks"
        description={loading ? "Loading active tasks..." : tasks.length === 0 ? "Nothing active" : `${tasks.length} active`}
      />

      <SegmentedControl
        value={sortMode}
        onChange={onSortModeChange}
        ariaLabel="Sort active tasks"
        className="grid-cols-2 sm:grid-cols-5"
        options={sortOptions.map((option) => ({
          value: option.value,
          label: option.label,
          icon: option.icon ?? <ListOrdered size={14} />,
        }))}
      />

      {loading ? (
        <EmptyState
          title="Loading tasks"
          description="Your active list will appear here in a moment."
          className="py-7"
        />
      ) : visibleTasks.length > 0 ? (
        <div className="flex flex-col gap-2">
          {visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={onComplete}
              onDelete={onDelete}
              onTextChange={onTextChange}
              onPriorityChange={onPriorityChange}
              onTimeRequiredChange={onTimeRequiredChange}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Inbox size={20} />}
          title="No tasks yet"
          description="Start with a brain dump above."
          className="py-8"
        />
      )}

      {tasks.length > 5 && (
        <Button
          onClick={() => onExpandedChange(!expanded)}
          variant="secondary"
          fullWidth
        >
          {expanded ? "Show less" : `View all (${hiddenCount} more)`}
        </Button>
      )}
    </Panel>
  );
}
