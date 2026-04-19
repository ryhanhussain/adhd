"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import type { Category } from "@/lib/categories";
import { computePopoverAnchor } from "@/lib/popoverAnchor";

interface CategoryPickerProps {
  categories: Category[];
  current: string;
  anchorRect: DOMRect;
  onPick: (name: string) => void;
  onClose: () => void;
}

const POPOVER_WIDTH = 208; // w-52

export default function CategoryPicker({ categories, current, anchorRect, onPick, onClose }: CategoryPickerProps) {
  const [style, setStyle] = useState<{ top: number; left: number; maxWidth?: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = computePopoverAnchor(anchorRect, POPOVER_WIDTH, window.innerWidth);
    // Prefer opening below the row; if there's no room, open above.
    const spaceBelow = window.innerHeight - anchorRect.bottom - 8;
    const above = spaceBelow < 180;
    const top = above ? Math.max(8, anchorRect.top - 8 - 180) : anchorRect.bottom + 4;
    const left =
      anchor.side === "left"
        ? Math.min(window.innerWidth - (anchor.maxWidth ?? POPOVER_WIDTH) - 8, anchorRect.left)
        : Math.max(8, anchorRect.right - POPOVER_WIDTH);
    setStyle({ top, left, maxWidth: anchor.maxWidth });
  }, [anchorRect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!style) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80]" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed z-[81] w-52 bg-[var(--color-surface-elevated)] rounded-xl shadow-xl border border-[var(--color-border)] p-1.5 animate-slide-up max-h-[60vh] overflow-y-auto"
        style={style}
        role="menu"
      >
        {categories.map((cat) => {
          const selected = cat.name === current;
          return (
            <button
              key={cat.name}
              onClick={() => {
                onPick(cat.name);
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition-colors active:scale-[0.99] ${
                selected
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                  : "hover:bg-[var(--color-bg)]/60 text-[var(--color-text)]"
              }`}
              role="menuitemradio"
              aria-checked={selected}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color }}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{cat.name}</span>
              {selected && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
