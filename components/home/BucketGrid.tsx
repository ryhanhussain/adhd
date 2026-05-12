"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Intention, EnergyLevel } from "@/lib/db";
import { reorderIntentions } from "@/lib/db";
import type { IntentionCategory } from "@/lib/categories";
import BucketCard from "./BucketCard";

const INBOX_KEY = "__inbox__";
const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 5;
const INBOX_COLOR = "#a1a1aa";

interface BucketGridProps {
  intentions: Intention[];
  intentionCategories: IntentionCategory[];
  /** Intention currently running a Pomodoro; threaded down to row tinting. */
  focusedIntentionId?: string | null;
  /** When true, intention rows show the energy chip's text label. */
  showEnergyLabel?: boolean;
  onComplete: (id: string, note: string, startTime: number, endTime: number, energy?: EnergyLevel | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategoryChange: (id: string, categoryId: string | null) => Promise<void>;
  onEnergyChange: (id: string, energy: EnergyLevel | null) => Promise<void>;
  onTextChange: (id: string, text: string) => Promise<void>;
}

/**
 * Home centerpiece: persistent backlog grouped by life-area buckets. Always
 * shows one card per user-defined bucket, plus an "Inbox" card whenever any
 * active intention is uncategorized so those items don't disappear.
 *
 * Long-press a row, then drag onto another card → reassigns the intention's
 * `categoryId`. Drag within the same card reorders it. The pointer logic is
 * lifted from IntentionsCard but extended with cross-card drop detection.
 */
export default function BucketGrid({
  intentions,
  intentionCategories,
  focusedIntentionId,
  showEnergyLabel,
  onComplete,
  onDelete,
  onCategoryChange,
  onEnergyChange,
  onTextChange,
}: BucketGridProps) {
  const validIds = useMemo(() => new Set(intentionCategories.map((b) => b.id)), [intentionCategories]);

  const sectionKeyFor = useCallback(
    (intention: Intention): string => {
      if (intention.categoryId && validIds.has(intention.categoryId)) return intention.categoryId;
      return INBOX_KEY;
    },
    [validIds],
  );

  // ----- Drag state ---------------------------------------------------------
  const dragMeta = useRef<{
    id: string;
    startSection: string;
    pointerId: number;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout> | null;
    active: boolean;
    cleanup: () => void;
  } | null>(null);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const [orderOverride, setOrderOverride] = useState<Map<string, string[]> | null>(null);
  // When the dragged row is hovering a *different* section, track the target
  // section key so we can apply the reassignment on drop without committing
  // the reorder override.
  const pendingMoveSection = useRef<string | null>(null);

  const stopDrag = useCallback(() => {
    const meta = dragMeta.current;
    if (!meta) return;
    if (meta.timer) clearTimeout(meta.timer);
    meta.cleanup();
    dragMeta.current = null;
  }, []);

  // ----- Grouping -----------------------------------------------------------
  const { sections, currentIdsBySection } = useMemo(() => {
    const grouped = new Map<string, Intention[]>();
    for (const intention of intentions) {
      const key = sectionKeyFor(intention);
      const arr = grouped.get(key) ?? [];
      arr.push(intention);
      grouped.set(key, arr);
    }
    for (const arr of grouped.values()) arr.sort((a, b) => a.order - b.order);

    const sortWithOverride = (key: string, items: Intention[]) => {
      const override = orderOverride?.get(key);
      if (!override) return items;
      const byId = new Map(items.map((i) => [i.id, i]));
      return override.map((id) => byId.get(id)).filter((x): x is Intention => !!x);
    };

    type Section = {
      key: string;
      name: string;
      description?: string | null;
      color: string;
      icon: import("@/lib/categories").BucketIconKey;
      items: Intention[];
    };

    const out: Section[] = [];
    for (const b of intentionCategories) {
      const items = grouped.get(b.id) ?? [];
      out.push({
        key: b.id,
        name: b.name,
        description: b.description?.trim() || null,
        color: b.color,
        icon: b.icon ?? "sparkle",
        items: sortWithOverride(b.id, items),
      });
    }
    const inbox = grouped.get(INBOX_KEY) ?? [];
    if (inbox.length > 0 || intentionCategories.length === 0) {
      out.push({
        key: INBOX_KEY,
        name: "Inbox",
        description: null,
        color: INBOX_COLOR,
        icon: "sparkle",
        items: sortWithOverride(INBOX_KEY, inbox),
      });
    }

    const ids = new Map<string, string[]>();
    for (const section of out) {
      ids.set(section.key, section.items.map((i) => i.id));
    }
    return { sections: out, currentIdsBySection: ids };
  }, [intentions, intentionCategories, orderOverride, sectionKeyFor]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.target as HTMLElement;
    const row = target.closest("[data-intention-id]") as HTMLElement | null;
    if (!row) return;
    if (row.dataset.expanded || row.dataset.editing) return;

    const id = row.dataset.intentionId!;
    const intention = intentions.find((i) => i.id === id);
    if (!intention) return;

    const startSection = sectionKeyFor(intention);

    // Seed with the current live order so the first reorder is relative.
    const seeded = new Map<string, string[]>();
    for (const [k, ids] of currentIdsBySection.entries()) seeded.set(k, [...ids]);
    setOrderOverride(seeded);
    pendingMoveSection.current = null;

    const onMove = (ev: PointerEvent) => {
      const meta = dragMeta.current;
      if (!meta) return;
      if (ev.pointerId !== meta.pointerId) return;

      if (!meta.active) {
        if (Math.hypot(ev.clientX - meta.startX, ev.clientY - meta.startY) > MOVE_CANCEL_PX) {
          stopDrag();
          setOrderOverride(null);
          pendingMoveSection.current = null;
        }
        return;
      }

      ev.preventDefault();
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!el) return;

      // Detect which section the pointer is currently over.
      const overSectionEl = (el as HTMLElement).closest("[data-section-key]") as HTMLElement | null;
      const overSection = overSectionEl?.dataset.sectionKey ?? null;
      if (overSection && overSection !== meta.startSection) {
        pendingMoveSection.current = overSection;
      } else if (overSection === meta.startSection) {
        pendingMoveSection.current = null;
      }

      // Also support reorder within the start section.
      const overRow = (el as HTMLElement).closest("[data-intention-id]") as HTMLElement | null;
      if (!overRow) return;
      const overId = overRow.dataset.intentionId!;
      if (overId === meta.id) return;

      const overIntention = intentions.find((i) => i.id === overId);
      if (!overIntention) return;
      if (sectionKeyFor(overIntention) !== meta.startSection) return;

      setOrderOverride((prev) => {
        const next = new Map(prev ?? new Map());
        const current = next.get(meta.startSection);
        if (!current) return prev;
        const fromIdx = current.indexOf(meta.id);
        const toIdx = current.indexOf(overId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
        const reordered = [...current];
        reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, meta.id);
        next.set(meta.startSection, reordered);
        return next;
      });
    };

    const onUp = (ev: PointerEvent) => {
      const meta = dragMeta.current;
      if (!meta) return;
      if (ev.pointerId !== meta.pointerId) return;

      const wasActive = meta.active;
      const startKey = meta.startSection;
      const draggedId = meta.id;
      const moveTarget = pendingMoveSection.current;
      stopDrag();
      setDragActiveId(null);
      document.body.classList.remove("select-none");
      pendingMoveSection.current = null;

      if (!wasActive) {
        setOrderOverride(null);
        return;
      }

      if (moveTarget) {
        // Cross-card drop → reassign categoryId. Don't persist the reorder
        // override; the row is leaving its current section anyway.
        const nextCategoryId = moveTarget === INBOX_KEY ? null : moveTarget;
        void onCategoryChange(draggedId, nextCategoryId);
        setOrderOverride(null);
        return;
      }

      setOrderOverride((prev) => {
        const ids = prev?.get(startKey);
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
      startSection,
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

  if (sections.length === 0) {
    return null;
  }

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3"
      onPointerDown={handlePointerDown}
    >
      {sections.map((section) => (
        <BucketCard
          key={section.key}
          sectionKey={section.key}
          name={section.name}
          description={section.description}
          color={section.color}
          icon={section.icon}
          items={section.items}
          intentionCategories={intentionCategories}
          draggingId={dragActiveId}
          focusedIntentionId={focusedIntentionId}
          showEnergyLabel={showEnergyLabel}
          onComplete={onComplete}
          onDelete={onDelete}
          onCategoryChange={onCategoryChange}
          onEnergyChange={onEnergyChange}
          onTextChange={onTextChange}
        />
      ))}
    </div>
  );
}
