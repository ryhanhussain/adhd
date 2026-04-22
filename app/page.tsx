"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import EntryInput from "@/components/EntryInput";
import TaDaTimeline from "@/components/TaDaTimeline";
import DailySummary from "@/components/DailySummary";
import WeeklyInsights from "@/components/WeeklyInsights";
import ReflectionPrompt from "@/components/ReflectionPrompt";
import MilestoneCelebration from "@/components/MilestoneCelebration";
import EntryEditSheet from "@/components/EntryEditSheet";
import CheckInGarden from "@/components/CheckInGarden";
import IntentionsCard from "@/components/IntentionsCard";
import BrainDumpInput from "@/components/BrainDumpInput";
import CarryoverPrompt from "@/components/CarryoverPrompt";
import { getEntriesByDate, updateEntry, deleteEntry, addEntry, getSettings, saveSettings, getIntentionsByDate, getPendingIntentionsByDate, archiveIntentions, addIntentions, updateIntention, deleteIntention, toLocalDateStr, markEntryPendingDelete, unmarkEntryPendingDelete, type Entry, type Intention } from "@/lib/db";
import { categorizeEntry, type ParsedIntention } from "@/lib/gemini";
import { useCategories } from "@/lib/useCategories";
import { useIntentionCategories } from "@/lib/useIntentionCategories";
import { getCategoryNames } from "@/lib/categories";
import { getStreakInfo, getMilestone, type StreakInfo, type MilestoneInfo } from "@/lib/streaks";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 17) return "Good afternoon.";
  return "Good evening.";
}

function formatElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function Home() {
  const categories = useCategories();
  const intentionCategories = useIntentionCategories();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [now, setNow] = useState(Date.now());
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [milestoneToShow, setMilestoneToShow] = useState<MilestoneInfo | null>(null);
  const [activeInput, setActiveInput] = useState<"none" | "log" | "plan">("none");
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [carryoverItems, setCarryoverItems] = useState<Intention[]>([]);
  const [recentTaDaIds, setRecentTaDaIds] = useState<Set<string>>(new Set());
  const toastTimeout = useRef<NodeJS.Timeout>(undefined);
  const deleteTimeout = useRef<NodeJS.Timeout>(undefined);
  const today = toLocalDateStr(new Date());

  const loadData = useCallback(async () => {
    try {
      const [todayEntries, streakInfo, settings, todayIntentions] = await Promise.all([
        getEntriesByDate(today),
        getStreakInfo(),
        getSettings(),
        getIntentionsByDate(today),
      ]);
      setEntries(todayEntries);
      setStreak(streakInfo);
      setIntentions(todayIntentions);

      // Check for milestone
      const milestone = getMilestone(streakInfo);
      if (milestone) {
        const key = String(milestone.milestone);
        if (settings.lastSeenMilestone !== key) {
          setMilestoneToShow(milestone);
          await saveSettings({ lastSeenMilestone: key });
        }
      }

      // First Home visit of the day: offer to carry over yesterday's pending intentions,
      // and auto-archive anything older than yesterday that's still pending.
      if (settings.lastCarryoverPromptDate !== today) {
        const yesterday = toLocalDateStr(new Date(Date.now() - 864e5));
        const pendingYesterday = await getPendingIntentionsByDate(yesterday);

        // Auto-archive anything pending from 2+ days ago (up to 7 days back, for cleanup).
        const staleIds: string[] = [];
        for (let days = 2; days <= 7; days++) {
          const d = toLocalDateStr(new Date(Date.now() - days * 864e5));
          const stale = await getPendingIntentionsByDate(d);
          for (const s of stale) staleIds.push(s.id);
        }
        if (staleIds.length > 0) await archiveIntentions(staleIds);

        if (pendingYesterday.length > 0) {
          setCarryoverItems(pendingYesterday);
        } else {
          // No prompt needed — still record that we checked today.
          await saveSettings({ lastCarryoverPromptDate: today });
        }
      }
    } catch (e) {
      console.error("Failed to load data:", e);
      setStreak({ currentStreak: 0, longestStreak: 0, totalDays: 0, hasLoggedToday: false });
    }
  }, [today]);

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener("entry-updated", handleUpdate);
    return () => window.removeEventListener("entry-updated", handleUpdate);
  }, [loadData]);

  // Find active entry (endTime === 0 means timer is running)
  const activeEntry = entries.find((e) => e.endTime === 0);

  useEffect(() => {
    const ms = activeEntry ? 1000 : 30000;
    const interval = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(interval);
  }, [activeEntry]);

  // All completed entries for the Ta-Da timeline (excluding active)
  const tadaEntries = entries.filter((e) => e.id !== activeEntry?.id);

  const handleSave = async (updated: Entry) => {
    setSelectedEntry(null);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    const entryToDelete = entries.find((e) => e.id === id);
    setSelectedEntry(null);

    // Remove from UI immediately
    setEntries((prev) => prev.filter((e) => e.id !== id));
    markEntryPendingDelete(id);

    // Schedule actual delete after 5 seconds
    if (deleteTimeout.current) clearTimeout(deleteTimeout.current);
    deleteTimeout.current = setTimeout(async () => {
      await deleteEntry(id);
      window.dispatchEvent(new Event("entry-updated"));
      setToast(null);
    }, 5000);

    // Show undo toast
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
    const dateStr = toLocalDateStr(now);
    const existing = await getIntentionsByDate(dateStr);
    const orderOffset = existing.length;

    const newIntentions: Intention[] = parsed.map((p, i) => ({
      id: crypto.randomUUID(),
      text: p.text,
      date: dateStr,
      completed: false,
      completedAt: null,
      entryId: null,
      order: orderOffset + i,
      createdAt: now,
      categoryId: p.categoryId ?? null,
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

  const handleIntentionTextChange = async (id: string, text: string) => {
    await updateIntention(id, { text });
    window.dispatchEvent(new Event("entry-updated"));
  };

  // Keyboard shortcuts: ⌘K log, ⌘⇧K plan, Esc collapse. Modals short-circuit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modalOpen =
        carryoverItems.length > 0 || !!selectedEntry || !!milestoneToShow;
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
  }, [activeInput, carryoverItems.length, selectedEntry, milestoneToShow]);

  const handleIntentionComplete = async (id: string, note: string, startTime: number, endTime: number) => {
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
    const energy = result.energy;

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

    // Track this entry for the "just landed" highlight in TaDa list
    setRecentTaDaIds((prev) => new Set(prev).add(entryId));
    // Clear highlight after animation completes
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

  return (
    <>
      {/* Scrollable content — padded at bottom to clear the pinned input dock.
          At lg: 2-col grid, action-left / insights-right; source order matches mobile. */}
      <div className="flex flex-col gap-3 pb-dock lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-6 lg:gap-y-3 lg:items-start">
        {/* ── Header card: greeting + garden anchored together ── */}
        <div className="lg:col-start-1 glass-panel rounded-2xl p-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{getGreeting()}</h1>
            {entries.length > 0 && (
              <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
                {entries.length} {entries.length === 1 ? "entry" : "entries"} today
              </p>
            )}
          </div>
          <CheckInGarden hasLoggedToday={streak?.hasLoggedToday ?? false} />
        </div>

        {/* ── Daily Intentions (top priority position) ── */}
        {intentions.length > 0 && (
          <div className="lg:col-start-1 relative z-10">
            <IntentionsCard
              intentions={intentions}
              onComplete={handleIntentionComplete}
              onDelete={handleIntentionDelete}
              intentionCategories={intentionCategories}
              onCategoryChange={handleIntentionCategoryChange}
              onTextChange={handleIntentionTextChange}
            />
          </div>
        )}

        {/* ── Active entry ── */}
        {activeEntry && (
          <div
            className="lg:col-start-1 rounded-xl p-4 border-2 border-[var(--color-accent)] animate-fade-in animate-breathe"
            style={{ backgroundColor: "var(--color-accent-soft)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-now-pulse" />
                <span className="text-xs font-semibold text-[var(--color-accent)]">Active now</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-[var(--color-accent)]">
                {formatElapsed(now - activeEntry.startTime)}
              </span>
            </div>
            <p className="text-sm mb-3">{activeEntry.summary || activeEntry.text}</p>
            <button
              onClick={handleFinishActive}
              className="w-full h-11 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium active:scale-[0.98] transition-transform"
            >
              Just Finished
            </button>
          </div>
        )}

        {/* ── Empty state ── */}
        {entries.length === 0 && intentions.length === 0 && streak && (
          <div className="lg:col-start-2 text-center py-6 animate-fade-in">
            {streak.totalDays === 0 ? (
              <>
                <p className="text-lg font-semibold mb-1">Welcome to ADDit</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Just type what you&apos;re doing — we&apos;ll handle the rest.
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                {streak.currentStreak > 0
                  ? `Your streak is at ${streak.currentStreak}! Keep it going with a quick log.`
                  : "New day, clean slate. What are you up to?"}
              </p>
            )}
          </div>
        )}

        {/* ── Today's Ta-Da List ── */}
        {tadaEntries.length > 0 && (
          <div className="lg:col-start-2 lg:row-start-1">
            <TaDaTimeline
              entries={tadaEntries}
              categories={categories}
              onTap={setSelectedEntry}
              highlightIds={recentTaDaIds}
            />
          </div>
        )}

        {/* ── Insights section: daily + weekly grouped ── */}
        {hasInsights && (
          <section className="lg:col-start-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 px-1">
              Insights
            </h2>
            <div className="flex flex-col gap-3">
              <DailySummary entries={entries} categories={categories} />
              <WeeklyInsights categories={categories} />
            </div>
          </section>
        )}

        {/* Show weekly insights even with no entries today (it covers the whole week) */}
        {!hasInsights && (
          <div className="lg:col-start-2">
            <WeeklyInsights categories={categories} />
          </div>
        )}

        {/* ── End-of-day reflection ── */}
        <div className="lg:col-start-2">
          <ReflectionPrompt entries={entries} />
        </div>
      </div>

      {/* ── Pinned input dock (fixed above navbar, lifts above keyboard on mobile) ── */}
      <div
        className="fixed left-0 right-0 z-40 pointer-events-none"
        style={{
          bottom:
            "max(calc(var(--nav-clearance) + 0.5rem), calc(var(--kb, 0px) + 0.5rem))",
        }}
      >
        <div className="max-w-lg mx-auto px-4 pointer-events-auto">
          <div
            className={`glass-panel rounded-2xl shadow-2xl border border-[var(--glass-border)] overflow-hidden ${activeInput !== "none" ? "p-4" : "p-1.5"
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
                    Brain-dump your day...
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
                    <span className="text-sm font-bold text-[var(--color-text)] leading-tight">Plan Day</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-medium mt-0.5">
                      To-Do List
                      <span className="hidden lg:inline ml-1.5 opacity-70">⌘⇧K</span>
                    </span>
                    <span className="absolute -top-1 right-0 text-[10px] text-indigo-500">&#x2728;</span>
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

      {toast && (
        <div className="fixed above-dock left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-5 py-2.5 rounded-full bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium shadow-lg animate-toast-in">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={toast.undo}
              className="font-bold underline underline-offset-2"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {milestoneToShow && (
        <MilestoneCelebration
          milestone={milestoneToShow}
          onDismiss={() => setMilestoneToShow(null)}
        />
      )}

      {carryoverItems.length > 0 && (
        <CarryoverPrompt
          items={carryoverItems}
          intentionCategories={intentionCategories}
          onCategoryChange={handleIntentionCategoryChange}
          onDone={async () => {
            setCarryoverItems([]);
            await saveSettings({ lastCarryoverPromptDate: today });
            await loadData();
          }}
        />
      )}
    </>
  );
}
