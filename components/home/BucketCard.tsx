"use client";

import type { Intention, EnergyLevel } from "@/lib/db";
import type { BucketIconKey, Category, IntentionCategory } from "@/lib/categories";
import type { LifeArea } from "@/lib/lifeAreas";
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
  lifeAreas?: LifeArea[];
  categories?: Category[];
  /** Highlight the row currently being dragged. */
  draggingId?: string | null;
  /** Intention currently running a Pomodoro; gets a FOCUSING pill + tint. */
  focusedIntentionId?: string | null;
  /** When true, IntentionItem renders the energy chip's text label. */
  showEnergyLabel?: boolean;
  /** When true, hides the bucket chip picker on all intention items. */
  hideBucketChip?: boolean;
  /** When true, hides the energy chip picker on all intention items. */
  hideEnergyChip?: boolean;
  pullLabel?: string;
  pullDisabled?: boolean;
  onPullToNowNext?: (id: string) => Promise<void>;
  /** Parent-driven inline edit target, used by the Home coach reframe action. */
  editingIntentionId?: string | null;
  editSignal?: number;

  // Mutation handlers — wired straight into the home page.
  onComplete: (id: string, note: string, startTime: number, endTime: number, energy?: EnergyLevel | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategoryChange?: (id: string, categoryId: string | null) => Promise<void>;
  onEnergyChange?: (id: string, energy: EnergyLevel | null) => Promise<void>;
  onLifeAreaChange?: (id: string, lifeAreaId: string | null) => Promise<void>;
  onPriorityChange?: (id: string, priority: Intention["priority"] | null) => Promise<void>;
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
 * Tinted background uses `color-mix` so each bucket reads as a soft pastel
 * container while the task rows remain solid white pills for contrast.
 */
export default function BucketCard({
  sectionKey,
  name,
  description,
  color,
  icon,
  items,
  intentionCategories,
  lifeAreas,
  categories,
  draggingId,
  focusedIntentionId,
  showEnergyLabel,
  hideBucketChip,
  hideEnergyChip,
  pullLabel,
  pullDisabled,
  onPullToNowNext,
  editingIntentionId,
  editSignal = 0,
  onComplete,
  onDelete,
  onCategoryChange,
  onEnergyChange,
  onLifeAreaChange,
  onPriorityChange,
  onTextChange,
}: BucketCardProps) {
  const count = items.length;

  const cardStyle: React.CSSProperties = {
    background: `linear-gradient(180deg, color-mix(in srgb, ${color} 16%, #ffffff) 0%, color-mix(in srgb, ${color} 9%, #ffffff) 100%)`,
    borderColor: `color-mix(in srgb, ${color} 22%, #ffffff)`,
    color: "#1A1640",
  };

  const chipStyle: React.CSSProperties = {
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.9)",
    color: color,
  };

  return (
    <div
      data-section-key={sectionKey}
      className="rounded-3xl border p-4 shadow-[0_22px_50px_-36px_rgba(26,22,64,0.35)] flex flex-col gap-2.5 min-h-[7rem] transition-colors"
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
        <span className="text-xs font-semibold tabular-nums text-[#1A1640]/60">
          {count}
        </span>
      </div>

      {description && (
        <p className="text-[11px] text-[#1A1640]/60 leading-snug -mt-1 ml-[2.625rem]">
          {description}
        </p>
      )}

      {/* Items list — slim row variant of IntentionItem */}
      {count === 0 ? (
        <p className="text-xs text-[#1A1640]/50 italic ml-[2.625rem] py-1">
          Nothing here yet.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((intention) => (
            <div
              key={intention.id}
              className={`transition-transform ${
                draggingId === intention.id
                  ? "scale-[1.02] shadow-lg shadow-black/10 rounded-2xl bg-white/70"
                  : ""
              }`}
            >
              <IntentionItem
                intention={intention}
                onComplete={onComplete}
                onDelete={onDelete}
                intentionCategories={intentionCategories}
                lifeAreas={lifeAreas}
                categories={categories}
                onCategoryChange={onCategoryChange}
                onEnergyChange={onEnergyChange}
                onLifeAreaChange={onLifeAreaChange}
                onPriorityChange={onPriorityChange}
                onTextChange={onTextChange}
                compact
                focused={focusedIntentionId === intention.id}
                showEnergyLabel={showEnergyLabel}
                hideBucketChip={hideBucketChip}
                hideEnergyChip={hideEnergyChip}
                pullLabel={pullLabel}
                pullDisabled={pullDisabled}
                onPullToNowNext={onPullToNowNext}
                editSignal={editingIntentionId === intention.id ? editSignal : 0}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
