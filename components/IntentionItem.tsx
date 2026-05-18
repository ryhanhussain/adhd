"use client";

import { useEffect, useRef, useState } from "react";
import type { Intention, EnergyLevel } from "@/lib/db";
import { toLocalDateStr, timeStringToTimestampOnDate } from "@/lib/db";
import type { IntentionCategory } from "@/lib/categories";
import BucketChipPicker from "./BucketChipPicker";
import DatePill from "./DatePill";
import EnergyChipPicker from "./EnergyChipPicker";
import EnergyPicker from "./EnergyPicker";
import { confettiBurst } from "@/lib/confetti";

interface IntentionItemProps {
  intention: Intention;
  onComplete: (id: string, note: string, startTime: number, endTime: number, energy?: EnergyLevel | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Current user buckets; when non-empty, a chip is shown that opens a picker. */
  intentionCategories?: IntentionCategory[];
  /** Sets or clears the category for this intention. Pass null to clear. */
  onCategoryChange?: (id: string, categoryId: string | null) => Promise<void>;
  /** Sets or clears the energy level for this intention. Pass null to clear. */
  onEnergyChange?: (id: string, energy: EnergyLevel | null) => Promise<void>;
  /** Updates the intention's text. When omitted, inline edit is disabled. */
  onTextChange?: (id: string, text: string) => Promise<void>;
  /**
   * Compact variant for bucket cards: hides the bucket chip (the card already
   * implies it), keeps edit/delete affordances visible only on hover, and
   * trims vertical padding so rows feel like a checklist line.
   */
  compact?: boolean;
  /** When true, the row is the active Pomodoro target — show a FOCUSING pill + tint. */
  focused?: boolean;
  /** When true, the energy chip renders its text label even in compact mode. */
  showEnergyLabel?: boolean;
  /** When true, hides the bucket chip picker entirely. */
  hideBucketChip?: boolean;
  /** When true, hides the energy chip picker entirely. */
  hideEnergyChip?: boolean;
  /** Optional vault action for pulling this intention into Now & Next. */
  pullLabel?: string;
  pullDisabled?: boolean;
  onPullToNowNext?: (id: string) => Promise<void>;
  /** Incremented by a parent to open this row's inline editor. */
  editSignal?: number;
}

function defaultStartTime(): string {
  const d = new Date(Date.now() - 30 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function defaultEndTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function IntentionItem({
  intention,
  onComplete,
  onDelete,
  intentionCategories = [],
  onCategoryChange,
  onEnergyChange,
  onTextChange,
  compact = false,
  focused = false,
  showEnergyLabel = false,
  hideBucketChip = false,
  hideEnergyChip = false,
  pullLabel = "Pull",
  pullDisabled = false,
  onPullToNowNext,
  editSignal = 0,
}: IntentionItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [targetDate, setTargetDate] = useState(() => toLocalDateStr(Date.now()));
  const [isLogging, setIsLogging] = useState(false);
  const [checked, setChecked] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(intention.text);
  const [bucketFlash, setBucketFlash] = useState(false);
  const [selectedEnergy, setSelectedEnergy] = useState<EnergyLevel | null>(null);
  const prevCategoryId = useRef(intention.categoryId);
  const editRef = useRef<HTMLInputElement>(null);
  const logButtonRef = useRef<HTMLButtonElement>(null);

  // Flash highlight when bucket changes
  useEffect(() => {
    if (prevCategoryId.current !== intention.categoryId) {
      prevCategoryId.current = intention.categoryId;
      setBucketFlash(true);
      const t = setTimeout(() => setBucketFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [intention.categoryId]);

  // Already completed — show struck-through with check
  if (intention.completed && !animatingOut) {
    return null;
  }

  const handleCheck = () => {
    if (editing) return;
    if (expanded) {
      setExpanded(false);
      setChecked(false);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    setChecked(true);
    setExpanded(true);
  };

  const handleLogIt = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([8, 40, 8]);
    setIsLogging(true);
    // Capture the button's tap position *before* awaiting — the element may
    // unmount as part of the fly-out once the completion lands.
    const rect = logButtonRef.current?.getBoundingClientRect();
    const burstX = rect ? rect.left + rect.width / 2 : 0;
    const burstY = rect ? rect.top + rect.height / 2 : 0;
    try {
      let start = timeStringToTimestampOnDate(startTime, targetDate);
      let end = timeStringToTimestampOnDate(endTime, targetDate);
      if (end < start) [start, end] = [end, start];
      await onComplete(intention.id, note, start, end, selectedEnergy);
      if (rect) confettiBurst(burstX, burstY);
      // Collapse the form first so the layout box for the expanded textarea is
      // released before the fly-out starts. Without this, mobile Safari keeps
      // the expanded height reserved and the parent card doesn't shrink when
      // the item finally unmounts.
      setExpanded(false);
      setAnimatingOut(true);
    } finally {
      setIsLogging(false);
    }
  };

  const hasBuckets = intentionCategories.length > 0 && !!onCategoryChange;

  const handlePickCategory = async (categoryId: string | null) => {
    if (!onCategoryChange) return;
    await onCategoryChange(intention.id, categoryId);
  };

  const handlePickEnergy = async (energy: EnergyLevel | null) => {
    if (!onEnergyChange) return;
    await onEnergyChange(intention.id, energy);
  };

  const canEdit = !!onTextChange && !expanded && !animatingOut;

  const startEdit = () => {
    if (!canEdit) return;
    setDraft(intention.text);
    setEditing(true);
  };

  const commitEdit = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === intention.text) return;
    await onTextChange?.(intention.id, next);
  };

  const cancelEdit = () => {
    setDraft(intention.text);
    setEditing(false);
  };

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editSignal || !canEdit) return;
    startEdit();
    // `canEdit` and `startEdit` intentionally stay out: this effect is keyed
    // to the parent's explicit signal, not every local editing state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal]);

  const containerClass = compact
    ? `group bg-white ${expanded ? "rounded-2xl" : "rounded-full"} px-3 text-[#1A1640] shadow-[0_10px_24px_-20px_rgba(26,22,64,0.7)] ring-1 ring-black/[0.04] transition-colors ${animatingOut ? "animate-intention-fly-out" : ""} ${bucketFlash ? "animate-bucket-flash" : ""} ${
        focused ? "ring-2 ring-[var(--color-accent)]" : ""
      }`
    : `group bg-white/50 dark:bg-white/5 backdrop-blur-md rounded-xl px-3 transition-colors ${animatingOut ? "animate-intention-fly-out" : ""} ${bucketFlash ? "animate-bucket-flash" : ""} ${
        focused ? "bg-purple-100/80 dark:bg-purple-900/40 ring-1 ring-purple-400" : ""
      }`;

  const textClass = compact
    ? `flex-1 min-w-0 truncate text-sm font-medium transition-all duration-300 ${
        checked ? "text-[#1A1640]/45" : "text-[#1A1640]"
      } ${canEdit ? "cursor-text select-none" : ""}`
    : `flex-1 min-w-0 text-sm transition-all duration-300 ${
        checked ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"
      } ${canEdit ? "cursor-text select-none" : ""}`;

  const editInputClass = compact
    ? "flex-1 min-w-0 text-sm bg-transparent border-b border-[#1A1640]/30 outline-none py-0.5 text-[#1A1640]"
    : "flex-1 min-w-0 text-sm bg-transparent border-b border-[var(--color-accent)] outline-none py-0.5 text-[var(--color-text)]";

  const actionButtonClass = compact
    ? "hit-area w-7 h-7 flex items-center justify-center rounded-lg text-[#1A1640]/45 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-all duration-200 active:scale-90 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
    : "hit-area w-7 h-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-all duration-200 active:scale-90 flex-shrink-0";

  const deleteButtonClass = compact
    ? "hit-area w-7 h-7 flex items-center justify-center rounded-lg text-[#1A1640]/45 hover:text-red-500 hover:bg-red-400/10 transition-all duration-200 active:scale-90 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
    : "hit-area w-7 h-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-all duration-200 active:scale-90 flex-shrink-0";

  const pullButtonClass = compact
    ? "h-7 px-2.5 rounded-full bg-[#1A1640] text-white text-[10px] font-bold transition-all active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed"
    : "h-8 px-3 rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] text-xs font-bold transition-all active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed";

  return (
    <div
      data-intention-id={intention.id}
      data-expanded={expanded ? "true" : undefined}
      data-editing={editing ? "true" : undefined}
      className={containerClass}
    >
      {/* Row: checkbox + text + category chip + delete */}
      <div className={`flex items-center gap-2 ${compact ? "py-1.5" : "py-2"}`}>
        {focused && (
          <span
            className="px-1.5 py-0.5 rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] text-[9px] font-bold uppercase tracking-widest flex-shrink-0"
            aria-label="Currently focusing"
          >
            {compact ? "Focus" : "Focusing"}
          </span>
        )}
        <button
          onClick={handleCheck}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`hit-area w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 active:scale-90 ${
            checked
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] scale-110"
              : "border-[var(--color-accent)]/50 hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
          } ${animatingOut ? "animate-success-flash" : ""}`}
          aria-label={expanded ? "Collapse" : "Complete intention"}
        >
          {checked && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-on-accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-check-draw"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>

        {editing ? (
          <input
            ref={editRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={editInputClass}
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              if (!canEdit) return;
              e.stopPropagation();
              startEdit();
            }}
            className={textClass}
            title={canEdit ? "Double-click to edit" : undefined}
          >
            {intention.text}
          </span>
        )}

        {/* Category chip — only when user has buckets defined. In compact mode
            the parent BucketCard already implies the bucket, so we render an
            icon-only chip that still allows reassignment. */}
        {hasBuckets && !editing && !hideBucketChip && (
          <BucketChipPicker
            buckets={intentionCategories}
            value={intention.categoryId ?? null}
            onChange={handlePickCategory}
            compact={compact}
          />
        )}

        {/* Energy chip — only when an onEnergyChange handler is wired. */}
        {onEnergyChange && !editing && !hideEnergyChip && (
          <EnergyChipPicker
            value={intention.energy ?? null}
            onChange={handlePickEnergy}
            compact={compact}
            forceLabel={showEnergyLabel}
          />
        )}

        {onPullToNowNext && !editing && !expanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              void onPullToNowNext(intention.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            disabled={pullDisabled}
            className={pullButtonClass}
          >
            {pullLabel}
          </button>
        )}

        {canEdit && !editing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              startEdit();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className={actionButtonClass}
            aria-label="Edit intention"
            title="Edit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}

        <button
          onClick={() => onDelete(intention.id)}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={deleteButtonClass}
          aria-label="Delete intention"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>

      {/* Expanded form — the dopamine-rich logging area */}
      {expanded && (
        <div className="animate-intention-expand pl-9 pb-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How did it go? Jot the time it took, energy level, or anything useful..."
            rows={2}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/60 focus:border-[var(--color-accent)] focus:bg-[var(--color-accent)]/5"
          />
          <div className="flex items-center gap-2 mt-2">
            <DatePill value={targetDate} onChange={setTargetDate} />
          </div>
          <div className="flex flex-col gap-2 mt-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] w-10 shrink-0">From</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/60 focus:border-[var(--color-accent)]"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] w-10 shrink-0">To</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/60 focus:border-[var(--color-accent)]"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] block mb-1">Energy</label>
            <EnergyPicker value={selectedEnergy} onChange={setSelectedEnergy} />
          </div>
          <button
            ref={logButtonRef}
            onClick={handleLogIt}
            disabled={isLogging}
            className="w-full mt-3 h-11 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isLogging ? (
              <>
                <div className="w-4 h-4 border-2 border-[var(--color-on-accent)]/30 border-t-[var(--color-on-accent)] rounded-full animate-spin" />
                Moving to Ta-Da...
              </>
            ) : (
              "Move to Ta-Da"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
