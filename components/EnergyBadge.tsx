import { type EnergyLevel } from "@/lib/db";
import { getEnergyEmoji, getEnergyLabel } from "@/lib/energy";

interface EnergyBadgeProps {
  level: EnergyLevel;
  /** "inline" renders just the emoji with a title; "pill" renders emoji + label in a chip. */
  variant?: "inline" | "pill";
  className?: string;
}

export default function EnergyBadge({ level, variant = "inline", className = "" }: EnergyBadgeProps) {
  const emoji = getEnergyEmoji(level);
  const label = getEnergyLabel(level);

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 h-6 rounded-full text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] ${className}`}
        aria-label={`Energy: ${label}`}
      >
        <span aria-hidden="true">{emoji}</span>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`text-xs shrink-0 ${className}`}
      title={`Energy: ${label}`}
      aria-label={`Energy: ${label}`}
    >
      {emoji}
    </span>
  );
}
