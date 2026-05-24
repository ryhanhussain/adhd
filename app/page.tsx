"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import BrainDumpInput from "@/components/BrainDumpInput";
import TaskList, { type TaskSortMode } from "@/components/tasks/TaskList";
import Toast from "@/components/Toast";
import { MetadataChip, PageHeader, PageShell, Panel, SectionHeader } from "@/components/ui/primitives";
import {
  addEntry,
  addIntentions,
  deleteIntention,
  getActiveIntentions,
  toLocalDateStr,
  updateIntention,
  type Intention,
  type PriorityLevel,
  type TimeRequired,
} from "@/lib/db";
import type { ParsedIntention } from "@/lib/gemini";
import { syncEntriesNow } from "@/lib/entriesSync";
import { syncIntentionsNow } from "@/lib/intentionsSync";

const INITIAL_VISIBLE_COUNT = 5;

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function urgencyRank(priority: Intention["priority"], mode: Extract<TaskSortMode, "urgency-desc" | "urgency-asc">): number {
  if (!priority) return 3;

  if (mode === "urgency-desc") {
    if (priority === "high") return 0;
    if (priority === "medium") return 1;
    return 2;
  }

  if (priority === "low") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function timeRank(timeRequired: Intention["timeRequired"], mode: Extract<TaskSortMode, "time-asc" | "time-desc">): number {
  if (!timeRequired) return 3;

  if (mode === "time-asc") {
    if (timeRequired === "quick") return 0;
    if (timeRequired === "medium") return 1;
    return 2;
  }

  if (timeRequired === "long") return 0;
  if (timeRequired === "medium") return 1;
  return 2;
}

function sortTasks(tasks: Intention[], mode: TaskSortMode): Intention[] {
  return [...tasks].sort((a, b) => {
    if (mode === "urgency-desc" || mode === "urgency-asc") {
      const byUrgency = urgencyRank(a.priority, mode) - urgencyRank(b.priority, mode);
      if (byUrgency !== 0) return byUrgency;
    }
    if (mode === "time-asc" || mode === "time-desc") {
      const byTime = timeRank(a.timeRequired, mode) - timeRank(b.timeRequired, mode);
      if (byTime !== 0) return byTime;
    }
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
  });
}

export default function Home() {
  const router = useRouter();
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<TaskSortMode>("urgency-desc");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const initialSyncDoneRef = useRef(false);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

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
  }, []);

  useEffect(() => {
    void loadTasks();
    const handleUpdate = () => void loadTasks();
    window.addEventListener("entry-updated", handleUpdate);
    return () => window.removeEventListener("entry-updated", handleUpdate);
  }, [loadTasks]);

  const sortedTasks = useMemo(() => sortTasks(intentions, sortMode), [intentions, sortMode]);
  const visibleTasks = expanded ? sortedTasks : sortedTasks.slice(0, INITIAL_VISIBLE_COUNT);

  const handleIntentionsParsed = async (parsed: ParsedIntention[]) => {
    const now = Date.now();
    const date = toLocalDateStr(now);
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
        createdAt: now,
        priority: item.priority ?? null,
        timeRequired: item.timeRequired ?? null,
        updatedAt: now,
        deleted: false,
        syncedAt: null,
      }))
      .filter((item) => item.text.length > 0);

    if (tasks.length === 0) return;
    await addIntentions(tasks);
    window.dispatchEvent(new Event("entry-updated"));
    showToast(`${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} added`);
  };

  const handleComplete = async (id: string) => {
    const task = intentions.find((item) => item.id === id);
    if (!task) return;
    const now = Date.now();
    const entryId = crypto.randomUUID();
    await addEntry({
      id: entryId,
      text: task.text,
      timestamp: now,
      startTime: now,
      endTime: now,
      date: toLocalDateStr(now),
      location: null,
      tags: ["Completed"],
      summary: task.text,
      createdAt: now,
    });
    await updateIntention(id, {
      completed: true,
      completedAt: now,
      entryId,
    });
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleDelete = async (id: string) => {
    await deleteIntention(id);
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleTextChange = async (id: string, text: string) => {
    await updateIntention(id, { text });
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handlePriorityChange = async (id: string, priority: PriorityLevel | null) => {
    await updateIntention(id, { priority });
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleTimeRequiredChange = async (id: string, timeRequired: TimeRequired | null) => {
    await updateIntention(id, { timeRequired });
    window.dispatchEvent(new Event("entry-updated"));
  };

  return (
    <PageShell maxWidth="lg">
      <PageHeader
        eyebrow={formatToday()}
        title="Home"
        description="Capture first, sort later."
        actions={
          intentions.length > 0 ? (
            <MetadataChip tone="accent">{intentions.length} active</MetadataChip>
          ) : undefined
        }
      />

      <Panel className="grid gap-4">
        <SectionHeader
          title="Capture"
          description="Loose tasks go here."
          actions={<Sparkles size={20} className="text-[var(--color-accent)]" aria-hidden="true" />}
        />
        <BrainDumpInput
          onIntentionsParsed={handleIntentionsParsed}
          onClose={() => {}}
          autoFocus={false}
          showClose={false}
        />
      </Panel>

      <TaskList
        tasks={sortedTasks}
        visibleTasks={visibleTasks}
        expanded={expanded}
        sortMode={sortMode}
        loading={loading}
        onExpandedChange={setExpanded}
        onSortModeChange={setSortMode}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onStartFocus={(id) => router.push(`/focus?task=${encodeURIComponent(id)}`)}
        onTextChange={handleTextChange}
        onPriorityChange={handlePriorityChange}
        onTimeRequiredChange={handleTimeRequiredChange}
      />

      {toast && <Toast message={toast} />}
    </PageShell>
  );
}
