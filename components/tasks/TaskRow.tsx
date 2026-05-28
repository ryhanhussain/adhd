"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Clock3, Pencil, Trash2, X } from "lucide-react";
import type { Intention, PriorityLevel, TimeRequired } from "@/lib/db";
import { Button, IconButton, Input, MetadataChip, cn } from "@/components/ui/primitives";
import TaskMetadataEditor from "./TaskMetadataEditor";

interface TaskRowProps {
  task: Intention;
  onComplete: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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

function priorityTone(priority: Intention["priority"]) {
  if (priority === "high") return "danger" as const;
  if (priority === "medium") return "accent" as const;
  return "neutral" as const;
}

function timeTone(timeRequired: Intention["timeRequired"]) {
  if (timeRequired === "quick") return "success" as const;
  if (timeRequired === "medium") return "accent" as const;
  return "neutral" as const;
}

export default function TaskRow({
  task,
  onComplete,
  onDelete,
  onTextChange,
  onPriorityChange,
  onTimeRequiredChange,
}: TaskRowProps) {
  const [draft, setDraft] = useState(task.text);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(task.text);
  }, [editing, task.text]);

  const commitText = async () => {
    const next = draft.trim();
    if (!next) {
      setDraft(task.text);
      return;
    }
    if (next !== task.text) await onTextChange(task.id, next);
  };

  const finishEditing = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await commitText();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const cancelEditing = () => {
    setDraft(task.text);
    setEditing(false);
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
    <article
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-colors sm:p-4",
        editing && "border-[var(--color-accent)]/45 bg-[var(--color-surface-elevated)]"
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <button
          type="button"
          onClick={() => void complete()}
          disabled={busy}
          className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-accent)] transition-all hover:border-[var(--color-accent)]/45 hover:bg-[var(--color-accent-soft)] active:scale-[0.96] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          aria-label={`Complete ${task.text}`}
          title="Complete"
        >
          <Check size={18} strokeWidth={3} aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void finishEditing();
                }
                if (event.key === "Escape") {
                  cancelEditing();
                }
              }}
              className="min-h-11 bg-[var(--color-bg)] text-sm"
              aria-label="Task text"
            />
          ) : (
            <p className="break-words pt-1 text-sm font-bold leading-6 sm:text-base">{task.text}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MetadataChip tone={priorityTone(task.priority)}>
              <Circle size={9} fill="currentColor" />
              {priorityLabel(task.priority)}
            </MetadataChip>
            <MetadataChip tone={timeTone(task.timeRequired)}>
              <Clock3 size={12} />
              {timeLabel(task.timeRequired)}
            </MetadataChip>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {editing ? (
            <IconButton
              onClick={cancelEditing}
              label={`Cancel editing ${task.text}`}
              size="sm"
            >
              <X size={16} aria-hidden="true" />
            </IconButton>
          ) : (
            <IconButton
              onClick={() => setEditing(true)}
              label={`Edit ${task.text}`}
              size="sm"
            >
              <Pencil size={16} aria-hidden="true" />
            </IconButton>
          )}
          <IconButton
            onClick={() => void onDelete(task.id)}
            label={`Delete ${task.text}`}
            variant="danger"
            size="sm"
          >
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {editing && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <TaskMetadataEditor
            priority={task.priority}
            timeRequired={task.timeRequired}
            onPriorityChange={(priority) => void onPriorityChange(task.id, priority)}
            onTimeRequiredChange={(timeRequired) => void onTimeRequiredChange(task.id, timeRequired)}
          />
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={cancelEditing} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void finishEditing()} disabled={busy}>
              Done
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
