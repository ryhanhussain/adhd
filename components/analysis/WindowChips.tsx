"use client";

import { type PeriodWindow } from "@/lib/analysis";

interface WindowChipsProps {
  value: PeriodWindow;
  onChange: (w: PeriodWindow) => void;
}

const OPTIONS: { value: PeriodWindow; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 400, label: "All time" },
];

export default function WindowChips({ value, onChange }: WindowChipsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-shrink-0 px-4 h-10 rounded-full text-sm font-semibold transition-all active:scale-95 ${
              active
                ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-md shadow-[var(--color-accent)]/20"
                : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--color-text)]"
            }`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
