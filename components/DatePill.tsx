"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toLocalDateStr } from "@/lib/db";

interface DatePillProps {
  /** YYYY-MM-DD */
  value: string;
  onChange: (next: string) => void;
  /** How many days back to offer, counting today. Default 7 (today + 6 prior). Used when direction is "past". */
  maxDaysBack?: number;
  /** How many days forward to offer, counting today. Default 14. Used when direction is "future". */
  maxDaysForward?: number;
  /** Whether the popover lists past or future days. Default "past". */
  direction?: "past" | "future";
  /** Z-index for the popover surface. Defaults to 70 so it sits above modals/docks. */
  popoverZ?: number;
  /** Optional compact mode (smaller chip). */
  compact?: boolean;
}

const POPOVER_WIDTH = 192;
const POPOVER_MARGIN = 8;

function dayOffset(value: string, today: string): number {
  const [ay, am, ad] = value.split("-").map(Number);
  const [by, bm, bd] = today.split("-").map(Number);
  const a = new Date(ay, am - 1, ad).getTime();
  const b = new Date(by, bm - 1, bd).getTime();
  return Math.round((b - a) / 86_400_000);
}

function formatLabel(value: string, today: string): string {
  const diff = dayOffset(value, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function DatePill({
  value,
  onChange,
  maxDaysBack = 7,
  maxDaysForward = 14,
  direction = "past",
  popoverZ = 70,
  compact = false,
}: DatePillProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const today = toLocalDateStr(Date.now());

  const optionCount = direction === "future" ? maxDaysForward : maxDaysBack;
  // Estimated popover height: header + N rows × ~40px + padding. Good enough for placement choice.
  const estimatedPopoverHeight = Math.min(360, optionCount * 40 + 16);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom;
    const placeAbove = spaceBelow < estimatedPopoverHeight + POPOVER_MARGIN && rect.top > estimatedPopoverHeight;
    let left = rect.left;
    if (left + POPOVER_WIDTH > vw - POPOVER_MARGIN) {
      left = Math.max(POPOVER_MARGIN, vw - POPOVER_WIDTH - POPOVER_MARGIN);
    }
    const top = placeAbove ? rect.top - POPOVER_MARGIN : rect.bottom + 4;
    setPos({ top, left, placeAbove });
  }, [open, estimatedPopoverHeight]);

  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < optionCount; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (direction === "future" ? i : -i));
    const v = toLocalDateStr(d);
    options.push({ value: v, label: formatLabel(v, today) });
  }

  const pick = (v: string) => {
    setOpen(false);
    if (v !== value) onChange(v);
  };

  const isToday = value === today;

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className={`${compact ? "h-6 px-2 text-[10px]" : "h-7 px-2.5 text-[11px]"} rounded-full flex items-center gap-1.5 font-medium transition-all active:scale-95 ${
          isToday
            ? "bg-[var(--color-bg)]/70 border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            : "bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/40 text-[var(--color-text)]"
        }`}
        aria-label={`Log date: ${formatLabel(value, today)}`}
        aria-expanded={open}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="truncate">{formatLabel(value, today)}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
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
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => pick(opt.value)}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition-colors active:scale-[0.99] ${
                    selected
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                      : "hover:bg-[var(--color-bg)]/60 text-[var(--color-text)]"
                  }`}
                >
                  <span className="flex-1 truncate">{opt.label}</span>
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
