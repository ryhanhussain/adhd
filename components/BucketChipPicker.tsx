"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { IntentionCategory } from "@/lib/categories";
import { createPortal } from "react-dom";
import { computeFixedPopoverPosition } from "@/lib/popoverAnchor";

interface BucketChipPickerProps {
  buckets: IntentionCategory[];
  /** Currently selected bucket id, or null when uncategorized. */
  value: string | null;
  onChange: (nextId: string | null) => void;
  /** Compact rows hide the text label and show only the colored dot. */
  compact?: boolean;
  /**
   * Z-index for the popover surface. Defaults to 50; pass 61 when the chip
   * lives inside a modal (above z-60 backdrop).
   */
  popoverZ?: number;
}

const POPOVER_WIDTH = 224; // w-56 — kept in sync with the className below

export default function BucketChipPicker({
  buckets,
  value,
  onChange,
  compact = false,
  popoverZ = 50,
}: BucketChipPickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placeAbove: boolean; maxWidth?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const current = value ? buckets.find((b) => b.id === value) ?? null : null;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const estimatedHeight = Math.min(320, buckets.length * 36 + 48);
    const updatePosition = () => {
      if (!triggerRef.current) return;
      setPos(
        computeFixedPopoverPosition(
          triggerRef.current.getBoundingClientRect(),
          POPOVER_WIDTH,
          estimatedHeight,
        )
      );
    };
    updatePosition();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", updatePosition);
    vv?.addEventListener("scroll", updatePosition);
    window.addEventListener("resize", updatePosition);

    return () => {
      vv?.removeEventListener("resize", updatePosition);
      vv?.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, buckets.length]);

  const pick = (id: string | null) => {
    setOpen(false);
    if ((value ?? null) !== id) onChange(id);
  };

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        className={`h-7 rounded-full flex items-center text-[11px] font-medium transition-all active:scale-95 ${
          compact ? "px-1.5 gap-1" : "px-2 gap-1.5"
        } ${
          current
            ? "bg-[var(--color-bg)]/70 border border-[var(--color-border)] text-[var(--color-text)]"
            : "bg-transparent border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/50"
        }`}
        aria-label={current ? `Change bucket (currently ${current.name})` : "Set bucket"}
        aria-expanded={open}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: current?.color ?? "var(--color-text-muted)" }}
          aria-hidden="true"
        />
        {!compact && (
          <span className="truncate max-w-[90px]">{current ? current.name : "Bucket"}</span>
        )}
      </button>
      {mounted && open && pos && createPortal(
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: popoverZ - 1 }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed w-56 popup-panel rounded-xl p-1.5 animate-slide-up"
            style={{
              zIndex: popoverZ,
              top: pos.top,
              left: pos.left,
              maxWidth: pos.maxWidth,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {buckets.map((bucket) => {
              const selected = bucket.id === value;
              return (
                <button
                  key={bucket.id}
                  onClick={() => pick(bucket.id)}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition-colors active:scale-[0.99] ${
                    selected
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                      : "hover:bg-[var(--color-bg)]/60 text-[var(--color-text)]"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: bucket.color }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{bucket.name}</span>
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
            <div className="my-1 border-t border-[var(--color-border)]" aria-hidden="true" />
            <button
              onClick={() => pick(null)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition-colors active:scale-[0.99] ${
                !value
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                  : "hover:bg-[var(--color-bg)]/60 text-[var(--color-text-muted)]"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full border border-dashed border-[var(--color-text-muted)] flex-shrink-0" aria-hidden="true" />
              <span className="flex-1">No bucket</span>
              {!value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
