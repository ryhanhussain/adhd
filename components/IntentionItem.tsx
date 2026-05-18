"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Intention, EnergyLevel } from "@/lib/db";
import { toLocalDateStr, timeStringToTimestampOnDate } from "@/lib/db";
import { getCategoryStyle, type Category, type IntentionCategory } from "@/lib/categories";
import { getLifeAreaById, type LifeArea } from "@/lib/lifeAreas";
import DatePill from "./DatePill";
import EnergyPicker from "./EnergyPicker";
import { confettiBurst } from "@/lib/confetti";
import { computeFixedPopoverPosition } from "@/lib/popoverAnchor";
import { ENERGY_LEVELS, getEnergyColor, getEnergyEmoji, getEnergyLabel } from "@/lib/energy";

export interface IntentionMoreAction {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  destructive?: boolean;
}

interface IntentionItemProps {
  intention: Intention;
  onComplete: (id: string, note: string, startTime: number, endTime: number, energy?: EnergyLevel | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Current user buckets; shown inside the quiet three-dot menu. */
  intentionCategories?: IntentionCategory[];
  /** Current Life Areas; shown inside the quiet three-dot menu. */
  lifeAreas?: LifeArea[];
  /** Activity categories for the small task colour dot. */
  categories?: Category[];
  /** Sets or clears the category for this intention. Pass null to clear. */
  onCategoryChange?: (id: string, categoryId: string | null) => Promise<void>;
  /** Sets or clears the energy level for this intention. Pass null to clear. */
  onEnergyChange?: (id: string, energy: EnergyLevel | null) => Promise<void>;
  /** Sets or clears the Life Area for this intention. Pass null to clear. */
  onLifeAreaChange?: (id: string, lifeAreaId: string | null) => Promise<void>;
  /** Sets or clears priority for this intention. */
  onPriorityChange?: (id: string, priority: Intention["priority"] | null) => Promise<void>;
  /** Updates the intention's text. When omitted, inline edit is disabled. */
  onTextChange?: (id: string, text: string) => Promise<void>;
  /**
   * Compact variant for bucket cards: trims vertical padding so rows feel
   * like a checklist line.
   */
  compact?: boolean;
  /** When true, the row is the active Pomodoro target — show a FOCUSING pill + tint. */
  focused?: boolean;
  /** Legacy display hint; metadata now lives inside the three-dot menu. */
  showEnergyLabel?: boolean;
  /** Legacy display hint; metadata now lives inside the three-dot menu. */
  hideBucketChip?: boolean;
  /** Legacy display hint; metadata now lives inside the three-dot menu. */
  hideEnergyChip?: boolean;
  hideLifeAreaChip?: boolean;
  /** Optional vault action for pulling this intention into Now & Next. */
  pullLabel?: string;
  pullDisabled?: boolean;
  onPullToNowNext?: (id: string) => Promise<void>;
  /** Extra low-frequency actions shown inside the three-dot menu. */
  moreActions?: IntentionMoreAction[];
  /** Incremented by a parent to open this row's inline editor. */
  editSignal?: number;
}

const MORE_POPOVER_WIDTH = 288;

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
  lifeAreas = [],
  categories = [],
  onCategoryChange,
  onEnergyChange,
  onLifeAreaChange,
  onPriorityChange,
  onTextChange,
  compact = false,
  focused = false,
  pullLabel = "Pull",
  pullDisabled = false,
  onPullToNowNext,
  moreActions = [],
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [morePos, setMorePos] = useState<{ top: number; left: number; placeAbove: boolean; maxWidth?: number } | null>(null);
  const [bucketFlash, setBucketFlash] = useState(false);
  const [selectedEnergy, setSelectedEnergy] = useState<EnergyLevel | null>(null);
  const prevCategoryId = useRef(intention.categoryId);
  const editRef = useRef<HTMLInputElement>(null);
  const logButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  // Flash highlight when bucket changes
  useEffect(() => {
    if (prevCategoryId.current !== intention.categoryId) {
      prevCategoryId.current = intention.categoryId;
      setBucketFlash(true);
      const t = setTimeout(() => setBucketFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [intention.categoryId]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMoreOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);

  useEffect(() => {
    if (editing || expanded || animatingOut) setMoreOpen(false);
  }, [editing, expanded, animatingOut]);

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
  const currentBucket = intention.categoryId
    ? intentionCategories.find((bucket) => bucket.id === intention.categoryId) ?? null
    : null;
  const currentLifeArea = getLifeAreaById(intention.lifeAreaId, lifeAreas);
  const currentActivityCategory = intention.activityCategory
    ? getCategoryStyle(intention.activityCategory, categories)
    : null;

  const handlePickCategory = async (categoryId: string | null) => {
    if (!onCategoryChange) return;
    await onCategoryChange(intention.id, categoryId);
  };

  const handlePickEnergy = async (energy: EnergyLevel | null) => {
    if (!onEnergyChange) return;
    await onEnergyChange(intention.id, energy);
  };

  const handlePickLifeArea = async (lifeAreaId: string | null) => {
    if (!onLifeAreaChange) return;
    await onLifeAreaChange(intention.id, lifeAreaId);
  };

  const handlePickPriority = async (priority: Intention["priority"] | null) => {
    if (!onPriorityChange) return;
    await onPriorityChange(intention.id, priority);
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

  useLayoutEffect(() => {
    if (!moreOpen || !moreButtonRef.current) return;

    const actionCount =
      moreActions.length +
      (onPullToNowNext ? 1 : 0) +
      (canEdit ? 1 : 0) +
      1;
    const estimatedHeight = Math.min(
      540,
      96 +
        (hasBuckets ? Math.min(7, intentionCategories.length + 1) * 36 + 48 : 0) +
        (onLifeAreaChange ? Math.min(7, lifeAreas.length + 1) * 36 + 48 : 0) +
        (onPriorityChange ? 5 * 36 + 48 : 0) +
        (onEnergyChange ? (ENERGY_LEVELS.length + 1) * 36 + 48 : 0) +
        actionCount * 40,
    );

    const updatePosition = () => {
      if (!moreButtonRef.current) return;
      setMorePos(
        computeFixedPopoverPosition(
          moreButtonRef.current.getBoundingClientRect(),
          MORE_POPOVER_WIDTH,
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
  }, [canEdit, hasBuckets, intentionCategories.length, lifeAreas.length, moreActions.length, moreOpen, onEnergyChange, onLifeAreaChange, onPriorityChange, onPullToNowNext]);

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

  const canShowMore = !editing && !expanded && !animatingOut;

  const runMenuAction = (action: () => void | Promise<void>) => {
    setMoreOpen(false);
    void action();
  };

  return (
    <div
      data-intention-id={intention.id}
      data-expanded={expanded ? "true" : undefined}
      data-editing={editing ? "true" : undefined}
      className={containerClass}
    >
      {/* Row: checkbox + text + calm overflow menu */}
      <div className={`flex items-center gap-2 ${compact ? "py-1.5" : "py-2"}`}>
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
          <span className="flex-1 min-w-0">
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
            {compact && (intention.priority || currentBucket || currentActivityCategory) && (
              <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-[#1A1640]/55">
                {intention.priority && (
                  <span className="uppercase">{intention.priority}</span>
                )}
                {currentBucket && (
                  <span className="flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: currentBucket.color }}
                    />
                    <span className="truncate max-w-[5.5rem]">{currentBucket.name}</span>
                  </span>
                )}
                {currentActivityCategory && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: currentActivityCategory.color }}
                    title={intention.activityCategory ?? undefined}
                  />
                )}
              </span>
            )}
          </span>
        )}

        {canShowMore && (
          <button
            ref={moreButtonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMoreOpen((open) => !open);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="quiet-menu-trigger hit-area"
            aria-label="More intention options"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        )}
      </div>

      {mounted && moreOpen && morePos && createPortal(
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 49 }}
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div
            className="quiet-menu-panel fixed animate-slide-up"
            role="dialog"
            aria-label="Intention options"
            style={{
              zIndex: 50,
              top: morePos.top,
              left: morePos.left,
              width: MORE_POPOVER_WIDTH,
              maxWidth: morePos.maxWidth,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="quiet-menu-meta">
              <div className="quiet-menu-meta-row">
                <span>Bucket</span>
                <strong>{currentBucket?.name ?? "No bucket"}</strong>
              </div>
              <div className="quiet-menu-meta-row">
                <span>Life Area</span>
                <strong>{currentLifeArea?.name ?? "Untagged"}</strong>
              </div>
              <div className="quiet-menu-meta-row">
                <span>Priority</span>
                <strong>{intention.priority ?? "None"}</strong>
              </div>
              <div className="quiet-menu-meta-row">
                <span>Energy</span>
                <strong>{intention.energy ? getEnergyLabel(intention.energy) : "No energy"}</strong>
              </div>
            </div>

            {lifeAreas.length > 0 && onLifeAreaChange && (
              <div className="quiet-menu-section">
                <p className="quiet-menu-kicker">Life Area</p>
                <div className="quiet-menu-options">
                  {lifeAreas.filter((area) => !area.archived && !area.deleted).map((area) => {
                    const selected = area.id === intention.lifeAreaId;
                    return (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => void handlePickLifeArea(area.id)}
                        className="quiet-menu-option"
                        aria-pressed={selected}
                      >
                        <span className="quiet-menu-dot" style={{ backgroundColor: area.color }} aria-hidden="true" />
                        <span className="quiet-menu-option-label">{area.name}</span>
                        {selected && <span className="quiet-menu-check" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => void handlePickLifeArea(null)}
                    className="quiet-menu-option"
                    aria-pressed={!intention.lifeAreaId}
                  >
                    <span className="quiet-menu-dot muted" aria-hidden="true" />
                    <span className="quiet-menu-option-label">Untagged</span>
                    {!intention.lifeAreaId && <span className="quiet-menu-check" aria-hidden="true">✓</span>}
                  </button>
                </div>
              </div>
            )}

            {onPriorityChange && (
              <div className="quiet-menu-section">
                <p className="quiet-menu-kicker">Priority</p>
                <div className="quiet-menu-options">
                  {(["high", "medium", "low"] as const).map((priority) => {
                    const selected = priority === intention.priority;
                    return (
                      <button
                        key={priority}
                        type="button"
                        onClick={() => void handlePickPriority(priority)}
                        className="quiet-menu-option"
                        aria-pressed={selected}
                      >
                        <span className="quiet-menu-option-label capitalize">{priority}</span>
                        {selected && <span className="quiet-menu-check" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => void handlePickPriority(null)}
                    className="quiet-menu-option"
                    aria-pressed={!intention.priority}
                  >
                    <span className="quiet-menu-option-label">No priority</span>
                    {!intention.priority && <span className="quiet-menu-check" aria-hidden="true">✓</span>}
                  </button>
                </div>
              </div>
            )}

            {hasBuckets && (
              <div className="quiet-menu-section">
                <p className="quiet-menu-kicker">Bucket</p>
                <div className="quiet-menu-options">
                  {intentionCategories.map((bucket) => {
                    const selected = bucket.id === intention.categoryId;
                    return (
                      <button
                        key={bucket.id}
                        type="button"
                        onClick={() => void handlePickCategory(bucket.id)}
                        className="quiet-menu-option"
                        aria-pressed={selected}
                      >
                        <span
                          className="quiet-menu-dot"
                          style={{ backgroundColor: bucket.color }}
                          aria-hidden="true"
                        />
                        <span className="quiet-menu-option-label">{bucket.name}</span>
                        {selected && <span className="quiet-menu-check" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => void handlePickCategory(null)}
                    className="quiet-menu-option"
                    aria-pressed={!intention.categoryId}
                  >
                    <span className="quiet-menu-dot quiet-menu-dot-empty" aria-hidden="true" />
                    <span className="quiet-menu-option-label">No bucket</span>
                    {!intention.categoryId && <span className="quiet-menu-check" aria-hidden="true">✓</span>}
                  </button>
                </div>
              </div>
            )}

            {onEnergyChange && (
              <div className="quiet-menu-section">
                <p className="quiet-menu-kicker">Energy</p>
                <div className="quiet-menu-options">
                  {ENERGY_LEVELS.map((level) => {
                    const selected = level === intention.energy;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => void handlePickEnergy(level)}
                        className="quiet-menu-option"
                        aria-pressed={selected}
                      >
                        <span
                          className="quiet-menu-dot"
                          style={{ backgroundColor: getEnergyColor(level) }}
                          aria-hidden="true"
                        />
                        <span aria-hidden="true">{getEnergyEmoji(level)}</span>
                        <span className="quiet-menu-option-label">{getEnergyLabel(level)}</span>
                        {selected && <span className="quiet-menu-check" aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => void handlePickEnergy(null)}
                    className="quiet-menu-option"
                    aria-pressed={!intention.energy}
                  >
                    <span className="quiet-menu-dot quiet-menu-dot-empty" aria-hidden="true" />
                    <span className="quiet-menu-option-label">No energy</span>
                    {!intention.energy && <span className="quiet-menu-check" aria-hidden="true">✓</span>}
                  </button>
                </div>
              </div>
            )}

            <div className="quiet-menu-section">
              <p className="quiet-menu-kicker">Actions</p>
              <div className="quiet-menu-actions">
                {onPullToNowNext && (
                  <button
                    type="button"
                    onClick={() => runMenuAction(() => onPullToNowNext(intention.id))}
                    disabled={pullDisabled}
                    className="quiet-menu-action"
                  >
                    {pullLabel}
                  </button>
                )}
                {moreActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => runMenuAction(action.onClick)}
                    disabled={action.disabled}
                    className={`quiet-menu-action ${action.destructive ? "quiet-menu-action-danger" : ""}`}
                  >
                    {action.label}
                  </button>
                ))}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => runMenuAction(startEdit)}
                    className="quiet-menu-action"
                  >
                    Edit text
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => runMenuAction(() => onDelete(intention.id))}
                  className="quiet-menu-action quiet-menu-action-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

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
