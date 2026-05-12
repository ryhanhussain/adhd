"use client";

import type { Intention, EnergyLevel } from "@/lib/db";
import type { BucketIconKey, IntentionCategory } from "@/lib/categories";
import IntentionItem from "@/components/IntentionItem";
import BucketIcon from "./BucketIcon";

interface BucketCardProps {
  /** Used as the data-section-key for cross-card drop detection in BucketGrid. */
  sectionKey: string;
  /** Display name (bucket name or energy level label, etc). */
  name: string;
  /** Subtle descriptor, e.g. bucket description. Optional. */
  description?: string | null;
  /** Hex color used for icon chip + tinted card background. */
  color: string;
  /** Icon shown in the colored chip. */
  icon: BucketIconKey;
  /** Active intentions belonging to this card, pre-sorted by `order`. */
  items: Intention[];
  /** All user buckets (passed through to IntentionItem for completion form). */
  intentionCategories?: IntentionCategory[];
  /** Highlight the row currently being dragged. */
  draggingId?: string | null;
  /** Intention currently running a Pomodoro; gets a FOCUSING pill + tint. */
  focusedIntentionId?: string | null;
  /** When true, IntentionItem renders the energy chip's text label. */
  showEnergyLabel?: boolean;

  // Mutation handlers — wired straight into the home page.
  onComplete: (id: string, note: string, startTime: number, endTime: number, energy?: EnergyLevel | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategoryChange?: (id: string, categoryId: string | null) => Promise<void>;
  onEnergyChange?: (id: string, energy: EnergyLevel | null) => Promise<void>;
  onTextChange?: (id: string, text: string) => Promise<void>;
}

/**
 * One card in the home bucket grid. Matches the screenshot:
 *   ┌─────────────────────────┐
 *   │ [icon] Name         3 ◀ count
 *   │  ── description ──
 *   │  ◯ task one
 *   │  ◯ task two
 *   │  ◯ task three
 *   └─────────────────────────┘
 *
 * Tinted background uses `color-mix` so the wash is consistent across all
 * eight palette colors and adapts to light/dark via `var(--color-surface)`.
 */
export default function BucketCard({
  sectionKey,
  name,
  description,
  color,
  icon,
  items,
  intentionCategories,
  draggingId,
  focusedIntentionId,
  showEnergyLabel,
  onComplete,
  onDelete,
  onCategoryChange,
  onEnergyChange,
  onTextChange,
}: BucketCardProps) {
  const count = items.length;

  const cardStyle: React.CSSProperties = {
    backgroundColor: `color-mix(in srgb, ${color} 8%, var(--color-surface))`,
    borderColor: `color-mix(in srgb, ${color} 20%, var(--glass-border))`,
  };

  const chipStyle: React.CSSProperties = {
    backgroundColor: `color-mix(in srgb, ${color} 18%, var(--color-surface))`,
    color: color,
  };

  return (
    <div
      data-section-key={sectionKey}
      className="rounded-3xl border p-4 shadow-sm flex flex-col gap-2 min-h-[7rem] transition-colors"
      style={cardStyle}
    >
      {/* Header: icon chip + name + count */}
      <div className="flex items-center gap-2.5">
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={chipStyle}
          aria-hidden="true"
        >
          <BucketIcon name={icon} size={18} />
        </span>
        <h3 className="flex-1 text-sm font-bold tracking-tight truncate">{name}</h3>
        <span className="text-xs font-semibold tabular-nums text-[var(--color-text-muted)]">
          {count}
        </span>
      </div>

      {description && (
        <p className="text-[11px] text-[var(--color-text-muted)] leading-snug -mt-1 ml-[2.625rem]">
          {description}
        </p>
      )}

      {/* Items list — slim row variant of IntentionItem */}
      {count === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]/70 italic ml-[2.625rem] py-1">
          Nothing here yet.
        </p>
      ) : (
        <div className="flex flex-col">
          {items.map((intention) => (
            <div
              key={intention.id}
              className={`transition-transform ${
                draggingId === intention.id
                  ? "scale-[1.02] shadow-lg shadow-black/10 rounded-xl bg-[var(--color-bg)]/60"
                  : ""
              }`}
            >
              <IntentionItem
                intention={intention}
                onComplete={onComplete}
                onDelete={onDelete}
                intentionCategories={intentionCategories}
                onCategoryChange={onCategoryChange}
                onEnergyChange={onEnergyChange}
                onTextChange={onTextChange}
                compact
                focused={focusedIntentionId === intention.id}
                showEnergyLabel={showEnergyLabel}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
