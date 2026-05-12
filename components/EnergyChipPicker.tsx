"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EnergyLevel } from "@/lib/db";
import { ENERGY_LEVELS, getEnergyColor, getEnergyEmoji, getEnergyLabel } from "@/lib/energy";
import { createPortal } from "react-dom";
import { computePopoverAnchor, type PopoverAnchor } from "@/lib/popoverAnchor";

interface EnergyChipPickerProps {
  /** Currently selected energy level, or null when unset. */
  value: EnergyLevel | null;
  onChange: (next: EnergyLevel | null) => void;
  /** Compact rows hide the text label and show only the emoji + dot. */
  compact?: boolean;
  /** Force the text label to show even in compact mode. */
  forceLabel?: boolean;
  /** Z-index for the popover surface. Defaults to 50; pass 61 inside modals. */
  popoverZ?: number;
}

const POPOVER_WIDTH = 192;

export default function EnergyChipPicker({
  value,
  onChange,
  compact = false,
  forceLabel = false,
  popoverZ = 50,
}: EnergyChipPickerProps) {
  const showLabel = !compact || forceLabel;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<PopoverAnchor>({ side: "right" });
  const [pos, setPos] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const computedAnchor = computePopoverAnchor(rect, POPOVER_WIDTH, vw);
    setAnchor(computedAnchor);

    // Approximate height: ENERGY_LEVELS.length * ~36px + 48 for "No energy" and padding.
    const estimatedHeight = Math.min(320, ENERGY_LEVELS.length * 36 + 48);
    const spaceBelow = vh - rect.bottom;
    const placeAbove = spaceBelow < estimatedHeight + 8 && rect.top > estimatedHeight;
    
    let left = computedAnchor.side === "left" ? rect.left : rect.right - POPOVER_WIDTH;
    if (left < 8) left = 8;
    if (left + POPOVER_WIDTH > vw - 8) left = vw - POPOVER_WIDTH - 8;
    
    const top = placeAbove ? rect.top - 4 : rect.bottom + 4;
    setPos({ top, left, placeAbove });
  }, [open]);

  const pick = (next: EnergyLevel | null) => {
    setOpen(false);
    if ((value ?? null) !== next) onChange(next);
  };

  const color = value ? getEnergyColor(value) : null;

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
        className={`h-7 rounded-full flex items-center gap-1 text-[11px] font-medium transition-all active:scale-95 ${
          showLabel ? "px-2 gap-1.5" : "px-1.5"
        } ${
          value
            ? "bg-[var(--color-bg)]/70 border border-[var(--color-border)] text-[var(--color-text)]"
            : "bg-transparent border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/50"
        }`}
        style={
          value
            ? { borderColor: `color-mix(in srgb, ${color} 60%, var(--color-border))` }
            : undefined
        }
        aria-label={value ? `Change energy (currently ${getEnergyLabel(value)})` : "Set energy"}
        aria-expanded={open}
      >
        {value ? (
          <span className="text-sm leading-none" aria-hidden="true">
            {getEnergyEmoji(value)}
          </span>
        ) : (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: "var(--color-text-muted)" }}
            aria-hidden="true"
          />
        )}
        {showLabel && (
          <span className="truncate max-w-[120px] uppercase tracking-wider text-[10px] font-bold">
            {value ? getEnergyLabel(value) : "Energy"}
          </span>
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
            className="fixed w-48 bg-[var(--color-surface-elevated)] rounded-xl shadow-xl border border-[var(--color-border)] p-1.5 animate-slide-up"
            style={{
              zIndex: popoverZ,
              top: pos.top,
              left: pos.left,
              transform: pos.placeAbove ? "translateY(-100%)" : undefined,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {ENERGY_LEVELS.map((level) => {
              const selected = level === value;
              const dotColor = getEnergyColor(level);
              return (
                <button
                  key={level}
                  onClick={() => pick(level)}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition-colors active:scale-[0.99] ${
                    selected
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                      : "hover:bg-[var(--color-bg)]/60 text-[var(--color-text)]"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: dotColor }}
                    aria-hidden="true"
                  />
                  <span aria-hidden="true">{getEnergyEmoji(level)}</span>
                  <span className="flex-1 truncate">{getEnergyLabel(level)}</span>
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
              <span
                className="w-2.5 h-2.5 rounded-full border border-dashed border-[var(--color-text-muted)] flex-shrink-0"
                aria-hidden="true"
              />
              <span className="flex-1">No energy</span>
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
