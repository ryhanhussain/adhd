"use client";

import { useState, useRef, useLayoutEffect } from "react";
import type { ParsedIntention, GeminiEnergyLevel } from "@/lib/gemini";
import type { Category, IntentionCategory } from "@/lib/categories";
import type { LifeArea } from "@/lib/lifeAreas";
import { getLifeAreaById, getLifeAreaValues } from "@/lib/lifeAreas";
import { usePersonalValues } from "@/lib/usePersonalValues";
import { getCoreValueLabel } from "@/lib/values";
import { buildTaskWhyChain, normalizeWhyChain } from "@/lib/why";
import BucketChipPicker from "./BucketChipPicker";
import Toast from "./Toast";

interface BrainDumpInputProps {
  /** Commits parsed items. Future items become intentions; past items become entries. */
  onIntentionsParsed: (intentions: ParsedIntention[]) => Promise<void>;
  onClose: () => void;
  /** Current intention buckets; forwarded to the Gemini prompt for dynamic classification. */
  intentionCategories?: IntentionCategory[];
  activityCategories?: Category[];
  lifeAreas?: LifeArea[];
  /** Focus the text area as soon as the input mounts. Defaults to true. */
  autoFocus?: boolean;
}

interface DraftItem {
  rawText?: string;
  tense: "past" | "future";
  text: string;
  categoryName: string | null;
  categoryId: string | null;
  lifeAreaId: string | null;
  priority: "high" | "medium" | "low" | null;
  durationMinutes: number | null;
  loggedAt: string | null;
  energy: GeminiEnergyLevel | null;
  whyChain: string | null;
  whyTouched?: boolean;
  confidence?: number | null;
}

const TEXTAREA_MIN_HEIGHT = 80;
const TEXTAREA_MAX_HEIGHT = 176;

export default function BrainDumpInput({
  onIntentionsParsed,
  onClose,
  intentionCategories,
  activityCategories,
  lifeAreas,
  autoFocus = true,
}: BrainDumpInputProps) {
  const personalValues = usePersonalValues();
  const [transcript, setTranscript] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[] | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = (ta = textareaRef.current) => {
    if (!ta) return;
    ta.style.height = "auto";
    const nextHeight = Math.min(TEXTAREA_MAX_HEIGHT, Math.max(TEXTAREA_MIN_HEIGHT, ta.scrollHeight));
    ta.style.height = `${nextHeight}px`;
    ta.style.overflowY = ta.scrollHeight > TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  };

  useLayoutEffect(() => {
    if (!autoFocus || drafts) return;
    textareaRef.current?.focus({ preventScroll: true });
  }, [autoFocus, drafts]);

  useLayoutEffect(() => {
    if (!drafts) resizeTextarea();
  }, [transcript, drafts]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const generatedWhyChain = (text: string, lifeAreaId: string | null): string => {
    const lifeArea = getLifeAreaById(lifeAreaId, lifeAreas ?? []);
    return buildTaskWhyChain({ taskText: text, lifeArea, selectedValues: personalValues }) ?? "";
  };

  const handleParse = async () => {
    if (!transcript.trim()) return;
    setIsParsing(true);
    try {
      const { parseBrainDump } = await import("@/lib/gemini");
      const result = await parseBrainDump(
        transcript.trim(),
        intentionCategories?.map((c) => ({ id: c.id, name: c.name, description: c.description })),
        lifeAreas
          ?.filter((area) => !area.archived && !area.deleted)
          .map((area) => {
            const values = getLifeAreaValues(area, personalValues);
            return {
              id: area.id,
              name: area.name,
              description: area.description,
              valueLabels: values.map((value) => value.label),
              coreValueLabel: getCoreValueLabel(area.coreValue ?? values[0]?.coreValue ?? null),
            };
          }),
        activityCategories?.map((category) => ({ name: category.name, color: category.color }))
      );
      if (!result.ok) {
        const messages = {
          auth: "Session expired — sign in again",
          cap: "Daily AI limit reached — try again tomorrow",
          burst: "Slow down a sec — try again in a moment",
          quota_error: "Quota check failed — see console / Supabase",
          network: "Couldn't reach AI — check connection and retry",
          server: "AI hiccup — please retry",
        } as const;
        showToast(messages[result.reason]);
        return;
      }
      if (result.intentions.length === 0) {
        showToast("Couldn't find any tasks in there.");
        return;
      }
      setDrafts(
        result.intentions.map((i) => {
          const tense = i.tense ?? "future";
          const lifeAreaId = i.lifeAreaId ?? null;
          return {
            rawText: i.rawText,
            tense,
            text: i.text,
            categoryName: i.categoryName ?? null,
            categoryId: i.categoryId ?? null,
            lifeAreaId,
            priority: i.priority ?? null,
            durationMinutes: i.durationMinutes ?? null,
            loggedAt: i.loggedAt ?? null,
            energy: i.energy ?? null,
            whyChain:
              tense === "future"
                ? normalizeWhyChain(i.whyChain) ?? generatedWhyChain(i.text, lifeAreaId)
                : null,
            whyTouched: false,
            confidence: i.confidence ?? null,
          };
        })
      );
    } catch (e) {
      console.error("Brain dump parse failed:", e);
      showToast("Something went wrong. Try again.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!drafts || drafts.length === 0) return;
    await onIntentionsParsed(
      drafts.map((d) => ({
        rawText: d.rawText,
        tense: d.tense,
        text: d.text,
        categoryName: d.categoryName,
        categoryId: d.tense === "future" ? d.categoryId : null,
        lifeAreaId: d.lifeAreaId,
        priority: d.tense === "future" ? d.priority : null,
        durationMinutes: d.tense === "past" ? d.durationMinutes : null,
        loggedAt: d.tense === "past" ? d.loggedAt : null,
        energy: d.energy,
        whyChain: d.tense === "future" ? normalizeWhyChain(d.whyChain) : null,
        confidence: d.confidence,
      }))
    );
    onClose();
  };

  const handleConfirmOne = async (idx: number) => {
    if (!drafts?.[idx]) return;
    const d = drafts[idx];
    await onIntentionsParsed([
      {
        rawText: d.rawText,
        tense: d.tense,
        text: d.text,
        categoryName: d.categoryName,
        categoryId: d.tense === "future" ? d.categoryId : null,
        lifeAreaId: d.lifeAreaId,
        priority: d.tense === "future" ? d.priority : null,
        durationMinutes: d.tense === "past" ? d.durationMinutes : null,
        loggedAt: d.tense === "past" ? d.loggedAt : null,
        energy: d.energy,
        whyChain: d.tense === "future" ? normalizeWhyChain(d.whyChain) : null,
        confidence: d.confidence,
      },
    ]);
    setDrafts((prev) => {
      const next = prev ? prev.filter((_, i) => i !== idx) : prev;
      if (next && next.length === 0) setTimeout(onClose, 0);
      return next;
    });
  };

  const updateDraft = (idx: number, patch: Partial<DraftItem>) => {
    setDrafts((prev) => (prev ? prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)) : prev));
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  };

  // Stage 2: review + edit parsed items.
  if (drafts) {
    const activeLifeAreas = (lifeAreas ?? []).filter((area) => !area.archived && !area.deleted);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            {drafts.length} {drafts.length === 1 ? "item" : "items"} parsed — tweak before adding
          </span>
          <button
            onClick={() => setDrafts(null)}
            className="text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ← Back
          </button>
        </div>

        <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-1">
          {drafts.map((d, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-1 text-lg leading-none text-[var(--color-text-muted)]"
                  aria-hidden="true"
                >
                  {d.tense === "past" ? "‹" : "›"}
                </span>
                <input
                  value={d.text}
                  onChange={(e) => {
                    const text = e.target.value;
                    updateDraft(idx, {
                      text,
                      ...(!d.whyTouched ? { whyChain: generatedWhyChain(text, d.lifeAreaId) } : {}),
                    });
                  }}
                  className="flex-1 text-sm bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none py-0.5"
                />
                <button
                  onClick={() => removeDraft(idx)}
                  className="hit-area w-7 h-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-all active:scale-90 flex-shrink-0"
                  aria-label="Remove task"
                  title="Remove"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={d.lifeAreaId ?? ""}
                  onChange={(e) => {
                    const lifeAreaId = e.target.value || null;
                    updateDraft(idx, {
                      lifeAreaId,
                      ...(d.tense === "future" && !d.whyTouched
                        ? { whyChain: generatedWhyChain(d.text, lifeAreaId) }
                        : {}),
                    });
                  }}
                  className="h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold"
                  aria-label="Life Area"
                >
                  <option value="">+ Life Area</option>
                  {activeLifeAreas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
                {activityCategories && activityCategories.length > 0 && (
                  <select
                    value={d.categoryName ?? ""}
                    onChange={(e) => updateDraft(idx, { categoryName: e.target.value || null })}
                    className="h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold"
                    aria-label="Category"
                  >
                    <option value="">Category</option>
                    {activityCategories.map((category) => (
                      <option key={category.name} value={category.name}>{category.name}</option>
                    ))}
                  </select>
                )}
                {intentionCategories && intentionCategories.length > 0 && (
                  d.tense === "future" && (
                    <BucketChipPicker
                      buckets={intentionCategories}
                      value={d.categoryId}
                      onChange={(next) => updateDraft(idx, { categoryId: next })}
                      popoverZ={61}
                    />
                  )
                )}
                {d.tense === "future" ? (
                  <select
                    value={d.priority ?? ""}
                    onChange={(e) => updateDraft(idx, { priority: (e.target.value || null) as DraftItem["priority"] })}
                    className="h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold uppercase"
                    aria-label="Priority"
                  >
                    <option value="">Priority</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                ) : (
                  <>
                    <label className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold">
                      <span aria-hidden="true">⏱</span>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={d.durationMinutes ?? ""}
                        onChange={(e) => updateDraft(idx, { durationMinutes: e.target.value ? Number(e.target.value) : null })}
                        className="w-12 bg-transparent outline-none tabular-nums"
                        aria-label="Duration minutes"
                      />
                      <span>m</span>
                    </label>
                    <input
                      type="time"
                      value={d.loggedAt ? new Date(d.loggedAt).toTimeString().slice(0, 5) : ""}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(":").map(Number);
                        const base = d.loggedAt ? new Date(d.loggedAt) : new Date();
                        if (Number.isFinite(h) && Number.isFinite(m)) {
                          base.setHours(h, m, 0, 0);
                          updateDraft(idx, { loggedAt: base.toISOString() });
                        }
                      }}
                      className="h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold tabular-nums"
                      aria-label="Logged time"
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void handleConfirmOne(idx)}
                  className="h-9 w-9 rounded-full bg-[var(--color-accent)] text-[var(--color-on-accent)] text-lg font-bold active:scale-95"
                  aria-label="Confirm this item"
                >
                  →
                </button>
              </div>

              {d.tense === "future" && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Why you're here
                  </span>
                  <input
                    value={d.whyChain ?? ""}
                    onChange={(e) =>
                      updateDraft(idx, {
                        whyChain: e.target.value,
                        whyTouched: true,
                      })
                    }
                    placeholder={generatedWhyChain(d.text, d.lifeAreaId)}
                    className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-semibold outline-none focus:border-[var(--color-accent)]"
                  />
                </label>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            className="flex-1 h-12 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.97] shadow-lg shadow-[var(--color-accent)]/20"
          >
            Confirm all ({drafts.length})
          </button>
        </div>

        {toast && <Toast message={toast} />}
      </div>
    );
  }

  // Stage 1: free-form transcript.
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor="brain-dump-textarea" className="sr-only">
          Brain dump — what do you need to do?
        </label>
        <textarea
          id="brain-dump-textarea"
          ref={textareaRef}
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            resizeTextarea(e.currentTarget);
          }}
          placeholder="Type or speak your brain dump — anything you want to track..."
          className="capture-textarea w-full rounded-xl glass-panel px-4 py-3 text-sm resize-none focus:outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_12px_var(--color-accent-soft)] transition-colors duration-150 placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/30"
          style={{ minHeight: TEXTAREA_MIN_HEIGHT, maxHeight: TEXTAREA_MAX_HEIGHT, overflowY: "hidden" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleParse();
            }
          }}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleParse}
          disabled={!transcript.trim() || isParsing}
          className="flex-1 h-12 rounded-xl text-[var(--color-on-accent)] font-medium text-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_var(--color-accent-soft)] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed active:scale-[0.95] bg-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/20 flex items-center justify-center gap-2"
        >
          {isParsing ? (
            <>
              <div className="w-4 h-4 border-2 border-[var(--color-on-accent)]/30 border-t-[var(--color-on-accent)] rounded-full animate-spin" />
              Parsing intentions...
            </>
          ) : (
            "Parse"
          )}
        </button>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
