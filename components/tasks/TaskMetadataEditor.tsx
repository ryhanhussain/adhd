"use client";

import { Clock3, Flag, Minus } from "lucide-react";
import type { PriorityLevel, TimeRequired } from "@/lib/db";
import { SegmentedControl } from "@/components/ui/primitives";

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
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
          Urgency
        </span>
        <SegmentedControl
          value={priority ?? "none"}
          onChange={(value) => onPriorityChange(value === "none" ? null : (value as PriorityLevel))}
          ariaLabel="Task urgency"
          className="grid-cols-4"
          options={priorities.map((option) => ({
            value: option.value ?? "none",
            label: option.label,
            icon: option.value ? <Flag size={14} /> : <Minus size={14} />,
          }))}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
          Time
        </span>
        <SegmentedControl
          value={timeRequired ?? "none"}
          onChange={(value) => onTimeRequiredChange(value === "none" ? null : (value as TimeRequired))}
          ariaLabel="Task time required"
          className="grid-cols-4"
          options={times.map((option) => ({
            value: option.value ?? "none",
            label: option.label,
            icon: option.value ? <Clock3 size={14} /> : <Minus size={14} />,
          }))}
        />
      </div>
    </div>
  );
}
