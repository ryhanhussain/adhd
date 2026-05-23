"use client";

import type { PriorityLevel, TimeRequired } from "@/lib/db";

interface TaskMetadataEditorProps {
  priority: PriorityLevel | null | undefined;
  timeRequired: TimeRequired | null | undefined;
  onPriorityChange: (priority: PriorityLevel | null) => void;
  onTimeRequiredChange: (timeRequired: TimeRequired | null) => void;
}

const priorities: { value: PriorityLevel | null; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: null, label: "None" },
];

const times: { value: TimeRequired | null; label: string }[] = [
  { value: "quick", label: "Quick" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
  { value: null, label: "Unset" },
];

export default function TaskMetadataEditor({
  priority,
  timeRequired,
  onPriorityChange,
  onTimeRequiredChange,
}: TaskMetadataEditorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Urgency
        </span>
        <select
          value={priority ?? ""}
          onChange={(event) => onPriorityChange((event.target.value || null) as PriorityLevel | null)}
          className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs font-semibold"
        >
          {priorities.map((option) => (
            <option key={option.value ?? "none"} value={option.value ?? ""}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Time
        </span>
        <select
          value={timeRequired ?? ""}
          onChange={(event) => onTimeRequiredChange((event.target.value || null) as TimeRequired | null)}
          className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs font-semibold"
        >
          {times.map((option) => (
            <option key={option.value ?? "none"} value={option.value ?? ""}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
