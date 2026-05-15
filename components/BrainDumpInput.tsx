"use client";

import { useState, useRef, useLayoutEffect } from "react";
import type { ParsedIntention, GeminiEnergyLevel } from "@/lib/gemini";
import type { IntentionCategory } from "@/lib/categories";
import BucketChipPicker from "./BucketChipPicker";
import EnergyPicker from "./EnergyPicker";
import Toast from "./Toast";

interface BrainDumpInputProps {
  /** Commits the parsed (and possibly user-edited) intentions to the backlog. */
  onIntentionsParsed: (intentions: ParsedIntention[]) => Promise<void>;
  onClose: () => void;
  /** Current intention buckets; forwarded to the Gemini prompt for dynamic classification. */
  intentionCategories?: IntentionCategory[];
  /** Focus the text area as soon as the input mounts. Defaults to true. */
  autoFocus?: boolean;
}

interface DraftItem {
  text: string;
  categoryId: string | null;
  energy: GeminiEnergyLevel | null;
}

const TEXTAREA_MIN_HEIGHT = 80;
const TEXTAREA_MAX_HEIGHT = 176;

export default function BrainDumpInput({
  onIntentionsParsed,
  onClose,
  intentionCategories,
  autoFocus = true,
}: BrainDumpInputProps) {
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

  const handleParse = async () => {
    if (!transcript.trim()) return;
    setIsParsing(true);
    try {
      const { parseBrainDump } = await import("@/lib/gemini");
      const result = await parseBrainDump(
        transcript.trim(),
        intentionCategories?.map((c) => ({ id: c.id, name: c.name, description: c.description }))
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
        result.intentions.map((i) => ({
          text: i.text,
          categoryId: i.categoryId ?? null,
          energy: i.energy ?? null,
        }))
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
      drafts.map((d) => ({ text: d.text, categoryId: d.categoryId, energy: d.energy }))
    );
    onClose();
  };

  const updateDraft = (idx: number, patch: Partial<DraftItem>) => {
    setDrafts((prev) => (prev ? prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)) : prev));
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  };

  // Stage 2: review + edit parsed items.
  if (drafts) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            {drafts.length} {drafts.length === 1 ? "task" : "tasks"} parsed — tweak before adding
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
                <input
                  value={d.text}
                  onChange={(e) => updateDraft(idx, { text: e.target.value })}
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
                {intentionCategories && intentionCategories.length > 0 && (
                  <BucketChipPicker
                    buckets={intentionCategories}
                    value={d.categoryId}
                    onChange={(next) => updateDraft(idx, { categoryId: next })}
                    popoverZ={61}
                  />
                )}
                <EnergyPicker
                  value={d.energy}
                  onChange={(level) => updateDraft(idx, { energy: level })}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            className="flex-1 h-12 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.97] shadow-lg shadow-[var(--color-accent)]/20"
          >
            Add {drafts.length} to backlog
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
