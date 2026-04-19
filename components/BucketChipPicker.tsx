"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { IntentionCategory } from "@/lib/categories";
import { computePopoverAnchor, type PopoverAnchor } from "@/lib/popoverAnchor";

interface BucketChipPickerProps {
  buckets: IntentionCategory[];
  /** Currently selected bucket id, or null when uncategorized. */
  value: string | null;
  onChange: (nextId: string | null) => void;
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
  popoverZ = 50,
}: BucketChipPickerProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<PopoverAnchor>({ side: "right" });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const current = value ? buckets.find((b) => b.id === value) ?? null : null;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setAnchor(computePopoverAnchor(rect, POPOVER_WIDTH, window.innerWidth));
  }, [open]);

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
        className={`h-7 px-2 rounded-full flex items-center gap-1.5 text-[11px] font-medium transition-all active:scale-95 ${
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
        <span className="truncate max-w-[90px]">{current ? current.name : "Bucket"}</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: popoverZ - 1 }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="absolute top-full mt-1 w-56 bg-[var(--color-surface-elevated)] rounded-xl shadow-xl border border-[var(--color-border)] p-1.5 animate-slide-up"
            style={{
              zIndex: popoverZ,
              ...(anchor.side === "left" ? { left: 0 } : { right: 0 }),
              ...(anchor.maxWidth ? { maxWidth: anchor.maxWidth } : null),
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
        </>
      )}
    </div>
  );
}
