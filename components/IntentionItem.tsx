"use client";

import { useEffect, useRef, useState } from "react";
import type { Intention } from "@/lib/db";
import { toLocalDateStr, timeStringToTimestampOnDate } from "@/lib/db";
import type { IntentionCategory } from "@/lib/categories";
import BucketChipPicker from "./BucketChipPicker";
import DatePill from "./DatePill";

interface IntentionItemProps {
  intention: Intention;
  onComplete: (id: string, note: string, startTime: number, endTime: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Current user buckets; when non-empty, a chip is shown that opens a picker. */
  intentionCategories?: IntentionCategory[];
  /** Sets or clears the category for this intention. Pass null to clear. */
  onCategoryChange?: (id: string, categoryId: string | null) => Promise<void>;
  /** Updates the intention's text. When omitted, inline edit is disabled. */
  onTextChange?: (id: string, text: string) => Promise<void>;
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
  onTextChange,
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
  const prevCategoryId = useRef(intention.categoryId);
  const editRef = useRef<HTMLInputElement>(null);

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
    try {
      let start = timeStringToTimestampOnDate(startTime, targetDate);
      let end = timeStringToTimestampOnDate(endTime, targetDate);
      if (end < start) [start, end] = [end, start];
      await onComplete(intention.id, note, start, end);
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

  return (
    <div
      data-intention-id={intention.id}
      data-expanded={expanded ? "true" : undefined}
      data-editing={editing ? "true" : undefined}
      className={`${animatingOut ? "animate-intention-fly-out" : ""} ${bucketFlash ? "animate-bucket-flash" : ""}`}
    >
      {/* Row: checkbox + text + category chip + delete */}
      <div className="flex items-center gap-2 py-2">
        <button
          onClick={handleCheck}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 active:scale-90 ${
            checked
              ? "border-[var(--color-accent)] bg-[var(--color-accent)] scale-110"
              : "border-[var(--color-accent)]/50 hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
          }`}
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
            className="flex-1 min-w-0 text-sm bg-transparent border-b border-[var(--color-accent)] outline-none py-0.5 text-[var(--color-text)]"
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              if (!canEdit) return;
              e.stopPropagation();
              startEdit();
            }}
            className={`flex-1 min-w-0 text-sm transition-all duration-300 ${
              checked ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"
            } ${canEdit ? "cursor-text select-none" : ""}`}
            title={canEdit ? "Double-click to edit" : undefined}
          >
            {intention.text}
          </span>
        )}

        {/* Category chip — only when user has buckets defined */}
        {hasBuckets && !editing && (
          <BucketChipPicker
            buckets={intentionCategories}
            value={intention.categoryId ?? null}
            onChange={handlePickCategory}
          />
        )}

        <button
          onClick={() => onDelete(intention.id)}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-all duration-200 active:scale-90 flex-shrink-0"
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
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]"
          />
          <div className="flex items-center gap-2 mt-2">
            <DatePill value={targetDate} onChange={setTargetDate} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1.5 flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">From</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">To</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
              />
            </div>
          </div>
          <button
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
