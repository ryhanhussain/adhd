"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  Bot,
  CalendarPlus,
  Check,
  Clock3,
  GripVertical,
  Inbox,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import BrainDumpInput from "@/components/BrainDumpInput";
import TaskMetadataEditor from "@/components/tasks/TaskMetadataEditor";
import Toast from "@/components/Toast";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  MetadataChip,
  PageHeader,
  PageShell,
  Panel,
  SectionHeader,
  SegmentedControl,
  Textarea,
  cn,
} from "@/components/ui/primitives";
import {
  addEntry,
  addIntentions,
  deleteIntention,
  getActiveIntentions,
  getDailyPlannerChat,
  saveDailyPlannerChat,
  toLocalDateStr,
  updateIntention,
  type DailyPlannerChatMessage,
  type Intention,
  type PriorityLevel,
  type TimeRequired,
} from "@/lib/db";
import {
  requestPlannerPlan,
  type ParsedIntention,
  type PlannerAction,
  type PlannerTaskContext,
} from "@/lib/ai";
import { syncEntriesNow } from "@/lib/entriesSync";
import { syncIntentionsNow } from "@/lib/intentionsSync";

type DayKey = "today" | "tomorrow";

const TOMORROW_START_HOUR = 8;
const DROP_ID_INBOX = "inbox";
const ERROR_MESSAGES = {
  auth: "Session expired - sign in again",
  cap: "Daily AI limit reached - try again tomorrow",
  burst: "Slow down a sec - try again in a moment",
  quota_error: "Quota check failed - see console / Supabase",
  network: "Couldn't reach AI - check connection and retry",
  server: "AI hiccup - please retry",
} as const;

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatClock(minute: number): string {
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  return new Date(2024, 0, 1, hour, min).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function durationForEffort(timeRequired: Intention["timeRequired"]): number {
  if (timeRequired === "quick") return 15;
  if (timeRequired === "long") return 60;
  return 30;
}

function clampDuration(startMinute: number, duration: number): number {
  return Math.max(5, Math.min(duration, 1440 - startMinute, 480));
}

function isValidMinute(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1439;
}

function isValidDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 5 && value <= 480;
}

function isAllowedDate(date: unknown, todayDate: string, tomorrowDate: string): date is string {
  return typeof date === "string" && (date === todayDate || date === tomorrowDate);
}

function isScheduled(task: Intention, todayDate: string, tomorrowDate: string): boolean {
  return isAllowedDate(task.plannedDate, todayDate, tomorrowDate) && isValidMinute(task.plannedStartMinute);
}

function slotId(date: string, hour: number): string {
  return `slot:${date}:${hour}`;
}

function parseSlotId(id: string): { date: string; hour: number } | null {
  const parts = id.split(":");
  if (parts.length !== 3 || parts[0] !== "slot") return null;
  const hour = Number.parseInt(parts[2], 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return { date: parts[1], hour };
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

function priorityLabel(priority: Intention["priority"]): string {
  if (!priority) return "No urgency";
  return `${priority[0].toUpperCase()}${priority.slice(1)} urgency`;
}

function timeLabel(timeRequired: Intention["timeRequired"]): string {
  if (!timeRequired) return "30 min";
  if (timeRequired === "quick") return "15 min";
  if (timeRequired === "medium") return "30 min";
  return "60 min";
}

function sortInbox(tasks: Intention[]): Intention[] {
  return [...tasks].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return b.createdAt - a.createdAt;
  });
}

function sortScheduled(tasks: Intention[]): Intention[] {
  return [...tasks].sort((a, b) => {
    const byStart = (a.plannedStartMinute ?? 0) - (b.plannedStartMinute ?? 0);
    if (byStart !== 0) return byStart;
    if ((a.plannedDurationMinutes ?? 0) !== (b.plannedDurationMinutes ?? 0)) {
      return (a.plannedDurationMinutes ?? 0) - (b.plannedDurationMinutes ?? 0);
    }
    return a.order - b.order;
  });
}

function taskContext(tasks: Intention[], todayDate: string, tomorrowDate: string): PlannerTaskContext[] {
  return tasks
    .filter((task) => !task.plannedDate || task.plannedDate === todayDate || task.plannedDate === tomorrowDate)
    .map((task) => ({
      id: task.id,
      text: task.text,
      priority: task.priority ?? null,
      timeRequired: task.timeRequired ?? null,
      plannedDate: task.plannedDate ?? null,
      plannedStartMinute: task.plannedStartMinute ?? null,
      plannedDurationMinutes: task.plannedDurationMinutes ?? null,
    }));
}

function DropZone({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-colors",
        isOver && "border-[var(--color-accent)] bg-[var(--color-accent-soft)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function TaskCard({
  task,
  selected,
  scheduled,
  todayDate,
  tomorrowDate,
  onSelect,
  onComplete,
  onDelete,
  onTextChange,
  onPriorityChange,
  onTimeRequiredChange,
  onSendTomorrow,
  onUnschedule,
}: {
  task: Intention;
  selected: boolean;
  scheduled: boolean;
  todayDate: string;
  tomorrowDate: string;
  onSelect: (id: string) => void;
  onComplete: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTextChange: (id: string, text: string) => Promise<void>;
  onPriorityChange: (id: string, priority: PriorityLevel | null) => Promise<void>;
  onTimeRequiredChange: (id: string, timeRequired: TimeRequired | null) => Promise<void>;
  onSendTomorrow: (id: string) => Promise<void>;
  onUnschedule: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(task.text);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: editing || busy,
  });

  useEffect(() => {
    if (!editing) setDraft(task.text);
  }, [editing, task.text]);

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  const finishEditing = async () => {
    const next = draft.trim();
    if (!next) {
      setDraft(task.text);
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      if (next !== task.text) await onTextChange(task.id, next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
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

  const plannedEnd =
    isValidMinute(task.plannedStartMinute)
      ? task.plannedStartMinute + (task.plannedDurationMinutes ?? durationForEffort(task.timeRequired))
      : null;

  return (
    <article
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(task.id)}
      className={cn(
        "rounded-xl border bg-[var(--color-surface)] p-3 transition-all",
        selected ? "border-[var(--color-accent)] shadow-[0_14px_35px_-24px_var(--color-accent)]" : "border-[var(--color-border)]",
        editing && "bg-[var(--color-surface-elevated)]",
        isDragging && "z-30 scale-[1.01] opacity-80 shadow-xl"
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={stop}
          className="grid h-9 w-9 cursor-grab place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] active:cursor-grabbing"
          aria-label={`Drag ${task.text}`}
          title="Drag"
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>

        <div className="min-w-0">
          {editing ? (
            <Input
              value={draft}
              onClick={stop}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void finishEditing();
                }
                if (event.key === "Escape") {
                  setDraft(task.text);
                  setEditing(false);
                }
              }}
              className="min-h-10 bg-[var(--color-bg)] text-sm"
              aria-label="Task text"
            />
          ) : (
            <p className="break-words text-sm font-bold leading-5">{task.text}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MetadataChip tone={priorityTone(task.priority)}>{priorityLabel(task.priority)}</MetadataChip>
            <MetadataChip tone={timeTone(task.timeRequired)}>
              <Clock3 size={12} />
              {timeLabel(task.timeRequired)}
            </MetadataChip>
            {scheduled && isValidMinute(task.plannedStartMinute) && (
              <MetadataChip tone="accent">
                {formatClock(task.plannedStartMinute)}
                {plannedEnd ? `-${formatClock(Math.min(plannedEnd, 1439))}` : ""}
              </MetadataChip>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1" onClick={stop}>
          <IconButton onClick={() => void complete()} label={`Complete ${task.text}`} variant="secondary" size="sm">
            <Check size={15} aria-hidden="true" />
          </IconButton>
          <IconButton
            onClick={() => {
              if (editing) {
                setDraft(task.text);
                setEditing(false);
              } else {
                setEditing(true);
              }
            }}
            label={editing ? `Cancel editing ${task.text}` : `Edit ${task.text}`}
            size="sm"
          >
            {editing ? <X size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
          </IconButton>
          <IconButton onClick={() => void onDelete(task.id)} label={`Delete ${task.text}`} variant="danger" size="sm">
            <Trash2 size={15} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {editing && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3" onClick={stop}>
          <TaskMetadataEditor
            priority={task.priority}
            timeRequired={task.timeRequired}
            onPriorityChange={(priority) => void onPriorityChange(task.id, priority)}
            onTimeRequiredChange={(timeRequired) => void onTimeRequiredChange(task.id, timeRequired)}
          />
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(task.text);
                setEditing(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void finishEditing()} disabled={busy}>
              Done
            </Button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2" onClick={stop}>
          {task.plannedDate !== tomorrowDate && (
            <Button variant="ghost" size="sm" onClick={() => void onSendTomorrow(task.id)}>
              <CalendarPlus size={14} aria-hidden="true" />
              Tomorrow
            </Button>
          )}
          {(task.plannedDate === todayDate || task.plannedDate === tomorrowDate) && (
            <Button variant="ghost" size="sm" onClick={() => void onUnschedule(task.id)}>
              <RotateCcw size={14} aria-hidden="true" />
              Inbox
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function TimelineSlot({
  date,
  hour,
  tasks,
  selectedTaskId,
  todayDate,
  tomorrowDate,
  onPlaceSelected,
  taskHandlers,
}: {
  date: string;
  hour: number;
  tasks: Intention[];
  selectedTaskId: string | null;
  todayDate: string;
  tomorrowDate: string;
  onPlaceSelected: (date: string, hour: number) => void;
  taskHandlers: Omit<React.ComponentProps<typeof TaskCard>, "task" | "selected" | "scheduled" | "todayDate" | "tomorrowDate">;
}) {
  return (
    <DropZone
      id={slotId(date, hour)}
      className="grid min-h-[6.25rem] grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-3"
    >
      <div>
        <p className="text-sm font-black leading-none">{formatClock(hour * 60)}</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          {tasks.length ? `${tasks.length} item${tasks.length === 1 ? "" : "s"}` : "Open"}
        </p>
        {selectedTaskId && (
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => onPlaceSelected(date, hour)}>
            Place
          </Button>
        )}
      </div>
      <div className="grid gap-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            selected={selectedTaskId === task.id}
            scheduled
            todayDate={todayDate}
            tomorrowDate={tomorrowDate}
            {...taskHandlers}
          />
        ))}
      </div>
    </DropZone>
  );
}

function AiPlannerCard({
  tasks,
  todayDate,
  tomorrowDate,
  onApplyActions,
  showToast,
}: {
  tasks: Intention[];
  todayDate: string;
  tomorrowDate: string;
  onApplyActions: (actions: PlannerAction[]) => Promise<number>;
  showToast: (message: string) => void;
}) {
  const [messages, setMessages] = useState<DailyPlannerChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState<PlannerAction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDailyPlannerChat(todayDate).then((items) => {
      if (!cancelled) setMessages(items);
    });
    return () => {
      cancelled = true;
    };
  }, [todayDate]);

  const persistMessages = async (next: DailyPlannerChatMessage[]) => {
    setMessages(next);
    await saveDailyPlannerChat(todayDate, next);
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const now = Date.now();
    const userMessage: DailyPlannerChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: now,
    };
    const nextMessages = [...messages, userMessage].slice(-16);
    setInput("");
    setPendingActions(null);
    await persistMessages(nextMessages);
    setLoading(true);
    try {
      const result = await requestPlannerPlan({
        messages: nextMessages.map((message) => ({
          role: message.role,
          text: message.text,
          createdAt: message.createdAt,
        })),
        tasks: taskContext(tasks, todayDate, tomorrowDate),
        todayDate,
        tomorrowDate,
      });
      if (!result.ok) {
        showToast(ERROR_MESSAGES[result.reason]);
        return;
      }
      const assistantMessage: DailyPlannerChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: result.message,
        createdAt: Date.now(),
      };
      await persistMessages([...nextMessages, assistantMessage].slice(-16));
      setPendingActions(result.actions);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!pendingActions || pendingActions.length === 0) return;
    const count = await onApplyActions(pendingActions);
    setPendingActions(null);
    showToast(count === 0 ? "No valid changes to apply" : `${count} change${count === 1 ? "" : "s"} applied`);
  };

  return (
    <Panel className="grid gap-4">
      <SectionHeader
        title="Daily AI"
        description="Ask for a plan, then preview before anything changes."
        actions={<Bot size={20} className="text-[var(--color-accent)]" aria-hidden="true" />}
      />

      {messages.length > 0 && (
        <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
          {messages.slice(-6).map((message) => (
            <div
              key={message.id}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium leading-6",
                message.role === "user"
                  ? "ml-8 border-[var(--color-accent)]/20 bg-[var(--color-accent-soft)]"
                  : "mr-8 border-[var(--color-border)] bg-[var(--color-surface)]"
              )}
            >
              {message.text}
            </div>
          ))}
        </div>
      )}

      <Field label="Planner chat">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask for a tiny plan for the next few hours..."
          className="min-h-24 resize-none"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
        />
      </Field>
      <Button onClick={() => void handleSubmit()} disabled={!input.trim() || loading} variant="primary" fullWidth>
        {loading ? <LoaderCircle size={17} className="animate-spin" /> : <WandSparkles size={17} />}
        {loading ? "Thinking..." : "Preview plan"}
      </Button>

      {pendingActions && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            Proposed changes
          </p>
          {pendingActions.length > 0 ? (
            <ul className="mt-2 grid gap-1.5 text-sm font-semibold">
              {pendingActions.map((action, index) => (
                <li key={`${action.type}-${index}`}>{describeAction(action, tasks)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm font-medium text-[var(--color-text-muted)]">
              No task changes proposed.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => void apply()} disabled={pendingActions.length === 0}>
              Apply
            </Button>
            <Button variant="ghost" onClick={() => setPendingActions(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

function describeAction(action: PlannerAction, tasks: Intention[]): string {
  const taskName =
    "id" in action ? tasks.find((task) => task.id === action.id)?.text ?? "Unknown task" : action.text;

  if (action.type === "create_task") {
    return action.plannedDate && isValidMinute(action.plannedStartMinute)
      ? `Create "${action.text}" at ${formatClock(action.plannedStartMinute)}`
      : `Create "${action.text}" in Inbox`;
  }
  if (action.type === "edit_task") return `Rename "${taskName}"`;
  if (action.type === "schedule_task") return `Schedule "${taskName}" at ${formatClock(action.plannedStartMinute)}`;
  return `Move "${taskName}" to Inbox`;
}

export default function Home() {
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [activeDay, setActiveDay] = useState<DayKey>("today");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [quickAddText, setQuickAddText] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const initialSyncDoneRef = useRef(false);

  const todayDate = toLocalDateStr(now);
  const tomorrow = addLocalDays(now, 1);
  const tomorrowDate = toLocalDateStr(tomorrow);
  const currentHour = now.getHours();

  const todayHours = useMemo(
    () => Array.from({ length: 24 - currentHour }, (_, index) => currentHour + index),
    [currentHour]
  );
  const tomorrowHours = useMemo(
    () => Array.from({ length: 24 - TOMORROW_START_HOUR }, (_, index) => TOMORROW_START_HOUR + index),
    []
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } })
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const active = await getActiveIntentions();
      setIntentions(active);
      setLoading(false);

      if (!initialSyncDoneRef.current) {
        initialSyncDoneRef.current = true;
        await Promise.all([syncIntentionsNow(), syncEntriesNow()]);
        setIntentions(await getActiveIntentions());
      }
    } catch (e) {
      console.error("Failed to load tasks:", e);
      setLoading(false);
      showToast("Couldn't load tasks - try reloading");
    }
  }, [showToast]);

  useEffect(() => {
    void loadTasks();
    const handleUpdate = () => void loadTasks();
    window.addEventListener("entry-updated", handleUpdate);
    return () => window.removeEventListener("entry-updated", handleUpdate);
  }, [loadTasks]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const scheduledToday = useMemo(
    () => sortScheduled(intentions.filter((task) => task.plannedDate === todayDate && isValidMinute(task.plannedStartMinute))),
    [intentions, todayDate]
  );
  const scheduledTomorrow = useMemo(
    () => sortScheduled(intentions.filter((task) => task.plannedDate === tomorrowDate && isValidMinute(task.plannedStartMinute))),
    [intentions, tomorrowDate]
  );
  const inboxTasks = useMemo(
    () => sortInbox(intentions.filter((task) => !isScheduled(task, todayDate, tomorrowDate))),
    [intentions, todayDate, tomorrowDate]
  );

  const tasksForActiveDay = activeDay === "today" ? scheduledToday : scheduledTomorrow;
  const activeDate = activeDay === "today" ? todayDate : tomorrowDate;
  const activeHours = activeDay === "today" ? todayHours : tomorrowHours;
  const earlierToday = activeDay === "today"
    ? scheduledToday.filter((task) => (task.plannedStartMinute ?? 0) < currentHour * 60)
    : [];

  const refreshAfterWrite = async () => {
    window.dispatchEvent(new Event("entry-updated"));
    await loadTasks();
  };

  const handleIntentionsParsed = async (parsed: ParsedIntention[]) => {
    const nowTs = Date.now();
    const date = toLocalDateStr(nowTs);
    const maxOrder = intentions.reduce((acc, item) => Math.max(acc, item.order), -1);
    const tasks: Intention[] = parsed
      .map((item, index) => ({
        id: crypto.randomUUID(),
        text: item.text.trim(),
        date,
        completed: false,
        completedAt: null,
        entryId: null,
        order: maxOrder + 1 + index,
        createdAt: nowTs,
        priority: item.priority ?? null,
        timeRequired: item.timeRequired ?? null,
        plannedDate: null,
        plannedStartMinute: null,
        plannedDurationMinutes: null,
        updatedAt: nowTs,
        deleted: false,
        syncedAt: null,
      }))
      .filter((item) => item.text.length > 0);

    if (tasks.length === 0) return;
    await addIntentions(tasks);
    await refreshAfterWrite();
    showToast(`${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} added`);
  };

  const handleQuickAdd = async () => {
    const text = quickAddText.trim();
    if (!text) return;
    const nowTs = Date.now();
    const maxOrder = intentions.reduce((acc, item) => Math.max(acc, item.order), -1);
    await addIntentions([
      {
        id: crypto.randomUUID(),
        text,
        date: toLocalDateStr(nowTs),
        completed: false,
        completedAt: null,
        entryId: null,
        order: maxOrder + 1,
        createdAt: nowTs,
        priority: null,
        timeRequired: null,
        plannedDate: null,
        plannedStartMinute: null,
        plannedDurationMinutes: null,
        updatedAt: nowTs,
        deleted: false,
        syncedAt: null,
      },
    ]);
    setQuickAddText("");
    await refreshAfterWrite();
  };

  const handleComplete = async (id: string) => {
    const task = intentions.find((item) => item.id === id);
    if (!task) return;
    const nowTs = Date.now();
    const entryId = crypto.randomUUID();
    await addEntry({
      id: entryId,
      text: task.text,
      timestamp: nowTs,
      startTime: nowTs,
      endTime: nowTs,
      date: toLocalDateStr(nowTs),
      location: null,
      tags: ["Completed"],
      summary: task.text,
      createdAt: nowTs,
    });
    await updateIntention(id, {
      completed: true,
      completedAt: nowTs,
      entryId,
    });
    setSelectedTaskId((selected) => (selected === id ? null : selected));
    await refreshAfterWrite();
  };

  const handleDelete = async (id: string) => {
    await deleteIntention(id);
    setSelectedTaskId((selected) => (selected === id ? null : selected));
    await refreshAfterWrite();
  };

  const handleTextChange = async (id: string, text: string) => {
    await updateIntention(id, { text });
    await refreshAfterWrite();
  };

  const handlePriorityChange = async (id: string, priority: PriorityLevel | null) => {
    await updateIntention(id, { priority });
    await refreshAfterWrite();
  };

  const handleTimeRequiredChange = async (id: string, timeRequired: TimeRequired | null) => {
    await updateIntention(id, { timeRequired });
    await refreshAfterWrite();
  };

  const scheduleTask = async (
    id: string,
    date: string,
    startMinute: number,
    durationOverride?: number | null
  ) => {
    if (!isAllowedDate(date, todayDate, tomorrowDate) || !isValidMinute(startMinute)) return;
    const task = intentions.find((item) => item.id === id);
    if (!task) return;
    const duration = clampDuration(startMinute, durationOverride ?? durationForEffort(task.timeRequired));
    await updateIntention(id, {
      plannedDate: date,
      plannedStartMinute: startMinute,
      plannedDurationMinutes: duration,
    });
    setSelectedTaskId(null);
    await refreshAfterWrite();
  };

  const handleUnschedule = async (id: string) => {
    await updateIntention(id, {
      plannedDate: null,
      plannedStartMinute: null,
      plannedDurationMinutes: null,
    });
    setSelectedTaskId(null);
    await refreshAfterWrite();
  };

  const handleSendTomorrow = async (id: string) => {
    await scheduleTask(id, tomorrowDate, TOMORROW_START_HOUR * 60);
    setActiveDay("tomorrow");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const taskId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!overId) return;
    if (overId === DROP_ID_INBOX) {
      void handleUnschedule(taskId);
      return;
    }
    const slot = parseSlotId(overId);
    if (!slot) return;
    void scheduleTask(taskId, slot.date, slot.hour * 60);
  };

  const handlePlaceSelected = (date: string, hour: number) => {
    if (!selectedTaskId) return;
    void scheduleTask(selectedTaskId, date, hour * 60);
  };

  const handleApplyPlannerActions = async (actions: PlannerAction[]): Promise<number> => {
    let applied = 0;
    const nowTs = Date.now();
    const knownIds = new Set(intentions.map((task) => task.id));
    const maxOrder = intentions.reduce((acc, item) => Math.max(acc, item.order), -1);
    const created: Intention[] = [];

    for (const action of actions) {
      if (action.type === "create_task") {
        const text = action.text.trim();
        if (!text) continue;
        const plannedDate = isAllowedDate(action.plannedDate, todayDate, tomorrowDate) ? action.plannedDate : null;
        const startMinute = isValidMinute(action.plannedStartMinute) ? action.plannedStartMinute : null;
        const planned = plannedDate !== null && startMinute !== null;
        const duration = planned
          ? clampDuration(
              startMinute,
              isValidDuration(action.plannedDurationMinutes)
                ? action.plannedDurationMinutes
                : durationForEffort(action.timeRequired ?? null)
            )
          : null;
        created.push({
          id: crypto.randomUUID(),
          text,
          date: todayDate,
          completed: false,
          completedAt: null,
          entryId: null,
          order: maxOrder + 1 + created.length,
          createdAt: nowTs,
          priority: action.priority ?? null,
          timeRequired: action.timeRequired ?? null,
          plannedDate,
          plannedStartMinute: planned ? startMinute : null,
          plannedDurationMinutes: duration,
          updatedAt: nowTs,
          deleted: false,
          syncedAt: null,
        });
        applied += 1;
        continue;
      }

      if (action.type === "edit_task") {
        if (!knownIds.has(action.id) || !action.text.trim()) continue;
        await updateIntention(action.id, { text: action.text.trim().slice(0, 140) });
        applied += 1;
        continue;
      }

      if (action.type === "schedule_task") {
        if (!knownIds.has(action.id) || !isAllowedDate(action.plannedDate, todayDate, tomorrowDate)) continue;
        if (!isValidMinute(action.plannedStartMinute)) continue;
        const task = intentions.find((item) => item.id === action.id);
        const duration = clampDuration(
          action.plannedStartMinute,
          isValidDuration(action.plannedDurationMinutes)
            ? action.plannedDurationMinutes
            : durationForEffort(task?.timeRequired ?? null)
        );
        await updateIntention(action.id, {
          plannedDate: action.plannedDate,
          plannedStartMinute: action.plannedStartMinute,
          plannedDurationMinutes: duration,
        });
        applied += 1;
        continue;
      }

      if (action.type === "unschedule_task") {
        if (!knownIds.has(action.id)) continue;
        await updateIntention(action.id, {
          plannedDate: null,
          plannedStartMinute: null,
          plannedDurationMinutes: null,
        });
        applied += 1;
      }
    }

    if (created.length > 0) await addIntentions(created);
    if (applied > 0) await refreshAfterWrite();
    return applied;
  };

  const taskHandlers = {
    selectedTaskId,
    onSelect: (id: string) => setSelectedTaskId((current) => (current === id ? null : id)),
    onComplete: handleComplete,
    onDelete: handleDelete,
    onTextChange: handleTextChange,
    onPriorityChange: handlePriorityChange,
    onTimeRequiredChange: handleTimeRequiredChange,
    onSendTomorrow: handleSendTomorrow,
    onUnschedule: handleUnschedule,
  };

  return (
    <PageShell maxWidth="xl">
      <PageHeader
        eyebrow={formatDateLabel(now)}
        title="Home"
        description="Inbox for loose tasks. Hours for what you actually want to touch next."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MetadataChip tone="accent">{intentions.length} active</MetadataChip>
            {selectedTaskId && <MetadataChip>Tap an hour to place selected task</MetadataChip>}
          </div>
        }
      />

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Panel className="grid gap-4">
            <SectionHeader
              title="Hourly plan"
              description={
                activeDay === "today"
                  ? `Today starts at ${formatClock(currentHour * 60)}.`
                  : `Tomorrow starts at ${formatClock(TOMORROW_START_HOUR * 60)}.`
              }
              actions={
                <SegmentedControl
                  value={activeDay}
                  onChange={setActiveDay}
                  ariaLabel="Planning day"
                  className="w-full grid-cols-2 sm:w-72"
                  options={[
                    { value: "today", label: "Today" },
                    { value: "tomorrow", label: "Tomorrow" },
                  ]}
                />
              }
            />

            {loading ? (
              <EmptyState title="Loading tasks" description="Your hourly plan will appear in a moment." />
            ) : (
              <div className="grid gap-3">
                {earlierToday.length > 0 && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                      Earlier today
                    </p>
                    <div className="mt-2 grid gap-2">
                      {earlierToday.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          selected={selectedTaskId === task.id}
                          scheduled
                          todayDate={todayDate}
                          tomorrowDate={tomorrowDate}
                          {...taskHandlers}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {activeHours.map((hour) => {
                  const slotTasks = tasksForActiveDay.filter((task) => {
                    if (!isValidMinute(task.plannedStartMinute)) return false;
                    if (activeDay === "today" && task.plannedStartMinute < currentHour * 60) return false;
                    return task.plannedStartMinute >= hour * 60 && task.plannedStartMinute < (hour + 1) * 60;
                  });
                  return (
                    <TimelineSlot
                      key={`${activeDate}-${hour}`}
                      date={activeDate}
                      hour={hour}
                      tasks={slotTasks}
                      selectedTaskId={selectedTaskId}
                      todayDate={todayDate}
                      tomorrowDate={tomorrowDate}
                      onPlaceSelected={handlePlaceSelected}
                      taskHandlers={taskHandlers}
                    />
                  );
                })}
              </div>
            )}
          </Panel>

          <div className="grid gap-4">
            <AiPlannerCard
              tasks={intentions}
              todayDate={todayDate}
              tomorrowDate={tomorrowDate}
              onApplyActions={handleApplyPlannerActions}
              showToast={showToast}
            />

            <Panel className="grid gap-4">
              <SectionHeader
                title="Inbox"
                description="Unscheduled active tasks stay here until you place them."
                actions={<Inbox size={20} className="text-[var(--color-accent)]" aria-hidden="true" />}
              />

              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  value={quickAddText}
                  onChange={(event) => setQuickAddText(event.target.value)}
                  placeholder="Quick add..."
                  aria-label="Quick add task"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleQuickAdd();
                    }
                  }}
                />
                <IconButton onClick={() => void handleQuickAdd()} label="Add task" variant="primary">
                  <Plus size={17} aria-hidden="true" />
                </IconButton>
              </div>

              <DropZone
                id={DROP_ID_INBOX}
                className="min-h-28 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                {selectedTaskId && (
                  <Button className="mb-3" variant="secondary" size="sm" onClick={() => void handleUnschedule(selectedTaskId)}>
                    Move selected to Inbox
                  </Button>
                )}
                {loading ? (
                  <EmptyState title="Loading Inbox" className="py-6" />
                ) : inboxTasks.length > 0 ? (
                  <div className="grid gap-2">
                    {inboxTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        selected={selectedTaskId === task.id}
                        scheduled={false}
                        todayDate={todayDate}
                        tomorrowDate={tomorrowDate}
                        {...taskHandlers}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Sparkles size={19} />}
                    title="Inbox is clear"
                    description="New or unscheduled tasks will land here."
                    className="py-7"
                  />
                )}
              </DropZone>
            </Panel>

            <Panel className="grid gap-4">
              <SectionHeader
                title="Brain dump"
                description="Parse messy text into Inbox tasks."
                actions={<Sparkles size={20} className="text-[var(--color-accent)]" aria-hidden="true" />}
              />
              <BrainDumpInput
                onIntentionsParsed={handleIntentionsParsed}
                onClose={() => {}}
                autoFocus={false}
                showClose={false}
              />
            </Panel>
          </div>
        </div>
      </DndContext>

      {toast && <Toast message={toast} />}
    </PageShell>
  );
}
