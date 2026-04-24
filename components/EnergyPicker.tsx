"use client";

import type { EnergyLevel } from "@/lib/db";
import { getEnergyColor, getEnergyEmoji, getEnergyLabel, ENERGY_LEVELS } from "@/lib/energy";

interface EnergyPickerProps {
  value: EnergyLevel | null;
  onChange: (level: EnergyLevel | null) => void;
}

export default function EnergyPicker({ value, onChange }: EnergyPickerProps) {
  return (
    <div className="flex gap-1.5">
      {ENERGY_LEVELS.map((level) => {
        const active = value === level;
        const color = getEnergyColor(level);
        return (
          <button
            key={level}
            type="button"
            onClick={() => onChange(active ? null : level)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 ${
              active
                ? "shadow-sm scale-[1.02]"
                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text)]/20"
            }`}
            style={
              active
                ? {
                    backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                    color,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
                  }
                : undefined
            }
            title={getEnergyLabel(level)}
          >
            <span className="text-sm leading-none">{getEnergyEmoji(level)}</span>
            <span className="hidden sm:inline">{getEnergyLabel(level)}</span>
          </button>
        );
      })}
    </div>
  );
}
