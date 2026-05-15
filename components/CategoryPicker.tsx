"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import type { Category } from "@/lib/categories";
import { computeFixedPopoverPosition } from "@/lib/popoverAnchor";

interface CategoryPickerProps {
  categories: Category[];
  current: string;
  anchorRect: DOMRect;
  onPick: (name: string) => void;
  onClose: () => void;
}

const POPOVER_WIDTH = 208; // w-52

export default function CategoryPicker({ categories, current, anchorRect, onPick, onClose }: CategoryPickerProps) {
  const [style, setStyle] = useState<{ top: number; left: number; placeAbove: boolean; maxWidth?: number } | null>(null);

  useLayoutEffect(() => {
    const estimatedHeight = Math.min(360, categories.length * 40 + 12);
    const updatePosition = () => {
      const pos = computeFixedPopoverPosition(anchorRect, POPOVER_WIDTH, estimatedHeight);
      setStyle({
        top: pos.top,
        left: pos.left,
        placeAbove: pos.placeAbove,
        maxWidth: pos.maxWidth,
      });
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
  }, [anchorRect, categories.length]);

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
        className="fixed z-[81] w-52 popup-panel rounded-xl p-1.5 animate-slide-up max-h-[60vh] overflow-y-auto overscroll-contain"
        style={{
          top: style.top,
          left: style.left,
          maxWidth: style.maxWidth,
        }}
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
