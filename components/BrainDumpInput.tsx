"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import type { ParsedIntention } from "@/lib/ai";
import {
  Button,
  Field,
  IconButton,
  Input,
  SegmentedControl,
  inputClassName,
} from "@/components/ui/primitives";
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

type PriorityChoice = NonNullable<DraftTask["priority"]> | "none";
type TimeChoice = NonNullable<DraftTask["timeRequired"]> | "none";

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

const urgencySegments = urgencyOptions.map((option) => ({
  value: (option.value ?? "none") as PriorityChoice,
  label: option.label,
}));

const timeSegments = timeOptions.map((option) => ({
  value: (option.value ?? "none") as TimeChoice,
  label: option.label,
}));

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
      const { parseBrainDump } = await import("@/lib/ai");
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
              Review
            </p>
            <h2 className="text-lg font-black leading-tight">
              {drafts.length} {drafts.length === 1 ? "task" : "tasks"} ready
            </h2>
          </div>
          <Button
            onClick={() => setDrafts(null)}
            variant="ghost"
            size="sm"
          >
            <ArrowLeft size={15} />
            Back
          </Button>
        </div>

        <div className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto pr-1">
          {drafts.map((draft, index) => (
            <article
              key={`${draft.rawText ?? draft.text}-${index}`}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <Input
                  value={draft.text}
                  onChange={(event) => updateDraft(index, { text: event.target.value })}
                  className="bg-[var(--color-bg)] text-sm"
                  aria-label="Task text"
                />
                <IconButton
                  onClick={() => removeDraft(index)}
                  label="Remove task"
                  variant="danger"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </IconButton>
              </div>

              <div className="mt-3 grid gap-3">
                <div className="grid gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                    Urgency
                  </span>
                  <SegmentedControl
                    value={(draft.priority ?? "none") as PriorityChoice}
                    onChange={(value) =>
                      updateDraft(index, { priority: value === "none" ? null : value })
                    }
                    ariaLabel={`Urgency for task ${index + 1}`}
                    className="grid-cols-4"
                    options={urgencySegments}
                  />
                </div>

                <div className="grid gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                    Time
                  </span>
                  <SegmentedControl
                    value={(draft.timeRequired ?? "none") as TimeChoice}
                    onChange={(value) =>
                      updateDraft(index, { timeRequired: value === "none" ? null : value })
                    }
                    ariaLabel={`Time required for task ${index + 1}`}
                    className="grid-cols-4"
                    options={timeSegments}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>

        <Button
          onClick={() => void commit(drafts)}
          variant="primary"
          size="lg"
          fullWidth
        >
          <Plus size={17} />
          Add tasks
        </Button>

        {toast && <Toast message={toast} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Brain dump">
        <textarea
          id="brain-dump-textarea"
          ref={textareaRef}
          aria-label="Brain dump tasks"
          value={transcript}
          onChange={(event) => {
            setTranscript(event.target.value);
            resizeTextarea(event.currentTarget);
          }}
          placeholder="Dump tasks here..."
          className={inputClassName("w-full resize-none px-4 py-3 text-sm leading-6")}
          style={{ minHeight: TEXTAREA_MIN_HEIGHT, maxHeight: TEXTAREA_MAX_HEIGHT, overflowY: "hidden" }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void handleParse();
            }
          }}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => void handleParse()}
          disabled={!transcript.trim() || isParsing}
          variant="primary"
          size="lg"
          fullWidth
        >
          {isParsing ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={17} />}
          {isParsing ? "Parsing..." : "Review tasks"}
        </Button>
        {showClose && (
          <Button
            onClick={onClose}
            variant="secondary"
            size="lg"
          >
            Close
          </Button>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
