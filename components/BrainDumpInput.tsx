"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ParsedIntention } from "@/lib/gemini";
import Toast from "./Toast";

interface BrainDumpInputProps {
  onIntentionsParsed: (intentions: ParsedIntention[]) => Promise<void>;
  onClose: () => void;
  autoFocus?: boolean;
  showClose?: boolean;
}

type DraftTask = {
  rawText?: string;
  text: string;
  priority: "high" | "medium" | "low" | null;
  timeRequired: "quick" | "medium" | "long" | null;
  confidence?: number | null;
};

const TEXTAREA_MIN_HEIGHT = 104;
const TEXTAREA_MAX_HEIGHT = 220;

const urgencyOptions: { value: DraftTask["priority"]; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: null, label: "None" },
];

const timeOptions: { value: DraftTask["timeRequired"]; label: string }[] = [
  { value: "quick", label: "Quick" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
  { value: null, label: "Unset" },
];

export default function BrainDumpInput({
  onIntentionsParsed,
  onClose,
  autoFocus = true,
  showClose = true,
}: BrainDumpInputProps) {
  const [transcript, setTranscript] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [drafts, setDrafts] = useState<DraftTask[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleParse = async () => {
    const text = transcript.trim();
    if (!text || isParsing) return;
    setIsParsing(true);
    try {
      const { parseBrainDump } = await import("@/lib/gemini");
      const result = await parseBrainDump(text);
      if (!result.ok) {
        const messages = {
          auth: "Session expired - sign in again",
          cap: "Daily AI limit reached - try again tomorrow",
          burst: "Slow down a sec - try again in a moment",
          quota_error: "Quota check failed - see console / Supabase",
          network: "Couldn't reach AI - check connection and retry",
          server: "AI hiccup - please retry",
        } as const;
        showToast(messages[result.reason]);
        return;
      }

      const tasks = result.intentions
        .map((item) => ({
          rawText: item.rawText,
          text: item.text.trim(),
          priority: item.priority ?? null,
          timeRequired: item.timeRequired ?? null,
          confidence: item.confidence ?? null,
        }))
        .filter((item) => item.text.length > 0);

      if (tasks.length === 0) {
        showToast("Couldn't find any future tasks in there.");
        return;
      }
      setDrafts(tasks);
    } catch (e) {
      console.error("Brain dump parse failed:", e);
      showToast("Something went wrong. Try again.");
    } finally {
      setIsParsing(false);
    }
  };

  const updateDraft = (index: number, patch: Partial<DraftTask>) => {
    setDrafts((prev) => (prev ? prev.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)) : prev));
  };

  const removeDraft = (index: number) => {
    setDrafts((prev) => {
      const next = prev ? prev.filter((_, i) => i !== index) : prev;
      if (next && next.length === 0) setTimeout(() => setDrafts(null), 0);
      return next;
    });
  };

  const commit = async (items: DraftTask[]) => {
    const cleaned = items
      .map((item) => ({
        rawText: item.rawText,
        text: item.text.trim(),
        priority: item.priority,
        timeRequired: item.timeRequired,
        tense: "future" as const,
        confidence: item.confidence ?? null,
      }))
      .filter((item) => item.text.length > 0);
    if (cleaned.length === 0) return;
    await onIntentionsParsed(cleaned);
    setTranscript("");
    setDrafts(null);
    onClose();
  };

  if (drafts) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {drafts.length} {drafts.length === 1 ? "task" : "tasks"}
          </span>
          <button
            type="button"
            onClick={() => setDrafts(null)}
            className="h-8 px-3 rounded-lg text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          >
            Back
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto pr-1 flex flex-col gap-2">
          {drafts.map((draft, index) => (
            <div
              key={`${draft.rawText ?? draft.text}-${index}`}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="flex items-start gap-2">
                <input
                  value={draft.text}
                  onChange={(event) => updateDraft(index, { text: event.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 text-sm font-semibold outline-none focus:border-[var(--color-accent)]"
                  aria-label="Task text"
                />
                <button
                  type="button"
                  onClick={() => removeDraft(index)}
                  className="h-8 w-8 flex-shrink-0 rounded-md text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-500"
                  aria-label="Remove task"
                  title="Remove"
                >
                  x
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Urgency
                  </span>
                  <select
                    value={draft.priority ?? ""}
                    onChange={(event) =>
                      updateDraft(index, { priority: (event.target.value || null) as DraftTask["priority"] })
                    }
                    className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs font-semibold"
                  >
                    {urgencyOptions.map((option) => (
                      <option key={option.value ?? "none"} value={option.value ?? ""}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Time
                  </span>
                  <select
                    value={draft.timeRequired ?? ""}
                    onChange={(event) =>
                      updateDraft(index, { timeRequired: (event.target.value || null) as DraftTask["timeRequired"] })
                    }
                    className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs font-semibold"
                  >
                    {timeOptions.map((option) => (
                      <option key={option.value ?? "none"} value={option.value ?? ""}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void commit(drafts)}
          className="h-11 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-on-accent)] active:scale-[0.98]"
        >
          Add tasks
        </button>

        {toast && <Toast message={toast} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="brain-dump-textarea" className="sr-only">
        Brain dump tasks
      </label>
      <textarea
        id="brain-dump-textarea"
        ref={textareaRef}
        value={transcript}
        onChange={(event) => {
          setTranscript(event.target.value);
          resizeTextarea(event.currentTarget);
        }}
        placeholder="Dump tasks here..."
        className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
        style={{ minHeight: TEXTAREA_MIN_HEIGHT, maxHeight: TEXTAREA_MAX_HEIGHT, overflowY: "hidden" }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void handleParse();
          }
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleParse()}
          disabled={!transcript.trim() || isParsing}
          className="h-11 flex-1 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-on-accent)] disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]"
        >
          {isParsing ? "Parsing..." : "Parse tasks"}
        </button>
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            Close
          </button>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
