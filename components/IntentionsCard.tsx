"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Intention } from "@/lib/db";
import { reorderIntentions } from "@/lib/db";
import type { IntentionCategory } from "@/lib/categories";
import IntentionItem from "./IntentionItem";

interface IntentionsCardProps {
  intentions: Intention[];
  onComplete: (id: string, note: string, startTime: number, endTime: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** If provided and non-empty, intentions render grouped by bucket. */
  intentionCategories?: IntentionCategory[];
  /** Sets or clears the category for an intention. Pass null to clear. */
  onCategoryChange?: (id: string, categoryId: string | null) => Promise<void>;
  /** Renames an intention. When omitted, inline edit is disabled on items. */
  onTextChange?: (id: string, text: string) => Promise<void>;
}

const UNCATEGORIZED_KEY = "__uncategorized__";
const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 5;

type Section = { key: string; label: string | null; color: string | null; items: Intention[] };

export default function IntentionsCard({
  intentions,
  onComplete,
  onDelete,
  intentionCategories,
  onCategoryChange,
  onTextChange,
}: IntentionsCardProps) {
  const buckets = intentionCategories ?? [];
  const hasBuckets = buckets.length > 0;
  const validIds = useMemo(() => new Set(buckets.map((b) => b.id)), [buckets]);

  const bucketKeyFor = useCallback(
    (intention: Intention): string => {
      if (!hasBuckets) return UNCATEGORIZED_KEY;
      if (intention.categoryId && validIds.has(intention.categoryId)) return intention.categoryId;
      return UNCATEGORIZED_KEY;
    },
    [hasBuckets, validIds],
  );

  // ----- Drag state (long-press reorder within a bucket) ---------------------
  const dragMeta = useRef<{
    id: string;
    bucketKey: string;
    pointerId: number;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout> | null;
    active: boolean;
    cleanup: () => void;
  } | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [orderOverride, setOrderOverride] = useState<Map<string, string[]> | null>(null);

  const stopDrag = useCallback(() => {
    const meta = dragMeta.current;
    if (!meta) return;
    if (meta.timer) clearTimeout(meta.timer);
    meta.cleanup();
    dragMeta.current = null;
  }, []);

  const handlePointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    // If the event was already suppressed by a child (checkbox, chip, delete,
    // edit input), defaultPrevented / isPropagationStopped aren't reflected
    // back on the capture phase — instead those children stop propagation in
    // their own onPointerDown, meaning we never see the event here for them.
    const target = e.target as HTMLElement;
    const row = target.closest("[data-intention-id]") as HTMLElement | null;
    if (!row) return;
    if (row.dataset.expanded || row.dataset.editing) return;

    const id = row.dataset.intentionId!;
    const intention = intentions.find((i) => i.id === id);
    if (!intention) return;

    const bucketKey = bucketKeyFor(intention);
    const idsInBucket = (orderOverride?.get(bucketKey) ?? currentIdsByBucket.get(bucketKey) ?? [])
      .filter(Boolean);
    if (idsInBucket.length < 2) return;

    // Seed the override with the current live order so the first swap is relative.
    const seeded = new Map<string, string[]>();
    seeded.set(bucketKey, [...idsInBucket]);
    setOrderOverride(seeded);

    const onMove = (ev: PointerEvent) => {
      const meta = dragMeta.current;
      if (!meta) return;
      if (ev.pointerId !== meta.pointerId) return;

      if (!meta.active) {
        if (Math.hypot(ev.clientX - meta.startX, ev.clientY - meta.startY) > MOVE_CANCEL_PX) {
          stopDrag();
          setOrderOverride(null);
        }
        return;
      }

      ev.preventDefault();
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!el) return;
      const overRow = (el as HTMLElement).closest("[data-intention-id]") as HTMLElement | null;
      if (!overRow) return;
      const overId = overRow.dataset.intentionId!;
      if (overId === meta.id) return;

      const overIntention = intentions.find((i) => i.id === overId);
      if (!overIntention) return;
      if (bucketKeyFor(overIntention) !== meta.bucketKey) return;

      setOrderOverride((prev) => {
        const next = new Map(prev ?? new Map());
        const current = next.get(meta.bucketKey);
        if (!current) return prev;
        const fromIdx = current.indexOf(meta.id);
        const toIdx = current.indexOf(overId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
        const reordered = [...current];
        reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, meta.id);
        next.set(meta.bucketKey, reordered);
        return next;
      });
    };

    const onUp = (ev: PointerEvent) => {
      const meta = dragMeta.current;
      if (!meta) return;
      if (ev.pointerId !== meta.pointerId) return;

      const wasActive = meta.active;
      const bk = meta.bucketKey;
      stopDrag();
      setDragActiveId(null);
      document.body.classList.remove("select-none");

      if (!wasActive) {
        setOrderOverride(null);
        return;
      }
      setOrderOverride((prev) => {
        const ids = prev?.get(bk);
        if (ids) void reorderIntentions(ids);
        return null;
      });
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    dragMeta.current = {
      id,
      bucketKey,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      timer: null,
      active: false,
      cleanup,
    };

    dragMeta.current.timer = setTimeout(() => {
      const meta = dragMeta.current;
      if (!meta || meta.id !== id) return;
      meta.active = true;
      setDragActiveId(id);
      document.body.classList.add("select-none");
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(10); } catch { /* ignore */ }
      }
    }, LONG_PRESS_MS);
  };

  // ----- Grouping + sections ------------------------------------------------
  const { sections, currentIdsByBucket } = useMemo(() => {
    const grouped = new Map<string, Intention[]>();
    for (const intention of intentions) {
      const key = bucketKeyFor(intention);
      const arr = grouped.get(key) ?? [];
      arr.push(intention);
      grouped.set(key, arr);
    }
    for (const arr of grouped.values()) arr.sort((a, b) => a.order - b.order);

    const sortWithOverride = (bucketKey: string, items: Intention[]) => {
      const override = orderOverride?.get(bucketKey);
      if (!override) return items;
      const byId = new Map(items.map((i) => [i.id, i]));
      return override.map((id) => byId.get(id)).filter((x): x is Intention => !!x);
    };

    const out: Section[] = [];
    if (hasBuckets) {
      for (const b of buckets) {
        const items = grouped.get(b.id) ?? [];
        out.push({
          key: b.id,
          label: b.name,
          color: b.color,
          items: sortWithOverride(b.id, items),
        });
      }
      const uncategorized = grouped.get(UNCATEGORIZED_KEY) ?? [];
      if (uncategorized.length > 0) {
        out.push({
          key: UNCATEGORIZED_KEY,
          label: "Other",
          color: null,
          items: sortWithOverride(UNCATEGORIZED_KEY, uncategorized),
        });
      }
    } else {
      out.push({
        key: UNCATEGORIZED_KEY,
        label: null,
        color: null,
        items: sortWithOverride(UNCATEGORIZED_KEY, intentions.slice().sort((a, b) => a.order - b.order)),
      });
    }

    const ids = new Map<string, string[]>();
    for (const section of out) {
      ids.set(section.key, section.items.map((i) => i.id));
    }
    return { sections: out, currentIdsByBucket: ids };
  }, [intentions, buckets, hasBuckets, orderOverride, bucketKeyFor]);

  if (intentions.length === 0) return null;

  const pending = intentions.filter((i) => !i.completed).length;
  const total = intentions.length;
  const completed = total - pending;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  // Hide the card entirely when all are completed (they've all moved to Ta-Da)
  if (pending === 0) return null;

  const showHeaders = hasBuckets;

  return (
    <section className="animate-fade-in">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 px-1">
        Daily Intentions
      </h2>
      <div
        className="bg-[var(--color-accent-soft)] rounded-2xl p-3 border border-[var(--color-accent)]/15 relative"
        onPointerDown={handlePointerDownCapture}
      >
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

        {/* Grouped sections — empty buckets are completely hidden to avoid whitespace */}
        <div className="flex flex-col">
          {sections.map((section) => {
            const pendingItems = section.items.filter((i) => !i.completed);
            // Hide sections that have no pending items
            if (pendingItems.length === 0 && section.items.length === 0) return null;
            // Also hide sections where all items are completed (already filtered out by IntentionItem)
            const visibleCount = section.items.filter((i) => !i.completed).length;
            if (visibleCount === 0 && showHeaders) return null;
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
                      {visibleCount}
                    </span>
                  </div>
                )}
                {section.items.map((intention) => (
                  <div
                    key={intention.id}
                    className={`transition-transform ${
                      dragActiveId === intention.id
                        ? "scale-[1.02] shadow-lg shadow-black/10 rounded-xl bg-[var(--color-bg)]/60"
                        : ""
                    }`}
                  >
                    <IntentionItem
                      intention={intention}
                      onComplete={onComplete}
                      onDelete={onDelete}
                      intentionCategories={buckets}
                      onCategoryChange={onCategoryChange}
                      onTextChange={onTextChange}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
