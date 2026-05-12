"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import EntryInput from "@/components/EntryInput";
import TaDaTimeline from "@/components/TaDaTimeline";
import DailySummary from "@/components/DailySummary";
import WeekTeaser from "@/components/WeekTeaser";
import ReflectionPrompt from "@/components/ReflectionPrompt";
import MilestoneCelebration from "@/components/MilestoneCelebration";
import EntryEditSheet from "@/components/EntryEditSheet";
import BrainDumpInput from "@/components/BrainDumpInput";
import EmptyHome from "@/components/EmptyHome";
import ActiveTimerCard from "@/components/ActiveTimerCard";
import PomodoroCard from "@/components/PomodoroCard";
import PomodoroSheet from "@/components/PomodoroSheet";
import HabitsCard from "@/components/HabitsCard";
import HomeTabs, { type HomeTab } from "@/components/home/HomeTabs";
import BucketGrid from "@/components/home/BucketGrid";
import EnergyView from "@/components/home/EnergyView";
import MiniSidebar from "@/components/home/MiniSidebar";
import Toast from "@/components/Toast";
import {
  getEntriesByDate,
  updateEntry,
  deleteEntry,
  addEntry,
  getSettings,
  saveSettings,
  getActiveIntentions,
  addIntentions,
  updateIntention,
  deleteIntention,
  toLocalDateStr,
  markEntryPendingDelete,
  unmarkEntryPendingDelete,
  type Entry,
  type Intention,
  type EnergyLevel,
} from "@/lib/db";
import { categorizeEntry, type ParsedIntention } from "@/lib/gemini";
import { useCategories } from "@/lib/useCategories";
import { useIntentionCategories } from "@/lib/useIntentionCategories";
import { getCategoryNames } from "@/lib/categories";
import { getStreakInfo, getMilestone, type StreakInfo, type MilestoneInfo } from "@/lib/streaks";
import { syncIntentionsNow } from "@/lib/intentionsSync";
import { syncCategoriesNow } from "@/lib/categoriesSync";
import { syncHabitsNow } from "@/lib/habitsSync";
import { supabase } from "@/lib/supabase";
import { getPomodoroState, POMODORO_EVENT } from "@/lib/pomodoro";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 17) return "Good afternoon.";
  return "Good evening.";
}

function formatTodayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function Home() {
  const categories = useCategories();
  const intentionCategories = useIntentionCategories();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [milestoneToShow, setMilestoneToShow] = useState<MilestoneInfo | null>(null);
  const [activeInput, setActiveInput] = useState<"none" | "log" | "plan">("none");
  const [pomodoroSheetOpen, setPomodoroSheetOpen] = useState(false);
  const [hasPomodoro, setHasPomodoro] = useState(false);
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [recentTaDaIds, setRecentTaDaIds] = useState<Set<string>>(new Set());
  const [homeTab, setHomeTab] = useState<HomeTab>("life");
  const toastTimeout = useRef<NodeJS.Timeout>(undefined);
  const deleteTimeout = useRef<NodeJS.Timeout>(undefined);
  // First-mount sync gate so the backlog reflects converged remote state on
  // load (intentions added on another device show up immediately).
  const initialSyncDoneRef = useRef(false);
  const today = toLocalDateStr(new Date());

  const loadData = useCallback(async () => {
    try {
      const [todayEntries, streakInfo, settings, activeIntentions] = await Promise.all([
        getEntriesByDate(today),
        getStreakInfo(),
        getSettings(),
        getActiveIntentions(),
      ]);
      setEntries(todayEntries);
      setStreak(streakInfo);
      setIntentions(activeIntentions);

      const milestone = getMilestone(streakInfo);
      if (milestone) {
        const key = String(milestone.milestone);
        if (settings.lastSeenMilestone !== key) {
          setMilestoneToShow(milestone);
          await saveSettings({ lastSeenMilestone: key });
        }
      }

      // Wait once per session for sync to converge so a brain-dump performed
      // on another device is visible in the backlog immediately.
      if (!initialSyncDoneRef.current) {
        initialSyncDoneRef.current = true;
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user?.id) {
          await Promise.all([syncIntentionsNow(), syncCategoriesNow(), syncHabitsNow()]);
          const refreshed = await getActiveIntentions();
          setIntentions(refreshed);
        }
      }
    } catch (e) {
      console.error("Failed to load data:", e);
      setStreak({ currentStreak: 0, longestStreak: 0, totalDays: 0, hasLoggedToday: false });
      setToast({ message: "Couldn't load today's data — try reloading" });
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      toastTimeout.current = setTimeout(() => setToast(null), 4000);
    }
  }, [today]);

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener("entry-updated", handleUpdate);
    return () => window.removeEventListener("entry-updated", handleUpdate);
  }, [loadData]);

  useEffect(() => {
    const sync = () => setHasPomodoro(getPomodoroState() != null);
    sync();
    window.addEventListener(POMODORO_EVENT, sync);
    return () => window.removeEventListener(POMODORO_EVENT, sync);
  }, []);

  const activeEntry = entries.find((e) => e.endTime === 0);
  const tadaEntries = entries.filter((e) => e.id !== activeEntry?.id);

  const handleSave = async (_updated: Entry) => {
    setSelectedEntry(null);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    const entryToDelete = entries.find((e) => e.id === id);
    setSelectedEntry(null);

    setEntries((prev) => prev.filter((e) => e.id !== id));
    markEntryPendingDelete(id);

    if (deleteTimeout.current) clearTimeout(deleteTimeout.current);
    deleteTimeout.current = setTimeout(async () => {
      await deleteEntry(id);
      window.dispatchEvent(new Event("entry-updated"));
      setToast(null);
    }, 5000);

    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({
      message: "Entry deleted",
      undo: entryToDelete
        ? () => {
            if (deleteTimeout.current) clearTimeout(deleteTimeout.current);
            unmarkEntryPendingDelete(id);
            setEntries((prev) =>
              [...prev, entryToDelete].sort(
                (a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp)
              )
            );
            setToast(null);
          }
        : undefined,
    });
    toastTimeout.current = setTimeout(() => setToast(null), 5000);
  };

  const handleFinishActive = async () => {
    if (!activeEntry) return;
    await updateEntry(activeEntry.id, { endTime: Date.now() });
    await loadData();
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleIntentionsParsed = async (parsed: ParsedIntention[]) => {
    const now = Date.now();
    const todayDate = toLocalDateStr(now);
    // Append to the end of the backlog: bump `order` past the largest existing
    // value so newly added rows don't visually jump above older ones until the
    // user reorders.
    const maxOrder = intentions.reduce((acc, i) => Math.max(acc, i.order), -1);

    const newIntentions: Intention[] = parsed.map((p, i) => ({
      id: crypto.randomUUID(),
      text: p.text,
      date: todayDate,
      completed: false,
      completedAt: null,
      entryId: null,
      order: maxOrder + 1 + i,
      createdAt: now,
      categoryId: p.categoryId ?? null,
      energy: p.energy ?? null,
      updatedAt: now,
      deleted: false,
      syncedAt: null,
    }));

    await addIntentions(newIntentions);
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleIntentionDelete = async (id: string) => {
    await deleteIntention(id);
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleIntentionCategoryChange = async (id: string, categoryId: string | null) => {
    await updateIntention(id, { categoryId });
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleIntentionEnergyChange = async (id: string, energy: EnergyLevel | null) => {
    await updateIntention(id, { energy });
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleIntentionTextChange = async (id: string, text: string) => {
    await updateIntention(id, { text });
    window.dispatchEvent(new Event("entry-updated"));
  };

  // Keyboard shortcuts: ⌘K log, ⌘⇧K plan, Esc collapse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modalOpen = !!selectedEntry || !!milestoneToShow;
      if (modalOpen) return;

      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActiveInput(e.shiftKey ? "plan" : "log");
        return;
      }
      if (e.key === "Escape" && activeInput !== "none") {
        e.preventDefault();
        setActiveInput("none");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeInput, selectedEntry, milestoneToShow]);

  const handleIntentionComplete = async (
    id: string,
    note: string,
    startTime: number,
    endTime: number,
    userEnergy?: EnergyLevel | null
  ) => {
    const intention = intentions.find((i) => i.id === id);
    if (!intention) return;

    const now = Date.now();
    const dateStr = toLocalDateStr(startTime);
    const isBackdated = dateStr !== toLocalDateStr(now);

    const result = await categorizeEntry(
      intention.text,
      getCategoryNames(categories),
      isBackdated ? { referenceDate: dateStr } : undefined
    );
    const tags = result.tags;
    const summary = result.summary || intention.text;
    // Prefer the user's pick at completion; fall back to the intention's
    // brain-dump-time energy; only consult the fresh AI guess as a last resort.
    const energy = userEnergy ?? intention.energy ?? result.energy;

    const entryId = crypto.randomUUID();
    await addEntry({
      id: entryId,
      text: note || intention.text,
      timestamp: now,
      startTime,
      endTime,
      date: dateStr,
      location: null,
      tags,
      energy,
      summary,
      createdAt: now,
    });

    await updateIntention(id, {
      completed: true,
      completedAt: now,
      entryId,
    });

    setRecentTaDaIds((prev) => new Set(prev).add(entryId));
    setTimeout(() => {
      setRecentTaDaIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }, 1500);

    window.dispatchEvent(new Event("entry-updated"));
  };

  const hasInsights = entries.length > 0;
  const hasBacklog = intentions.length > 0;

  return (
    <>
      {/* Two-column layout on desktop:
          - main column hosts the bucket grid (or energy view), TaDa list, and
            mobile-only insights;
          - 360px right rail composes streak + mini insights.
          On mobile, the rail is hidden and insights collapse into the main flow. */}
      <div className="flex flex-col gap-4 pb-dock lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-6 lg:items-start">
        {/* ── Centerpiece ── */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <HomeTabs value={homeTab} onChange={setHomeTab} dateLabel={formatTodayLabel()} />
          <p className="text-sm text-[var(--color-text-muted)] -mt-2">{getGreeting()}</p>

          {hasBacklog ? (
            homeTab === "life" ? (
              <BucketGrid
                intentions={intentions}
                intentionCategories={intentionCategories}
                onComplete={handleIntentionComplete}
                onDelete={handleIntentionDelete}
                onCategoryChange={handleIntentionCategoryChange}
                onEnergyChange={handleIntentionEnergyChange}
                onTextChange={handleIntentionTextChange}
              />
            ) : (
              <EnergyView
                intentions={intentions}
                intentionCategories={intentionCategories}
                onComplete={handleIntentionComplete}
                onDelete={handleIntentionDelete}
                onCategoryChange={handleIntentionCategoryChange}
                onTextChange={handleIntentionTextChange}
                onEnergyChange={handleIntentionEnergyChange}
              />
            )
          ) : streak ? (
            <EmptyHome totalDays={streak.totalDays} currentStreak={streak.currentStreak} />
          ) : null}

          {/* Daily habit tracker — always visible regardless of home tab. */}
          <HabitsCard />

          {/* Active timer is shown inline on mobile; on desktop it lives in the
              sidebar so the centerpiece stays focused on the backlog. When a
              Pomodoro is running it takes over the slot with a countdown. */}
          {hasPomodoro ? (
            <PomodoroCard className="lg:hidden" />
          ) : activeEntry ? (
            <ActiveTimerCard
              activeEntry={activeEntry}
              onFinish={handleFinishActive}
              className="lg:hidden"
            />
          ) : null}

          {tadaEntries.length > 0 && (
            <TaDaTimeline
              entries={tadaEntries}
              categories={categories}
              onTap={setSelectedEntry}
              highlightIds={recentTaDaIds}
            />
          )}

          {/* Mobile-only insights. Desktop shows the compact versions in the rail. */}
          <div className="lg:hidden flex flex-col gap-3">
            {hasInsights && <DailySummary entries={entries} categories={categories} />}
            <WeekTeaser />
            <ReflectionPrompt entries={entries} />
          </div>
        </div>

        {/* ── Desktop right rail ── */}
        <aside className="hidden lg:block lg:sticky lg:top-4">
          <MiniSidebar
            activeEntry={activeEntry}
            onFinishActive={handleFinishActive}
            entries={entries}
            categories={categories}
            streak={streak}
            hasPomodoro={hasPomodoro}
          />
          <div className="mt-3">
            <ReflectionPrompt entries={entries} />
          </div>
        </aside>
      </div>

      {/* ── Pinned input dock (fixed above navbar, lifts above keyboard on mobile) ── */}
      <div
        className="fixed left-0 right-0 z-40 pointer-events-none"
        style={{
          bottom: "max(calc(var(--nav-clearance) + 0.5rem), calc(var(--kb, 0px) + 0.5rem))",
        }}
      >
        <div className="max-w-lg mx-auto px-4 pointer-events-auto">
          <div
            className={`glass-panel rounded-2xl shadow-2xl border border-[var(--glass-border)] overflow-hidden ${
              activeInput !== "none" ? "p-4" : "p-1.5"
            }`}
          >
            {activeInput === "log" ? (
              <div className="animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Quick log
                  </span>
                  <button
                    onClick={() => setActiveInput("none")}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-text)]/5 active:scale-90 transition-all"
                    aria-label="Collapse input"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 15l-7-7-7 7" />
                    </svg>
                  </button>
                </div>
                <EntryInput onEntryAdded={() => {
                  loadData();
                  setActiveInput("none");
                }} />
              </div>
            ) : activeInput === "plan" ? (
              <div className="animate-fade-in">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Brain-dump anything...
                  </span>
                  <button
                    onClick={() => setActiveInput("none")}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-text)]/5 active:scale-90 transition-all"
                    aria-label="Collapse input"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 15l-7-7-7 7" />
                    </svg>
                  </button>
                </div>
                <BrainDumpInput
                  onIntentionsParsed={handleIntentionsParsed}
                  onClose={() => setActiveInput("none")}
                  intentionCategories={intentionCategories}
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveInput("log")}
                  className="flex-1 flex items-center gap-3 py-3 px-3 rounded-xl bg-[var(--color-bg)]/80 hover:bg-[var(--color-bg)] border border-[var(--color-border)] shadow-sm active:scale-[0.98] transition-all group"
                >
                  <div className="w-9 h-9 rounded-full bg-[var(--color-accent)] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[var(--color-accent)]/20 group-hover:scale-105 transition-transform">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-bold text-[var(--color-text)] leading-tight">Log Activity</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-medium mt-0.5">
                      Doing or Done
                      <span className="hidden lg:inline ml-1.5 opacity-70">⌘K</span>
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveInput("plan")}
                  className="flex-1 flex items-center gap-3 py-3 px-3 rounded-xl bg-[var(--color-bg)]/80 hover:bg-[var(--color-bg)] border border-[var(--color-border)] shadow-sm active:scale-[0.98] transition-all group"
                >
                  <div className="w-9 h-9 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform dark:bg-indigo-400/10 dark:text-indigo-400 dark:border-indigo-400/20">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 6h13" />
                      <path d="M8 12h13" />
                      <path d="M8 18h13" />
                      <path d="M3 6h.01" />
                      <path d="M3 12h.01" />
                      <path d="M3 18h.01" />
                    </svg>
                  </div>
                  <div className="flex flex-col text-left relative pr-2">
                    <span className="text-sm font-bold text-[var(--color-text)] leading-tight">Brain Dump</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-medium mt-0.5">
                      Add to backlog
                      <span className="hidden lg:inline ml-1.5 opacity-70">⌘⇧K</span>
                    </span>
                    <span className="absolute -top-1 right-0 text-[10px] text-indigo-500">&#x2728;</span>
                  </div>
                </button>

                <button
                  onClick={() => setPomodoroSheetOpen(true)}
                  aria-label="Start a focus session"
                  className="flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-bg)]/80 hover:bg-[var(--color-bg)] border border-[var(--color-border)] shadow-sm active:scale-[0.98] transition-all group flex-shrink-0"
                >
                  <div className="w-9 h-9 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform dark:bg-rose-400/10 dark:text-rose-400 dark:border-rose-400/20">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2 2" />
                      <path d="M9 2h6" />
                    </svg>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Overlays ── */}

      <EntryEditSheet
        entry={selectedEntry}
        categories={categories}
        onClose={() => setSelectedEntry(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <PomodoroSheet
        open={pomodoroSheetOpen}
        onClose={() => setPomodoroSheetOpen(false)}
        hasActiveTimer={!!activeEntry && !hasPomodoro}
      />

      {toast && (
        <Toast
          message={toast.message}
          action={toast.undo ? { label: "Undo", onClick: toast.undo } : undefined}
        />
      )}

      {milestoneToShow && (
        <MilestoneCelebration
          milestone={milestoneToShow}
          onDismiss={() => setMilestoneToShow(null)}
        />
      )}
    </>
  );
}
