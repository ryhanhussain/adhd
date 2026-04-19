"use client";

import type { Intention } from "@/lib/db";
import type { IntentionCategory } from "@/lib/categories";
import IntentionItem from "./IntentionItem";

interface IntentionsCardProps {
  intentions: Intention[];
  onComplete: (id: string, note: string, startTime: number, endTime: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** If provided and non-empty, intentions render grouped by bucket. */
  intentionCategories?: IntentionCategory[];
}

const UNCATEGORIZED_KEY = "__uncategorized__";

export default function IntentionsCard({
  intentions,
  onComplete,
  onDelete,
  intentionCategories,
}: IntentionsCardProps) {
  if (intentions.length === 0) return null;

  const pending = intentions.filter((i) => !i.completed).length;
  const total = intentions.length;
  const completed = total - pending;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  // Hide the card entirely when all are completed (they've all moved to Ta-Da)
  if (pending === 0) return null;

  const buckets = intentionCategories ?? [];
  const hasBuckets = buckets.length > 0;

  // Resolve each intention into the bucket it belongs to. Unknown/missing ids
  // fall through to the uncategorized group.
  const validIds = new Set(buckets.map((b) => b.id));
  const grouped = new Map<string, Intention[]>();
  for (const intention of intentions) {
    const key =
      hasBuckets && intention.categoryId && validIds.has(intention.categoryId)
        ? intention.categoryId
        : UNCATEGORIZED_KEY;
    const arr = grouped.get(key) ?? [];
    arr.push(intention);
    grouped.set(key, arr);
  }
  for (const arr of grouped.values()) arr.sort((a, b) => a.order - b.order);

  // Build display order: user's bucket order, then uncategorized.
  const sections: { key: string; label: string | null; color: string | null; items: Intention[] }[] = [];
  if (hasBuckets) {
    for (const b of buckets) {
      const items = grouped.get(b.id);
      if (items && items.length > 0) {
        sections.push({ key: b.id, label: b.name, color: b.color, items });
      }
    }
    const uncategorized = grouped.get(UNCATEGORIZED_KEY);
    if (uncategorized && uncategorized.length > 0) {
      sections.push({ key: UNCATEGORIZED_KEY, label: "Other", color: null, items: uncategorized });
    }
  } else {
    // No user buckets: flat list — preserve today's behaviour exactly.
    sections.push({
      key: UNCATEGORIZED_KEY,
      label: null,
      color: null,
      items: [...intentions].sort((a, b) => a.order - b.order),
    });
  }

  const showHeaders = hasBuckets && sections.length > 1;

  return (
    <section className="animate-fade-in">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 px-1">
        Daily Intentions
      </h2>
      <div className="bg-[var(--color-accent-soft)] rounded-2xl p-4 border border-[var(--color-accent)]/15 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--color-accent)]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Progress header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {pending} remaining
          </span>
          <span className="text-xs text-[var(--color-accent)] font-medium tabular-nums">
            {completed}/{total}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1 rounded-full bg-[var(--color-border)]/40 mb-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Grouped sections */}
        <div className="flex flex-col">
          {sections.map((section) => {
            const pendingInSection = section.items.filter((i) => !i.completed).length;
            return (
              <div key={section.key} className="flex flex-col">
                {showHeaders && section.label && (
                  <div className="flex items-center gap-2 mt-2 mb-1 px-1">
                    {section.color && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      {section.label}
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      {pendingInSection}
                    </span>
                  </div>
                )}
                {section.items.map((intention) => (
                  <IntentionItem
                    key={intention.id}
                    intention={intention}
                    onComplete={onComplete}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
