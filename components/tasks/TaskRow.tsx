"use client";

import { useEffect, useState } from "react";
import type { Intention, PriorityLevel, TimeRequired } from "@/lib/db";
import TaskMetadataEditor from "./TaskMetadataEditor";

interface TaskRowProps {
  task: Intention;
  editable: boolean;
  onComplete: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStartFocus: (id: string) => void;
  onTextChange: (id: string, text: string) => Promise<void>;
  onPriorityChange: (id: string, priority: PriorityLevel | null) => Promise<void>;
  onTimeRequiredChange: (id: string, timeRequired: TimeRequired | null) => Promise<void>;
}

function priorityLabel(priority: Intention["priority"]): string {
  if (!priority) return "No urgency";
  return `${priority[0].toUpperCase()}${priority.slice(1)} urgency`;
}

function timeLabel(timeRequired: Intention["timeRequired"]): string {
  if (!timeRequired) return "No time set";
  if (timeRequired === "quick") return "Quick";
  if (timeRequired === "medium") return "Medium";
  return "Long";
}

export default function TaskRow({
  task,
  editable,
  onComplete,
  onDelete,
  onStartFocus,
  onTextChange,
  onPriorityChange,
  onTimeRequiredChange,
}: TaskRowProps) {
  const [draft, setDraft] = useState(task.text);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(task.text);
  }, [task.text]);

  const commitText = async () => {
    const next = draft.trim();
    if (!next) {
      setDraft(task.text);
      return;
    }
    if (next !== task.text) await onTextChange(task.id, next);
  };

  const complete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onComplete(task.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => void complete()}
          disabled={busy}
          className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-accent)] disabled:opacity-50"
          aria-label={`Complete ${task.text}`}
          title="Complete"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          {editable ? (
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void commitText()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setDraft(task.text);
                  event.currentTarget.blur();
                }
              }}
              className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none focus:border-[var(--color-accent)]"
              aria-label="Task text"
            />
          ) : (
            <p className="break-words text-sm font-semibold leading-snug">{task.text}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-muted)]">
            <span className="rounded-md bg-[var(--color-bg)] px-2 py-0.5">{priorityLabel(task.priority)}</span>
            <span className="rounded-md bg-[var(--color-bg)] px-2 py-0.5">{timeLabel(task.timeRequired)}</span>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onStartFocus(task.id)}
            className="h-8 w-8 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
            aria-label={`Focus on ${task.text}`}
            title="Focus"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2 2" />
              <path d="M9 2h6" />
            </svg>
          </button>
          {editable && (
            <button
              type="button"
              onClick={() => void onDelete(task.id)}
              className="h-8 w-8 rounded-md text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-500"
              aria-label={`Delete ${task.text}`}
              title="Delete"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="m19 6-1 14H6L5 6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {editable && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <TaskMetadataEditor
            priority={task.priority}
            timeRequired={task.timeRequired}
            onPriorityChange={(priority) => void onPriorityChange(task.id, priority)}
            onTimeRequiredChange={(timeRequired) => void onTimeRequiredChange(task.id, timeRequired)}
          />
        </div>
      )}
    </div>
  );
}
