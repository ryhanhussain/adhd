"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import TaDaTimeline from "@/components/TaDaTimeline";
import DailySummary from "@/components/DailySummary";
import WeekTeaser from "@/components/WeekTeaser";
import ReflectionPrompt from "@/components/ReflectionPrompt";
import MilestoneCelebration from "@/components/MilestoneCelebration";
import EntryEditSheet from "@/components/EntryEditSheet";
import BrainDumpInput from "@/components/BrainDumpInput";
import EmptyHome from "@/components/EmptyHome";
import HabitsCard from "@/components/HabitsCard";
import HomeTabs, { type HomeTab } from "@/components/home/HomeTabs";
import MiniSidebar from "@/components/home/MiniSidebar";
import NowNextZone from "@/components/home/NowNextZone";
import BrainDumpVault from "@/components/home/BrainDumpVault";
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
  archiveIntentions,
  clearNowNextRank,
  toLocalDateStr,
  markEntryPendingDelete,
  setNowNextRank,
  swapNowNextRanks,
  unmarkEntryPendingDelete,
  addLifeArea,
  type Entry,
  type Intention,
  type EnergyLevel,
  type NowNextRank,
} from "@/lib/db";
import { categorizeEntry, type ParsedIntention } from "@/lib/gemini";
import { useCategories } from "@/lib/useCategories";
import { useIntentionCategories } from "@/lib/useIntentionCategories";
import { useLifeAreas } from "@/lib/useLifeAreas";
import { usePersonalValues } from "@/lib/usePersonalValues";
import { COLOR_OPTIONS, getCategoryNames } from "@/lib/categories";
import { getStreakInfo, getMilestone, type StreakInfo, type MilestoneInfo } from "@/lib/streaks";
import { syncIntentionsNow } from "@/lib/intentionsSync";
import { syncCategoriesNow } from "@/lib/categoriesSync";
import { syncHabitsNow } from "@/lib/habitsSync";
import { syncLifeAreasNow } from "@/lib/lifeAreasSync";
import { supabase } from "@/lib/supabase";
import { getPomodoroState, POMODORO_EVENT } from "@/lib/pomodoro";
import type { Habit } from "@/lib/db";
import { toggleHabitCompletion } from "@/lib/db";
import {
  LIFE_AREA_STARTERS,
  SUGGESTED_LIFE_AREAS,
  activeLifeAreas,
  getLifeAreaById,
  type LifeArea,
} from "@/lib/lifeAreas";
import {
  MAX_PERSONAL_VALUES,
  MIN_PERSONAL_VALUES,
  VALUE_OPTIONS,
  getCoreValueLabel,
  getPersonalValueById,
  serializePersonalValues,
  suggestedValueIdsForLifeArea,
  type PersonalValueId,
} from "@/lib/values";
import { buildTaskWhyChain, normalizeWhyChain } from "@/lib/why";

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

function formatOverline(d: Date): string {
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  return `Today · ${weekday}`;
}

function formatHeadline(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export default function Home() {
  const router = useRouter();
  const categories = useCategories();
  const intentionCategories = useIntentionCategories();
  const lifeAreas = useLifeAreas();
  const personalValues = usePersonalValues();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [milestoneToShow, setMilestoneToShow] = useState<MilestoneInfo | null>(null);
  const [activeInput, setActiveInput] = useState<"none" | "plan">("none");
  const [hasPomodoro, setHasPomodoro] = useState(false);
  const [focusedIntentionId, setFocusedIntentionId] = useState<string | null>(null);
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [recentTaDaIds, setRecentTaDaIds] = useState<Set<string>>(new Set());
  const [homeTab, setHomeTab] = useState<HomeTab>("life");
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultTargetRank, setVaultTargetRank] = useState<NowNextRank | null>(null);
  const [lifeAreaOnboardingOpen, setLifeAreaOnboardingOpen] = useState(false);
  const [lifeAreaOnboardingStep, setLifeAreaOnboardingStep] = useState<"values" | "lifeAreas" | "descriptions">("values");
  const [selectedPersonalValueIds, setSelectedPersonalValueIds] = useState<PersonalValueId[]>([]);
  const [selectedLifeAreaNames, setSelectedLifeAreaNames] = useState<string[]>([]);
  const [lifeAreaDescriptions, setLifeAreaDescriptions] = useState<Record<string, string>>({});
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
          await Promise.all([syncIntentionsNow(), syncCategoriesNow(), syncHabitsNow(), syncLifeAreasNow()]);
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
    const sync = () => {
      const state = getPomodoroState();
      setHasPomodoro(state != null);
      setFocusedIntentionId(state?.intentionId ?? null);
    };
    sync();
    window.addEventListener(POMODORO_EVENT, sync);
    return () => window.removeEventListener(POMODORO_EVENT, sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lifeAreaOnboardingOpen) return;

    const hasValues = personalValues.length > 0;
    const hasLifeAreas = activeLifeAreas(lifeAreas).length > 0;
    const valuesDismissed = window.localStorage.getItem("addit-values-onboarding-dismissed") === "1";
    const lifeAreasDismissed = window.localStorage.getItem("addit-life-area-onboarding-dismissed") === "1";

    if (!hasValues && !valuesDismissed) {
      setSelectedPersonalValueIds([]);
      setLifeAreaOnboardingStep("values");
      setLifeAreaOnboardingOpen(true);
      return;
    }

    if (!hasLifeAreas && !lifeAreasDismissed) {
      setSelectedPersonalValueIds(personalValues.map((value) => value.id));
      setLifeAreaOnboardingStep("lifeAreas");
      setLifeAreaOnboardingOpen(true);
    }
  }, [lifeAreaOnboardingOpen, lifeAreas, personalValues]);

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
    const future = parsed.filter((p) => (p.tense ?? "future") !== "past" && p.text.trim());
    const past = parsed.filter((p) => p.tense === "past" && p.text.trim());

    for (const item of past) {
      const end = item.loggedAt && !Number.isNaN(Date.parse(item.loggedAt))
        ? new Date(item.loggedAt).getTime()
        : now;
      const durationMinutes = Math.max(1, Math.min(24 * 60, Math.round(item.durationMinutes ?? 30)));
      const start = end - durationMinutes * 60_000;
      await addEntry({
        id: crypto.randomUUID(),
        text: item.rawText?.trim() || item.text.trim(),
        timestamp: now,
        startTime: start,
        endTime: end,
        date: toLocalDateStr(end),
        location: null,
        tags: [item.categoryName || "Other"],
        energy: item.energy ?? null,
        lifeAreaId: item.lifeAreaId ?? null,
        summary: item.text.trim(),
        createdAt: now,
      });
    }

    // Append to the end of the backlog: bump `order` past the largest existing
    // value so newly added rows don't visually jump above older ones until the
    // user reorders.
    const maxOrder = intentions.reduce((acc, i) => Math.max(acc, i.order), -1);
    const whyChainFor = (item: ParsedIntention): string | null =>
      normalizeWhyChain(item.whyChain) ??
      buildTaskWhyChain({
        taskText: item.text,
        lifeArea: getLifeAreaById(item.lifeAreaId, lifeAreas),
        selectedValues: personalValues,
      });

    const newIntentions: Intention[] = future.map((p, i) => ({
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
      lifeAreaId: p.lifeAreaId ?? null,
      priority: p.priority ?? null,
      activityCategory: p.categoryName ?? null,
      whyChain: whyChainFor(p),
      nowNextRank: null,
      updatedAt: now,
      deleted: false,
      syncedAt: null,
    }));

    if (newIntentions.length > 0) await addIntentions(newIntentions);
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

  const handleIntentionLifeAreaChange = async (id: string, lifeAreaId: string | null) => {
    await updateIntention(id, { lifeAreaId });
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleIntentionPriorityChange = async (id: string, priority: Intention["priority"] | null) => {
    await updateIntention(id, { priority });
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleIntentionTextChange = async (id: string, text: string) => {
    await updateIntention(id, { text });
    window.dispatchEvent(new Event("entry-updated"));
  };

  const tomorrowLocalDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalDateStr(d);
  };

  const handleCoachStartFocus = (intentionId?: string | null) => {
    if (intentionId === undefined) {
      router.push("/focus");
    } else {
      router.push(intentionId ? `/focus?task=${encodeURIComponent(intentionId)}` : "/focus?start=burst");
    }
  };

  const openCapture = useCallback((_mode: "plan" = "plan") => {
    flushSync(() => setActiveInput("plan"));
    requestAnimationFrame(() => {
      document.getElementById("brain-dump-textarea")?.focus({ preventScroll: true });
    });
  }, []);

  const handleCoachSnooze = async (id: string) => {
    await updateIntention(id, { snoozedUntil: tomorrowLocalDate() });
    window.dispatchEvent(new Event("entry-updated"));
    setToast({ message: "Snoozed until tomorrow" });
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  };

  const handleCoachArchive = async (id: string) => {
    await archiveIntentions([id]);
    window.dispatchEvent(new Event("entry-updated"));
    setToast({ message: "Archived" });
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  };

  const handleOpenVaultForRank = (rank: NowNextRank) => {
    setVaultTargetRank(rank);
    setVaultOpen(true);
  };

  const handlePullToNowNext = async (id: string, rank: NowNextRank) => {
    await setNowNextRank(id, rank);
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleClearNowNext = async (id: string) => {
    await clearNowNextRank(id);
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleSwapNowNext = async () => {
    await swapNowNextRanks();
    window.dispatchEvent(new Event("entry-updated"));
  };

  const handleHabitToggled = (habit: Habit, ticked: boolean) => {
    if (!ticked) return; // Only show toast when ticking, not unticking
    
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({
      message: `${habit.name} done`,
      undo: async () => {
        if (toastTimeout.current) clearTimeout(toastTimeout.current);
        await toggleHabitCompletion(habit.id, today);
        window.dispatchEvent(new Event("entry-updated"));
        setToast(null);
      },
    });
    toastTimeout.current = setTimeout(() => setToast(null), 5000);
  };

  const toggleSelectedPersonalValue = (id: PersonalValueId) => {
    setSelectedPersonalValueIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= MAX_PERSONAL_VALUES) return prev;
      return [...prev, id];
    });
  };

  const continueFromValuesOnboarding = async () => {
    if (selectedPersonalValueIds.length < MIN_PERSONAL_VALUES) return;
    await saveSettings({ personalValues: serializePersonalValues(selectedPersonalValueIds) });
    window.localStorage.setItem("addit-values-onboarding-dismissed", "1");
    window.dispatchEvent(new Event("personal-values-updated"));

    if (activeLifeAreas(lifeAreas).length === 0) {
      setLifeAreaOnboardingStep("lifeAreas");
    } else {
      setLifeAreaOnboardingOpen(false);
    }
  };

  const skipValuesOnboarding = () => {
    window.localStorage.setItem("addit-values-onboarding-dismissed", "1");
    if (activeLifeAreas(lifeAreas).length === 0) {
      setLifeAreaOnboardingStep("lifeAreas");
    } else {
      setLifeAreaOnboardingOpen(false);
    }
  };

  const createLifeAreasFromOnboarding = async (names: string[]) => {
    const now = Date.now();
    const selectedValueIds =
      selectedPersonalValueIds.length > 0
        ? selectedPersonalValueIds
        : personalValues.map((value) => value.id);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const valueIds = suggestedValueIdsForLifeArea(name, selectedValueIds);
      const coreValue = valueIds[0] ? getPersonalValueById(valueIds[0])?.coreValue ?? null : null;
      const area: LifeArea = {
        id: crypto.randomUUID(),
        name,
        description: lifeAreaDescriptions[name] || LIFE_AREA_STARTERS[name] || "",
        color: COLOR_OPTIONS[i % COLOR_OPTIONS.length].color,
        icon: name === "Career" ? "briefcase" : name === "Health" ? "dumbbell" : name === "Family" ? "home" : name === "Faith" ? "church" : "sparkle",
        coreValue,
        valueIds,
        sortOrder: i,
        archived: false,
        createdAt: now,
        updatedAt: now,
        deleted: false,
        syncedAt: null,
      };
      await addLifeArea(area);
    }
    window.localStorage.setItem("addit-life-area-onboarding-dismissed", "1");
    window.dispatchEvent(new Event("life-areas-updated"));
    window.dispatchEvent(new Event("entry-updated"));
    setLifeAreaOnboardingOpen(false);
  };

  const skipLifeAreaOnboarding = async () => {
    await createLifeAreasFromOnboarding(["General"]);
    setToast({ message: "General Life Area created. You can edit it in Settings." });
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 4000);
  };

  // Keyboard shortcuts: ⌘K opens the single Brain dump capture pipe, Esc collapse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modalOpen = !!selectedEntry || !!milestoneToShow;
      if (modalOpen) return;

      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCapture("plan");
        return;
      }
      if (e.key === "Escape" && activeInput !== "none") {
        e.preventDefault();
        setActiveInput("none");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeInput, selectedEntry, milestoneToShow, openCapture]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const capture = params.get("capture");
    if (capture !== "log" && capture !== "plan") return;
    openCapture("plan");
    router.replace("/", { scroll: false });
  }, [openCapture, router]);

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
    const tags = intention.activityCategory ? [intention.activityCategory] : result.tags;
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
      lifeAreaId: intention.lifeAreaId ?? null,
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

  const pendingCount = intentions.filter((i) => !i.completed).length;
  const completedCount = tadaEntries.length;
  const today_d = new Date();
  const overline = formatOverline(today_d);
  const headline = formatHeadline(today_d);
  const greeting = getGreeting();
  const subtitle = `${greeting} ${pendingCount} ahead, ${completedCount} already in the bag.`;
  const focusedIntention = focusedIntentionId
    ? intentions.find((i) => i.id === focusedIntentionId) ?? null
    : null;
  const nowNextSlots: [Intention | null, Intention | null] = [
    intentions.find((i) => i.nowNextRank === 0) ?? null,
    intentions.find((i) => i.nowNextRank === 1) ?? null,
  ];
  const vaultIntentions = intentions.filter((i) => i.nowNextRank !== 0 && i.nowNextRank !== 1);

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
          <HomeTabs
            value={homeTab}
            onChange={setHomeTab}
            overline={overline}
            headline={headline}
            subtitle={subtitle}
            dateLabel={formatTodayLabel()}
            showTabs={false}
          />

          <NowNextZone
            slots={nowNextSlots}
            vaultCount={vaultIntentions.length}
            activeEntry={activeEntry}
            hasPomodoro={hasPomodoro}
            focusedIntention={focusedIntention}
            intentionCategories={intentionCategories}
            lifeAreas={lifeAreas}
            categories={categories}
            focusedIntentionId={focusedIntentionId}
            onFinishActive={handleFinishActive}
            onOpenBrainDump={() => openCapture("plan")}
            onStartFocus={handleCoachStartFocus}
            onOpenVault={handleOpenVaultForRank}
            onClearSlot={handleClearNowNext}
            onSwapSlots={handleSwapNowNext}
            onSnoozeIntention={handleCoachSnooze}
            onArchiveIntention={handleCoachArchive}
            onComplete={handleIntentionComplete}
            onDelete={handleIntentionDelete}
            onCategoryChange={handleIntentionCategoryChange}
            onEnergyChange={handleIntentionEnergyChange}
            onLifeAreaChange={handleIntentionLifeAreaChange}
            onPriorityChange={handleIntentionPriorityChange}
            onTextChange={handleIntentionTextChange}
          />

          <BrainDumpVault
            open={vaultOpen}
            targetRank={vaultTargetRank}
            nowFilled={!!nowNextSlots[0]}
            nextFilled={!!nowNextSlots[1]}
            intentions={vaultIntentions}
            intentionCategories={intentionCategories}
            lifeAreas={lifeAreas}
            categories={categories}
            homeTab={homeTab}
            onOpenChange={setVaultOpen}
            onTargetRankChange={setVaultTargetRank}
            onHomeTabChange={setHomeTab}
            onOpenBrainDump={() => openCapture("plan")}
            onPullToNowNext={handlePullToNowNext}
            onComplete={handleIntentionComplete}
            onDelete={handleIntentionDelete}
            onCategoryChange={handleIntentionCategoryChange}
            onEnergyChange={handleIntentionEnergyChange}
            onLifeAreaChange={handleIntentionLifeAreaChange}
            onPriorityChange={handleIntentionPriorityChange}
            onTextChange={handleIntentionTextChange}
          />

          {!hasBacklog && streak ? (
            <EmptyHome totalDays={streak.totalDays} currentStreak={streak.currentStreak} />
          ) : null}

          {/* Daily habit tracker — mobile only; desktop renders it in the sidebar. */}
          <div className="lg:hidden">
            <HabitsCard onHabitToggled={handleHabitToggled} />
          </div>

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
            entries={entries}
            categories={categories}
            streak={streak}
            onHabitToggled={handleHabitToggled}
          />
          <div className="mt-3">
            <ReflectionPrompt entries={entries} />
          </div>
        </aside>
      </div>

      {/* ── Pinned input dock (fixed at the bottom, lifts above keyboard on mobile) ── */}
      <div
        className={`capture-dock fixed left-0 right-0 z-40 pointer-events-none ${
          activeInput === "none" ? "keyboard-hide-on-keyboard" : ""
        }`}
      >
        <div className={`${activeInput !== "none" ? "max-w-lg" : "max-w-2xl"} mx-auto px-4 pointer-events-auto`}>
          <div
            className={
              activeInput !== "none"
                ? "capture-panel glass-panel rounded-2xl shadow-2xl border border-[var(--glass-border)] overflow-y-auto overscroll-contain p-4"
                : ""
            }
          >
            {activeInput === "plan" ? (
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
                  activityCategories={categories}
                  lifeAreas={lifeAreas}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <div className="bg-[#1A1B2E] rounded-full p-1 flex items-center gap-1 shadow-2xl">
                  <button
                    onClick={() => openCapture("plan")}
                    className="flex items-center gap-1.5 h-10 px-4 rounded-full bg-white text-[#1A1B2E] text-sm font-semibold active:scale-[0.97] transition-transform"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 6h16" />
                      <path d="M4 12h16" />
                      <path d="M4 18h10" />
                    </svg>
                    Brain dump
                    <span className="hidden lg:inline text-[10px] opacity-60 ml-1">⌘K</span>
                  </button>
                </div>
                <button
                  onClick={() => router.push("/focus")}
                  aria-label="Start a focus session"
                  className="flex items-center justify-center w-12 h-12 rounded-full bg-[image:var(--color-accent-gradient)] text-[var(--color-on-accent)] shadow-2xl shadow-[var(--color-accent)]/25 active:scale-[0.95] transition-transform flex-shrink-0"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2 2" />
                    <path d="M9 2h6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Overlays ── */}

      {lifeAreaOnboardingOpen && (
        <div className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="glass-panel w-full max-w-lg rounded-3xl border border-[var(--glass-border)] p-5 shadow-2xl">
            {lifeAreaOnboardingStep === "values" ? (
              <>
                <h2 className="text-xl font-black tracking-tight">Pick your roots</h2>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Choose {MIN_PERSONAL_VALUES}-{MAX_PERSONAL_VALUES} values. These sit above Life Areas and keep the reason attached to the work.
                </p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {VALUE_OPTIONS.map((value) => {
                    const selected = selectedPersonalValueIds.includes(value.id);
                    const disabled = !selected && selectedPersonalValueIds.length >= MAX_PERSONAL_VALUES;
                    return (
                      <button
                        key={value.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleSelectedPersonalValue(value.id)}
                        className={`rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.98] disabled:opacity-40 ${
                          selected
                            ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]"
                            : "bg-[var(--color-surface)] border-[var(--color-border)]"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: selected ? "currentColor" : value.color }}
                            aria-hidden="true"
                          />
                          <span className="text-sm font-bold">{value.label}</span>
                        </span>
                        <span className={`mt-1 block text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          selected ? "text-white/75" : "text-[var(--color-text-muted)]"
                        }`}>
                          {getCoreValueLabel(value.coreValue)}
                        </span>
                        <span className={`mt-1 block text-xs leading-snug ${
                          selected ? "text-white/85" : "text-[var(--color-text-muted)]"
                        }`}>
                          {value.line}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={selectedPersonalValueIds.length < MIN_PERSONAL_VALUES}
                    onClick={() => void continueFromValuesOnboarding()}
                    className="h-11 flex-1 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold disabled:opacity-40"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={skipValuesOnboarding}
                    className="h-11 px-3 text-sm font-medium text-[var(--color-text-muted)]"
                  >
                    Skip for now
                  </button>
                </div>
              </>
            ) : lifeAreaOnboardingStep === "lifeAreas" ? (
              <>
                <h2 className="text-xl font-black tracking-tight">Set up Life Areas</h2>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  These are what you&apos;re building toward. ADDit uses them to make sense of your time.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUGGESTED_LIFE_AREAS.map((name) => {
                    const selected = selectedLifeAreaNames.includes(name);
                    const disabled = !selected && selectedLifeAreaNames.length >= 5;
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSelectedLifeAreaNames((prev) =>
                            prev.includes(name)
                              ? prev.filter((item) => item !== name)
                              : prev.length < 5
                                ? [...prev, name]
                                : prev
                          );
                          setLifeAreaDescriptions((prev) => ({
                            ...prev,
                            [name]: prev[name] ?? LIFE_AREA_STARTERS[name] ?? "",
                          }));
                        }}
                        className={`h-9 px-3 rounded-full text-xs font-semibold border transition-all active:scale-95 disabled:opacity-40 ${
                          selected
                            ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent)]"
                            : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)]"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                {selectedLifeAreaNames.length >= 5 && (
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">Pick your top 5. You can edit later.</p>
                )}
                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={selectedLifeAreaNames.length < 3}
                    onClick={() => setLifeAreaOnboardingStep("descriptions")}
                    className="h-11 flex-1 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold disabled:opacity-40"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => void skipLifeAreaOnboarding()}
                    className="h-11 px-3 text-sm font-medium text-[var(--color-text-muted)]"
                  >
                    Skip for now
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-black tracking-tight">One line each</h2>
                <div className="mt-4 flex flex-col gap-3">
                  {selectedLifeAreaNames.map((name) => (
                    <label key={name} className="block">
                      <span className="text-xs font-semibold text-[var(--color-text-muted)]">{name}</span>
                      <input
                        value={lifeAreaDescriptions[name] ?? LIFE_AREA_STARTERS[name] ?? ""}
                        onChange={(e) => setLifeAreaDescriptions((prev) => ({ ...prev, [name]: e.target.value.slice(0, 140) }))}
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void createLifeAreasFromOnboarding(selectedLifeAreaNames)}
                    className="h-11 flex-1 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => setLifeAreaOnboardingStep("lifeAreas")}
                    className="h-11 px-3 text-sm font-medium text-[var(--color-text-muted)]"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <EntryEditSheet
        entry={selectedEntry}
        categories={categories}
        lifeAreas={lifeAreas}
        onClose={() => setSelectedEntry(null)}
        onSave={handleSave}
        onDelete={handleDelete}
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
