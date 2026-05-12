"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Intention, EnergyLevel } from "@/lib/db";
import { reorderIntentions } from "@/lib/db";
import type { BucketIconKey, IntentionCategory } from "@/lib/categories";
import { ENERGY_LEVELS, getEnergyColor, getEnergyLabel } from "@/lib/energy";
import BucketCard from "./BucketCard";

const NO_ENERGY_KEY = "__no-energy__";
const NO_ENERGY_COLOR = "#a1a1aa";
const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 5;

interface EnergyViewProps {
  intentions: Intention[];
  intentionCategories: IntentionCategory[];
  onComplete: (id: string, note: string, startTime: number, endTime: number, energy?: EnergyLevel | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategoryChange: (id: string, categoryId: string | null) => Promise<void>;
  onTextChange: (id: string, text: string) => Promise<void>;
  /** Reassigns an intention to a different energy level (or null). */
  onEnergyChange: (id: string, energy: EnergyLevel | null) => Promise<void>;
}

const ENERGY_ICONS: Record<EnergyLevel, BucketIconKey> = {
  high: "dumbbell",
  medium: "sparkle",
  low: "leaf",
  scattered: "brain",
};

/** Same shell as BucketGrid, but slices the backlog by energy rather than bucket. */
export default function EnergyView({
  intentions,
  intentionCategories,
  onComplete,
  onDelete,
  onCategoryChange,
  onTextChange,
  onEnergyChange,
}: EnergyViewProps) {
  const sectionKeyFor = useCallback(
    (intention: Intention): string => intention.energy ?? NO_ENERGY_KEY,
    [],
  );

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
  const pendingMoveSection = useRef<string | null>(null);

  const stopDrag = useCallback(() => {
    const meta = dragMeta.current;
    if (!meta) return;
    if (meta.timer) clearTimeout(meta.timer);
    meta.cleanup();
    dragMeta.current = null;
  }, []);

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
      color: string;
      icon: BucketIconKey;
      items: Intention[];
    };

    const out: Section[] = ENERGY_LEVELS.map((level) => ({
      key: level,
      name: getEnergyLabel(level),
      color: getEnergyColor(level),
      icon: ENERGY_ICONS[level],
      items: sortWithOverride(level, grouped.get(level) ?? []),
    }));

    const noEnergy = grouped.get(NO_ENERGY_KEY) ?? [];
    if (noEnergy.length > 0) {
      out.push({
        key: NO_ENERGY_KEY,
        name: "No energy",
        color: NO_ENERGY_COLOR,
        icon: "sparkle",
        items: sortWithOverride(NO_ENERGY_KEY, noEnergy),
      });
    }

    const ids = new Map<string, string[]>();
    for (const section of out) {
      ids.set(section.key, section.items.map((i) => i.id));
    }
    return { sections: out, currentIdsBySection: ids };
  }, [intentions, orderOverride, sectionKeyFor]);

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

      const overSectionEl = (el as HTMLElement).closest("[data-section-key]") as HTMLElement | null;
      const overSection = overSectionEl?.dataset.sectionKey ?? null;
      if (overSection && overSection !== meta.startSection) {
        pendingMoveSection.current = overSection;
      } else if (overSection === meta.startSection) {
        pendingMoveSection.current = null;
      }

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
        const nextEnergy: EnergyLevel | null =
          moveTarget === NO_ENERGY_KEY ? null : (moveTarget as EnergyLevel);
        void onEnergyChange(draggedId, nextEnergy);
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

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      onPointerDown={handlePointerDown}
    >
      {sections.map((section) => (
        <BucketCard
          key={section.key}
          sectionKey={section.key}
          name={section.name}
          color={section.color}
          icon={section.icon}
          items={section.items}
          intentionCategories={intentionCategories}
          draggingId={dragActiveId}
          hideEnergyChip={true}
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
