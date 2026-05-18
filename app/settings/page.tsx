"use client";

import { useState, useEffect } from "react";
import {
  getSettings,
  saveSettings,
  getAllEntries,
  getAllEntriesForSync,
  getAllIntentionsForSync,
  getAllReflectionsForSync,
  getAllHabitsForSync,
  getAllLifeAreasForSync,
  addHabit,
  updateHabit,
  deleteHabit,
  addLifeArea,
  updateLifeArea,
  archiveLifeArea,
  restoreLifeArea,
  HABIT_NAME_MAX,
  type Habit,
} from "@/lib/db";
import { useHabits } from "@/lib/useHabits";
import { useLifeAreas } from "@/lib/useLifeAreas";
import {
  DEFAULT_CATEGORIES,
  COLOR_OPTIONS,
  MAX_INTENTION_CATEGORIES,
  INTENTION_CATEGORY_NAME_MAX,
  INTENTION_CATEGORY_DESCRIPTION_MAX,
  BUCKET_ICON_KEYS,
  type Category,
  type IntentionCategory,
  type BucketIconKey,
} from "@/lib/categories";
import {
  CORE_VALUE_OPTIONS,
  LIFE_AREA_DESCRIPTION_MAX,
  LIFE_AREA_ICON_KEYS,
  LIFE_AREA_NAME_MAX,
  LIFE_AREA_STARTERS,
  MAX_LIFE_AREAS,
  type CoreValue,
  type LifeArea,
} from "@/lib/lifeAreas";
import BucketIcon from "@/components/home/BucketIcon";
import { useAuth } from "@/components/AuthProvider";
import { fetchQuota, type QuotaSnapshot } from "@/lib/quota";
import PageLayout from "@/components/PageLayout";
import ArchiveList from "@/components/ArchiveList";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>("system");
  const [openColorPicker, setOpenColorPicker] = useState<number | null>(null);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const [pendingReset, setPendingReset] = useState(false);
  const [intentionCategories, setIntentionCategories] = useState<IntentionCategory[]>([]);
  const [intentionOpenColorPicker, setIntentionOpenColorPicker] = useState<string | null>(null);
  const [intentionOpenIconPicker, setIntentionOpenIconPicker] = useState<string | null>(null);
  const [intentionPendingRemoveId, setIntentionPendingRemoveId] = useState<string | null>(null);
  const habits = useHabits();
  const lifeAreas = useLifeAreas({ includeArchived: true });
  const activeLifeAreas = lifeAreas.filter((area) => !area.archived && !area.deleted);
  const archivedLifeAreas = lifeAreas.filter((area) => area.archived && !area.deleted);
  const [expandedLifeAreaId, setExpandedLifeAreaId] = useState<string | null>(null);
  const [lifeAreaOpenColorPicker, setLifeAreaOpenColorPicker] = useState<string | null>(null);
  const [lifeAreaOpenIconPicker, setLifeAreaOpenIconPicker] = useState<string | null>(null);
  const [lifeAreaPendingArchiveId, setLifeAreaPendingArchiveId] = useState<string | null>(null);
  const [habitOpenColorPicker, setHabitOpenColorPicker] = useState<string | null>(null);
  const [habitOpenIconPicker, setHabitOpenIconPicker] = useState<string | null>(null);
  const [habitPendingRemoveId, setHabitPendingRemoveId] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);

  useEffect(() => {
    const hasOpenPicker =
      openColorPicker !== null ||
      lifeAreaOpenColorPicker !== null ||
      lifeAreaOpenIconPicker !== null ||
      intentionOpenColorPicker !== null ||
      intentionOpenIconPicker !== null ||
      habitOpenColorPicker !== null ||
      habitOpenIconPicker !== null;
    if (!hasOpenPicker) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpenColorPicker(null);
      setLifeAreaOpenColorPicker(null);
      setLifeAreaOpenIconPicker(null);
      setIntentionOpenColorPicker(null);
      setIntentionOpenIconPicker(null);
      setHabitOpenColorPicker(null);
      setHabitOpenIconPicker(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    openColorPicker,
    lifeAreaOpenColorPicker,
    lifeAreaOpenIconPicker,
    intentionOpenColorPicker,
    intentionOpenIconPicker,
    habitOpenColorPicker,
    habitOpenIconPicker,
  ]);

  useEffect(() => {
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      const snap = await fetchQuota();
      if (!cancelled) setQuota(snap);
    };
    load();
    const onUpdate = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(load, 500);
    };
    window.addEventListener("entry-updated", onUpdate);
    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      window.removeEventListener("entry-updated", onUpdate);
    };
  }, []);

  useEffect(() => {
    async function loadSettings() {
      const s = await getSettings();
      if (s.customCategories) {
        try {
          const parsed = JSON.parse(s.customCategories);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const migrated = parsed.map((c: Record<string, string>) => ({
              name: c.name,
              color: c.color,
            }));
            setCategories(migrated);
          }
        } catch { /* use defaults */ }
      }
      if (s.customIntentionCategories) {
        try {
          const parsed = JSON.parse(s.customIntentionCategories);
          if (Array.isArray(parsed)) setIntentionCategories(parsed as IntentionCategory[]);
        } catch { /* keep empty */ }
      }
      setTheme(s.theme || "system");
      setLoaded(true);
    }
    loadSettings();
    const onUpdated = () => { void loadSettings(); };
    window.addEventListener("intention-categories-updated", onUpdated);
    return () => window.removeEventListener("intention-categories-updated", onUpdated);
  }, []);

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    await saveSettings({ theme: newTheme });
    window.dispatchEvent(new Event("theme-changed"));
  };

  const handleSaveCategories = async (updated: Category[]) => {
    setCategories(updated);
    await saveSettings({
      customCategories: JSON.stringify(updated),
      categoriesSyncedAt: Date.now(),
    });
    // `categories-dirty` wakes the sync layer; `categories-updated` wakes any
    // useCategories subscribers (including other tabs on this device once
    // sync pulls land) so UI refreshes without a reload.
    window.dispatchEvent(new Event("categories-dirty"));
    window.dispatchEvent(new Event("categories-updated"));
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditName(categories[index].name);
  };

  const saveEdit = () => {
    if (editingIndex === null || !editName.trim()) return;
    const updated = [...categories];
    updated[editingIndex] = { ...updated[editingIndex], name: editName.trim() };
    handleSaveCategories(updated);
    setEditingIndex(null);
  };

  const changeColor = (index: number, colorOption: typeof COLOR_OPTIONS[number]) => {
    const updated = [...categories];
    updated[index] = { ...updated[index], color: colorOption.color };
    handleSaveCategories(updated);
  };

  const addCategory = () => {
    const usedColors = new Set(categories.map((c) => c.color));
    const available = COLOR_OPTIONS.find((co) => !usedColors.has(co.color)) || COLOR_OPTIONS[0];
    const updated = [...categories, { name: "New Category", color: available.color }];
    handleSaveCategories(updated);
    setEditingIndex(updated.length - 1);
    setEditName("New Category");
  };

  const requestRemove = (index: number) => {
    if (categories.length <= 2) return;
    if (pendingRemoveIndex === index) {
      const updated = categories.filter((_, i) => i !== index);
      handleSaveCategories(updated);
      setEditingIndex(null);
      setPendingRemoveIndex(null);
      return;
    }
    setPendingRemoveIndex(index);
    setTimeout(() => {
      setPendingRemoveIndex((cur) => (cur === index ? null : cur));
    }, 3000);
  };

  const handleSaveIntentionCategories = async (updated: IntentionCategory[]) => {
    setIntentionCategories(updated);
    await saveSettings({
      customIntentionCategories: updated.length > 0 ? JSON.stringify(updated) : null,
      intentionCategoriesSyncedAt: Date.now(),
    });
    window.dispatchEvent(new Event("intention-categories-dirty"));
    window.dispatchEvent(new Event("intention-categories-updated"));
  };

  const addIntentionCategory = () => {
    if (intentionCategories.length >= MAX_INTENTION_CATEGORIES) return;
    const usedColors = new Set(intentionCategories.map((c) => c.color));
    const available = COLOR_OPTIONS.find((co) => !usedColors.has(co.color)) || COLOR_OPTIONS[0];
    const newBucket: IntentionCategory = {
      id: crypto.randomUUID(),
      name: "New bucket",
      description: "",
      color: available.color,
      icon: "sparkle",
    };
    handleSaveIntentionCategories([...intentionCategories, newBucket]);
  };

  const updateIntentionBucket = (id: string, patch: Partial<IntentionCategory>) => {
    const updated = intentionCategories.map((c) => (c.id === id ? { ...c, ...patch } : c));
    handleSaveIntentionCategories(updated);
  };

  const requestRemoveIntentionBucket = (id: string) => {
    if (intentionPendingRemoveId === id) {
      const updated = intentionCategories.filter((c) => c.id !== id);
      handleSaveIntentionCategories(updated);
      setIntentionPendingRemoveId(null);
      return;
    }
    setIntentionPendingRemoveId(id);
    setTimeout(() => {
      setIntentionPendingRemoveId((cur) => (cur === id ? null : cur));
    }, 3000);
  };

  const addNewLifeArea = async () => {
    if (activeLifeAreas.length >= MAX_LIFE_AREAS) return;
    const usedColors = new Set(activeLifeAreas.map((area) => area.color));
    const available = COLOR_OPTIONS.find((co) => !usedColors.has(co.color)) || COLOR_OPTIONS[0];
    const now = Date.now();
    const area: LifeArea = {
      id: crypto.randomUUID(),
      name: "New area",
      description: "",
      color: available.color,
      icon: "sparkle",
      coreValue: null,
      sortOrder: lifeAreas.reduce((acc, item) => Math.max(acc, item.sortOrder), -1) + 1,
      archived: false,
      createdAt: now,
      updatedAt: now,
      deleted: false,
      syncedAt: null,
    };
    const result = await addLifeArea(area);
    if (result === "ok") setExpandedLifeAreaId(area.id);
    window.dispatchEvent(new Event("life-areas-updated"));
    window.dispatchEvent(new Event("entry-updated"));
  };

  const updateLifeAreaRow = async (id: string, patch: Partial<LifeArea>) => {
    await updateLifeArea(id, patch);
    window.dispatchEvent(new Event("life-areas-updated"));
    window.dispatchEvent(new Event("entry-updated"));
  };

  const requestArchiveLifeArea = async (id: string) => {
    if (lifeAreaPendingArchiveId === id) {
      await archiveLifeArea(id);
      setLifeAreaPendingArchiveId(null);
      setExpandedLifeAreaId(null);
      window.dispatchEvent(new Event("life-areas-updated"));
      window.dispatchEvent(new Event("entry-updated"));
      return;
    }
    setLifeAreaPendingArchiveId(id);
    setTimeout(() => {
      setLifeAreaPendingArchiveId((cur) => (cur === id ? null : cur));
    }, 4000);
  };

  const restoreArchivedLifeArea = async (id: string) => {
    const result = await restoreLifeArea(id);
    if (result === "ok") {
      window.dispatchEvent(new Event("life-areas-updated"));
      window.dispatchEvent(new Event("entry-updated"));
    }
  };

  const addDailyHabit = async () => {
    const usedColors = new Set(habits.map((h) => h.color));
    const available = COLOR_OPTIONS.find((co) => !usedColors.has(co.color)) || COLOR_OPTIONS[0];
    const maxOrder = habits.reduce((acc, h) => Math.max(acc, h.order), -1);
    const now = Date.now();
    const habit: Habit = {
      id: crypto.randomUUID(),
      name: "New habit",
      color: available.color,
      icon: "sparkle",
      order: maxOrder + 1,
      completions: [],
      lastUntickAt: null,
      createdAt: now,
      updatedAt: now,
      deleted: false,
      syncedAt: null,
    };
    await addHabit(habit);
  };

  const updateDailyHabit = async (id: string, patch: Partial<Habit>) => {
    await updateHabit(id, patch);
  };

  const requestRemoveHabit = async (id: string) => {
    if (habitPendingRemoveId === id) {
      await deleteHabit(id);
      setHabitPendingRemoveId(null);
      return;
    }
    setHabitPendingRemoveId(id);
    setTimeout(() => {
      setHabitPendingRemoveId((cur) => (cur === id ? null : cur));
    }, 3000);
  };

  const requestReset = () => {
    if (pendingReset) {
      handleSaveCategories(DEFAULT_CATEGORIES);
      setEditingIndex(null);
      setPendingReset(false);
      return;
    }
    setPendingReset(true);
    setTimeout(() => setPendingReset(false), 3000);
  };

  const handleExport = async (format: "json" | "csv") => {
    const entries = await getAllEntries();
    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === "json") {
      content = JSON.stringify(entries, null, 2);
      filename = `addit-export-${new Date().toISOString().split("T")[0]}.json`;
      mimeType = "application/json";
    } else {
      const headers = ["id", "date", "text", "tags", "startTime", "endTime", "timestamp"];
      const rows = entries.map((e) =>
        [
          e.id,
          e.date,
          `"${e.text.replace(/"/g, '""')}"`,
          `"${e.tags.join(", ")}"`,
          new Date(e.startTime).toISOString(),
          new Date(e.endTime).toISOString(),
          new Date(e.timestamp).toISOString(),
        ].join(",")
      );
      content = [headers.join(","), ...rows].join("\n");
      filename = `addit-export-${new Date().toISOString().split("T")[0]}.csv`;
      mimeType = "text/csv";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus(`Exported ${entries.length} entries`);
    setTimeout(() => setExportStatus(null), 2500);
  };

  const handleFullBackupExport = async () => {
    const [settings, entries, intentions, reflections, allHabits, allLifeAreas] = await Promise.all([
      getSettings(),
      getAllEntriesForSync(),
      getAllIntentionsForSync(),
      getAllReflectionsForSync(),
      getAllHabitsForSync(),
      getAllLifeAreasForSync(),
    ]);

    const backup = {
      schema: "addit-full-backup-v1",
      exportedAt: new Date().toISOString(),
      settings,
      categories,
      intentionCategories,
      entries,
      intentions,
      reflections,
      habits: allHabits,
      lifeAreas: allLifeAreas,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `addit-full-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus(
      `Exported full backup: ${entries.length} entries, ${intentions.length} intentions`
    );
    setTimeout(() => setExportStatus(null), 3000);
  };

  if (!loaded) return null;

  return (
    <PageLayout gap="8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm mt-1 text-[var(--color-text-muted)]">
          Configure your ADDit experience
        </p>
      </div>

      {/* Theme */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 text-[var(--color-text-muted)]">
          Appearance
        </h2>
        <div className="flex rounded-xl border border-[var(--color-border)] overflow-hidden">
          {(["light", "system", "dark"] as const).map((option) => (
            <button
              key={option}
              onClick={() => handleThemeChange(option)}
              className={`flex-1 py-2.5 text-sm font-medium transition-all active:scale-[0.98] ${
                theme === option
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
              }`}
            >
              {option === "light" ? "Light" : option === "dark" ? "Dark" : "System"}
            </button>
          ))}
        </div>
      </section>

      {/* Life Areas */}
      <section>
        <div className="mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Life Areas
          </h2>
          <p className="text-sm mt-1 text-[var(--color-text-muted)]">
            What you&apos;re building toward. Up to 5. Gemini uses these to tag your activities.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {activeLifeAreas.map((area) => {
            const expanded = expandedLifeAreaId === area.id;
            return (
              <div
                key={area.id}
                className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      className="min-w-11 min-h-11 flex items-center justify-center rounded-full"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${area.color} 16%, transparent)`,
                        color: area.color,
                      }}
                      onClick={() => setLifeAreaOpenColorPicker(lifeAreaOpenColorPicker === area.id ? null : area.id)}
                      aria-label={`Change color for ${area.name}`}
                      aria-expanded={lifeAreaOpenColorPicker === area.id}
                    >
                      <BucketIcon name={area.icon} size={18} />
                    </button>
                    {lifeAreaOpenColorPicker === area.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setLifeAreaOpenColorPicker(null)} />
                        <div className="absolute left-0 top-full mt-1 z-50 popup-panel rounded-xl p-2 flex gap-1.5 flex-wrap w-[220px] max-w-[calc(100vw-2rem)] animate-slide-up">
                          {COLOR_OPTIONS.map((co) => (
                            <button
                              key={co.color}
                              onClick={() => {
                                void updateLifeAreaRow(area.id, { color: co.color });
                                setLifeAreaOpenColorPicker(null);
                              }}
                              className="min-w-11 min-h-11 flex items-center justify-center rounded-lg transition-transform active:scale-90"
                              title={co.label}
                              aria-label={co.label}
                            >
                              <span
                                className="w-7 h-7 rounded-full border-2"
                                style={{
                                  backgroundColor: co.color,
                                  borderColor: co.color === area.color ? "var(--color-text)" : "transparent",
                                }}
                              />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    onClick={() => setExpandedLifeAreaId(expanded ? null : area.id)}
                    className="flex-1 min-w-0 text-left"
                    aria-expanded={expanded}
                  >
                    <p className="text-sm font-bold truncate">{area.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">
                      {area.description || "Add why this matters"}
                    </p>
                  </button>

                  <button
                    onClick={() => void requestArchiveLifeArea(area.id)}
                    className={`min-w-11 min-h-11 flex items-center justify-center leading-none transition-colors ${
                      lifeAreaPendingArchiveId === area.id
                        ? "text-[var(--color-danger)] text-xs font-semibold"
                        : "text-[var(--color-text-muted)] text-xl hover:text-[var(--color-danger)]"
                    }`}
                    aria-label={lifeAreaPendingArchiveId === area.id ? `Archive ${area.name}` : `Archive ${area.name}`}
                  >
                    {lifeAreaPendingArchiveId === area.id ? "Archive?" : "×"}
                  </button>
                </div>

                {lifeAreaPendingArchiveId === area.id && (
                  <p className="mt-2 rounded-lg border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/5 px-3 py-2 text-xs text-[var(--color-text-muted)]">
                    Archive this area? Past data stays tagged. You can restore it later.
                  </p>
                )}

                {expanded && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
                    <label className="block">
                      <span className="flex items-center justify-between text-xs font-medium text-[var(--color-text-muted)]">
                        Name
                        <span className="tabular-nums">{area.name.length}/{LIFE_AREA_NAME_MAX}</span>
                      </span>
                      <input
                        value={area.name}
                        maxLength={LIFE_AREA_NAME_MAX}
                        onChange={(e) => void updateLifeAreaRow(area.id, { name: e.target.value.slice(0, LIFE_AREA_NAME_MAX) })}
                        className="mt-1 w-full text-sm font-medium bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none py-1"
                      />
                    </label>

                    <label className="block">
                      <span className="flex items-center justify-between text-xs font-medium text-[var(--color-text-muted)]">
                        Why this matters
                        <span className="tabular-nums">{area.description.length}/{LIFE_AREA_DESCRIPTION_MAX}</span>
                      </span>
                      <textarea
                        value={area.description}
                        maxLength={LIFE_AREA_DESCRIPTION_MAX}
                        onChange={(e) => void updateLifeAreaRow(area.id, { description: e.target.value.slice(0, LIFE_AREA_DESCRIPTION_MAX) })}
                        placeholder={LIFE_AREA_STARTERS[area.name] ?? "One line on why this matters"}
                        rows={2}
                        className="mt-1 w-full text-sm bg-[var(--color-bg)]/50 rounded-lg px-3 py-2 border border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none resize-none placeholder:text-[var(--color-text-muted)]"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <div className="relative">
                        <button
                          className="h-10 px-3 rounded-xl border border-[var(--color-border)] text-xs font-semibold flex items-center gap-2"
                          onClick={() => setLifeAreaOpenIconPicker(lifeAreaOpenIconPicker === area.id ? null : area.id)}
                          aria-expanded={lifeAreaOpenIconPicker === area.id}
                        >
                          <BucketIcon name={area.icon} size={16} />
                          Icon
                        </button>
                        {lifeAreaOpenIconPicker === area.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setLifeAreaOpenIconPicker(null)} />
                            <div className="absolute left-0 top-full mt-1 z-50 popup-panel rounded-xl p-2 grid grid-cols-5 gap-1 w-[240px] max-w-[calc(100vw-2rem)] animate-slide-up">
                              {LIFE_AREA_ICON_KEYS.map((key) => (
                                <button
                                  key={key}
                                  onClick={() => {
                                    void updateLifeAreaRow(area.id, { icon: key });
                                    setLifeAreaOpenIconPicker(null);
                                  }}
                                  className="min-h-11 flex items-center justify-center rounded-lg transition-transform active:scale-90"
                                  style={(area.icon === key)
                                    ? {
                                        color: area.color,
                                        backgroundColor: `color-mix(in srgb, ${area.color} 14%, transparent)`,
                                        boxShadow: `inset 0 0 0 2px ${area.color}`,
                                      }
                                    : { color: "var(--color-text-muted)" }}
                                  title={key}
                                  aria-label={key}
                                >
                                  <BucketIcon name={key} size={18} />
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <select
                        value={area.coreValue ?? ""}
                        onChange={(e) => void updateLifeAreaRow(area.id, { coreValue: (e.target.value || null) as CoreValue | null })}
                        className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold"
                        aria-label="Core value"
                      >
                        <option value="">Core Value: None</option>
                        {CORE_VALUE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => void addNewLifeArea()}
          disabled={activeLifeAreas.length >= MAX_LIFE_AREAS}
          title={activeLifeAreas.length >= MAX_LIFE_AREAS ? "5 max. Archive one to add another." : "Add Life Area"}
          className="mt-3 w-full h-11 rounded-xl border-2 border-dashed border-[var(--color-border)] text-sm font-medium text-[var(--color-text-muted)] transition-all active:scale-[0.98] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-45 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-text-muted)]"
        >
          + Add Life Area
        </button>

        {archivedLifeAreas.length > 0 && (
          <details className="mt-3 group">
            <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--color-text-muted)]">
              Archived
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {archivedLifeAreas.map((area) => (
                <div key={area.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: area.color }} />
                  <span className="flex-1 text-sm font-medium truncate">{area.name}</span>
                  <button
                    disabled={activeLifeAreas.length >= MAX_LIFE_AREAS}
                    title={activeLifeAreas.length >= MAX_LIFE_AREAS ? "5 max. Archive one to restore another." : "Restore"}
                    onClick={() => void restoreArchivedLifeArea(area.id)}
                    className="h-9 px-3 rounded-lg text-xs font-semibold text-[var(--color-accent)] disabled:opacity-40"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Categories */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Categories
          </h2>
          <button
            onClick={requestReset}
            className={`text-xs underline min-h-11 px-2 ${pendingReset ? "text-[var(--color-danger)] font-semibold" : "text-[var(--color-text-muted)]"}`}
          >
            {pendingReset ? "Tap again to confirm" : "Reset to defaults"}
          </button>
        </div>
        <p className="text-sm mb-4 text-[var(--color-text-muted)]">
          Tap a category to rename it. Tap its color dot to change the color.
        </p>

        <div className="flex flex-col gap-2">
          {categories.map((cat, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
            >
              <div className="relative">
                <button
                  className="min-w-11 min-h-11 flex items-center justify-center flex-shrink-0"
                  onClick={() => setOpenColorPicker(openColorPicker === i ? null : i)}
                  aria-label={`Change color for ${cat.name}`}
                  aria-expanded={openColorPicker === i}
                >
                  <span
                    className="w-6 h-6 rounded-full border-2 border-[var(--color-bg)] shadow-sm flex items-center justify-center"
                    style={{ backgroundColor: cat.color }}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
                {openColorPicker === i && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpenColorPicker(null)} />
                    <div className="absolute left-0 top-full mt-1 z-50 popup-panel rounded-xl p-2 flex gap-1.5 flex-wrap w-[220px] max-w-[calc(100vw-2rem)] animate-slide-up">
                      {COLOR_OPTIONS.map((co) => (
                        <button
                          key={co.color}
                          onClick={() => {
                            changeColor(i, co);
                            setOpenColorPicker(null);
                          }}
                          className="min-w-11 min-h-11 flex items-center justify-center rounded-lg transition-transform active:scale-90"
                          title={co.label}
                          aria-label={co.label}
                        >
                          <span
                            className="w-7 h-7 rounded-full border-2"
                            style={{
                              backgroundColor: co.color,
                              borderColor: co.color === cat.color ? "var(--color-text)" : "transparent",
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {editingIndex === i ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  autoFocus
                  className="flex-1 text-sm font-medium bg-transparent border-b border-[var(--color-accent)] outline-none py-0.5"
                />
              ) : (
                <button
                  onClick={() => startEditing(i)}
                  className="flex-1 text-left text-sm font-medium"
                >
                  {cat.name}
                </button>
              )}

              {categories.length > 2 && (
                <button
                  onClick={() => requestRemove(i)}
                  className={`min-w-11 min-h-11 flex items-center justify-center leading-none transition-colors ${
                    pendingRemoveIndex === i
                      ? "text-[var(--color-danger)] text-xs font-semibold"
                      : "text-[var(--color-text-muted)] text-xl hover:text-[var(--color-danger)]"
                  }`}
                  aria-label={pendingRemoveIndex === i ? `Tap again to confirm removing ${cat.name}` : `Remove ${cat.name}`}
                >
                  {pendingRemoveIndex === i ? "Confirm?" : "×"}
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addCategory}
          className="mt-3 w-full h-11 rounded-xl border-2 border-dashed border-[var(--color-border)] text-sm font-medium text-[var(--color-text-muted)] transition-all active:scale-[0.98] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          + Add Category
        </button>
      </section>

      {/* Intention buckets */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-2 text-[var(--color-text-muted)]">
          Intention buckets
        </h2>
        <p className="text-sm mb-4 text-[var(--color-text-muted)]">
          Up to {MAX_INTENTION_CATEGORIES} buckets. Your description teaches the AI how to sort brain-dump items.
        </p>

        <div className="flex flex-col gap-2">
          {intentionCategories.map((bucket) => (
            <div
              key={bucket.id}
              className="flex flex-col gap-2 px-3 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    className="min-w-11 min-h-11 flex items-center justify-center flex-shrink-0"
                    onClick={() => setIntentionOpenColorPicker(intentionOpenColorPicker === bucket.id ? null : bucket.id)}
                    aria-label={`Change color for ${bucket.name}`}
                    aria-expanded={intentionOpenColorPicker === bucket.id}
                  >
                    <span
                      className="w-6 h-6 rounded-full border-2 border-[var(--color-bg)] shadow-sm flex items-center justify-center"
                      style={{ backgroundColor: bucket.color }}
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>
                  {intentionOpenColorPicker === bucket.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIntentionOpenColorPicker(null)} />
                      <div className="absolute left-0 top-full mt-1 z-50 popup-panel rounded-xl p-2 flex gap-1.5 flex-wrap w-[220px] max-w-[calc(100vw-2rem)] animate-slide-up">
                        {COLOR_OPTIONS.map((co) => (
                          <button
                            key={co.color}
                            onClick={() => {
                              updateIntentionBucket(bucket.id, { color: co.color });
                              setIntentionOpenColorPicker(null);
                            }}
                            className="min-w-11 min-h-11 flex items-center justify-center rounded-lg transition-transform active:scale-90"
                            title={co.label}
                            aria-label={co.label}
                          >
                            <span
                              className="w-7 h-7 rounded-full border-2"
                              style={{
                                backgroundColor: co.color,
                                borderColor: co.color === bucket.color ? "var(--color-text)" : "transparent",
                              }}
                            />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Icon picker — sits beside the color dot, mirrors its popover pattern. */}
                <div className="relative">
                  <button
                    className="min-w-11 min-h-11 flex items-center justify-center flex-shrink-0 rounded-xl"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${bucket.color} 14%, transparent)`,
                      color: bucket.color,
                    }}
                    onClick={() => setIntentionOpenIconPicker(intentionOpenIconPicker === bucket.id ? null : bucket.id)}
                    aria-label={`Change icon for ${bucket.name}`}
                    aria-expanded={intentionOpenIconPicker === bucket.id}
                  >
                    <BucketIcon name={bucket.icon ?? "sparkle"} size={18} />
                  </button>
                  {intentionOpenIconPicker === bucket.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIntentionOpenIconPicker(null)} />
                      <div className="absolute left-0 top-full mt-1 z-50 popup-panel rounded-xl p-2 grid grid-cols-5 sm:grid-cols-6 gap-1 w-[240px] sm:w-[280px] max-w-[calc(100vw-2rem)] animate-slide-up">
                        {BUCKET_ICON_KEYS.map((key) => {
                          const selected = (bucket.icon ?? "sparkle") === key;
                          return (
                            <button
                              key={key}
                              onClick={() => {
                                updateIntentionBucket(bucket.id, { icon: key as BucketIconKey });
                                setIntentionOpenIconPicker(null);
                              }}
                              className="min-h-11 flex items-center justify-center rounded-lg transition-transform active:scale-90"
                              style={
                                selected
                                  ? {
                                      color: bucket.color,
                                      backgroundColor: `color-mix(in srgb, ${bucket.color} 14%, transparent)`,
                                      boxShadow: `inset 0 0 0 2px ${bucket.color}`,
                                    }
                                  : { color: "var(--color-text-muted)" }
                              }
                              title={key}
                              aria-label={key}
                            >
                              <BucketIcon name={key} size={18} />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <label htmlFor={`bucket-name-${bucket.id}`} className="sr-only">Bucket name</label>
                <input
                  id={`bucket-name-${bucket.id}`}
                  value={bucket.name}
                  onChange={(e) => updateIntentionBucket(bucket.id, { name: e.target.value.slice(0, INTENTION_CATEGORY_NAME_MAX) })}
                  placeholder="Bucket name"
                  maxLength={INTENTION_CATEGORY_NAME_MAX}
                  className="flex-1 text-sm font-medium bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none py-0.5"
                />

                <button
                  onClick={() => requestRemoveIntentionBucket(bucket.id)}
                  className={`min-w-11 min-h-11 flex items-center justify-center leading-none transition-colors ${
                    intentionPendingRemoveId === bucket.id
                      ? "text-[var(--color-danger)] text-xs font-semibold"
                      : "text-[var(--color-text-muted)] text-xl hover:text-[var(--color-danger)]"
                  }`}
                  aria-label={intentionPendingRemoveId === bucket.id ? `Tap again to confirm removing ${bucket.name}` : `Remove ${bucket.name}`}
                >
                  {intentionPendingRemoveId === bucket.id ? "Confirm?" : "×"}
                </button>
              </div>

              <label htmlFor={`bucket-desc-${bucket.id}`} className="sr-only">Bucket description — what belongs in this bucket?</label>
              <textarea
                id={`bucket-desc-${bucket.id}`}
                value={bucket.description}
                onChange={(e) => updateIntentionBucket(bucket.id, { description: e.target.value.slice(0, INTENTION_CATEGORY_DESCRIPTION_MAX) })}
                placeholder="One sentence: what belongs in this bucket?"
                rows={2}
                maxLength={INTENTION_CATEGORY_DESCRIPTION_MAX}
                className="w-full text-sm bg-[var(--color-bg)]/50 rounded-lg px-3 py-2 border border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none resize-none placeholder:text-[var(--color-text-muted)]"
              />
              <div className="text-[10px] text-right text-[var(--color-text-muted)] tabular-nums">
                {bucket.description.length}/{INTENTION_CATEGORY_DESCRIPTION_MAX}
              </div>
            </div>
          ))}
        </div>

        {intentionCategories.length < MAX_INTENTION_CATEGORIES && (
          <button
            onClick={addIntentionCategory}
            className="mt-3 w-full h-11 rounded-xl border-2 border-dashed border-[var(--color-border)] text-sm font-medium text-[var(--color-text-muted)] transition-all active:scale-[0.98] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            + Add Bucket
          </button>
        )}
      </section>

      {/* Daily habits */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-2 text-[var(--color-text-muted)]">
          Daily habits
        </h2>
        <p className="text-sm mb-4 text-[var(--color-text-muted)]">
          Behaviours you want to anchor every day. Tick on Home to keep the streak alive. Habits with no activity for more than 10 days are removed automatically.
        </p>

        <div className="flex flex-col gap-2">
          {habits.map((habit) => (
            <div
              key={habit.id}
              className="flex items-center gap-3 px-3 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
            >
              <div className="relative">
                <button
                  className="min-w-11 min-h-11 flex items-center justify-center flex-shrink-0"
                  onClick={() => setHabitOpenColorPicker(habitOpenColorPicker === habit.id ? null : habit.id)}
                  aria-label={`Change color for ${habit.name}`}
                  aria-expanded={habitOpenColorPicker === habit.id}
                >
                  <span
                    className="w-6 h-6 rounded-full border-2 border-[var(--color-bg)] shadow-sm flex items-center justify-center"
                    style={{ backgroundColor: habit.color }}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
                {habitOpenColorPicker === habit.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setHabitOpenColorPicker(null)} />
                    <div className="absolute left-0 top-full mt-1 z-50 popup-panel rounded-xl p-2 flex gap-1.5 flex-wrap w-[220px] max-w-[calc(100vw-2rem)] animate-slide-up">
                      {COLOR_OPTIONS.map((co) => (
                        <button
                          key={co.color}
                          onClick={() => {
                            void updateDailyHabit(habit.id, { color: co.color });
                            setHabitOpenColorPicker(null);
                          }}
                          className="min-w-11 min-h-11 flex items-center justify-center rounded-lg transition-transform active:scale-90"
                          title={co.label}
                          aria-label={co.label}
                        >
                          <span
                            className="w-7 h-7 rounded-full border-2"
                            style={{
                              backgroundColor: co.color,
                              borderColor: co.color === habit.color ? "var(--color-text)" : "transparent",
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="relative">
                <button
                  className="min-w-11 min-h-11 flex items-center justify-center flex-shrink-0 rounded-xl"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${habit.color} 14%, transparent)`,
                    color: habit.color,
                  }}
                  onClick={() => setHabitOpenIconPicker(habitOpenIconPicker === habit.id ? null : habit.id)}
                  aria-label={`Change icon for ${habit.name}`}
                  aria-expanded={habitOpenIconPicker === habit.id}
                >
                  <BucketIcon name={habit.icon ?? "sparkle"} size={18} />
                </button>
                {habitOpenIconPicker === habit.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setHabitOpenIconPicker(null)} />
                    <div className="absolute left-0 top-full mt-1 z-50 popup-panel rounded-xl p-2 grid grid-cols-5 sm:grid-cols-6 gap-1 w-[240px] sm:w-[280px] max-w-[calc(100vw-2rem)] animate-slide-up">
                      {BUCKET_ICON_KEYS.map((key) => {
                        const selected = (habit.icon ?? "sparkle") === key;
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              void updateDailyHabit(habit.id, { icon: key as BucketIconKey });
                              setHabitOpenIconPicker(null);
                            }}
                            className="min-h-11 flex items-center justify-center rounded-lg transition-transform active:scale-90"
                            style={
                              selected
                                ? {
                                    color: habit.color,
                                    backgroundColor: `color-mix(in srgb, ${habit.color} 14%, transparent)`,
                                    boxShadow: `inset 0 0 0 2px ${habit.color}`,
                                  }
                                : { color: "var(--color-text-muted)" }
                            }
                            title={key}
                            aria-label={key}
                          >
                            <BucketIcon name={key} size={18} />
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <label htmlFor={`habit-name-${habit.id}`} className="sr-only">Habit name</label>
              <input
                id={`habit-name-${habit.id}`}
                value={habit.name}
                onChange={(e) => updateDailyHabit(habit.id, { name: e.target.value.slice(0, HABIT_NAME_MAX) })}
                placeholder="Habit name"
                maxLength={HABIT_NAME_MAX}
                className="flex-1 text-sm font-medium bg-transparent border-b border-[var(--color-border)] focus:border-[var(--color-accent)] outline-none py-0.5"
              />

              <button
                onClick={() => void requestRemoveHabit(habit.id)}
                className={`min-w-11 min-h-11 flex items-center justify-center leading-none transition-colors ${
                  habitPendingRemoveId === habit.id
                    ? "text-[var(--color-danger)] text-xs font-semibold"
                    : "text-[var(--color-text-muted)] text-xl hover:text-[var(--color-danger)]"
                }`}
                aria-label={habitPendingRemoveId === habit.id ? `Tap again to confirm removing ${habit.name}` : `Remove ${habit.name}`}
              >
                {habitPendingRemoveId === habit.id ? "Confirm?" : "×"}
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => void addDailyHabit()}
          className="mt-3 w-full h-11 rounded-xl border-2 border-dashed border-[var(--color-border)] text-sm font-medium text-[var(--color-text-muted)] transition-all active:scale-[0.98] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          + Add Habit
        </button>
      </section>

      {/* Export */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 text-[var(--color-text-muted)]">
          Your Data
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("json")}
            className="flex-1 h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-medium transition-all active:scale-[0.98]"
          >
            Export JSON
          </button>
          <button
            onClick={() => handleExport("csv")}
            className="flex-1 h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-medium transition-all active:scale-[0.98]"
          >
            Export CSV
          </button>
        </div>
        <button
          onClick={handleFullBackupExport}
          className="mt-2 w-full h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold transition-all active:scale-[0.98]"
        >
          Export Full Backup
        </button>
        {exportStatus && (
          <p className="text-sm text-center mt-2 text-[var(--color-accent)] animate-fade-in">
            {exportStatus}
          </p>
        )}
      </section>

      {/* Archived intentions */}
      <section id="archived" className="scroll-mt-4">
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer list-none select-none">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Archived intentions
            </h2>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--color-text-muted)] transition-transform group-open:rotate-180"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <p className="text-sm mt-2 mb-4 text-[var(--color-text-muted)]">
            Past intentions you didn&apos;t carry forward. Restore any that still matter.
          </p>
          <ArchiveList />
        </details>
      </section>

      {/* AI Usage */}
      {quota && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 text-[var(--color-text-muted)]">
            AI requests today
          </h2>
          <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-3">
            <div className="flex items-baseline justify-between mb-2">
              <span
                className={`text-sm font-semibold tabular-nums ${
                  quota.remaining === 0
                    ? "text-red-500"
                    : quota.remaining <= 5
                    ? "text-amber-500"
                    : "text-[var(--color-text)]"
                }`}
              >
                {quota.count}/{quota.cap} used
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)]">
                resets at midnight UTC
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-border)]/40 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  quota.remaining === 0
                    ? "bg-red-500"
                    : quota.remaining <= 5
                    ? "bg-amber-500"
                    : "bg-[var(--color-accent)]"
                }`}
                style={{ width: `${Math.min(100, (quota.count / quota.cap) * 100)}%` }}
              />
            </div>
          </div>
        </section>
      )}

      {/* Account */}
      {user && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 text-[var(--color-text-muted)]">
            Account
          </h2>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] mb-3">
            <div className="w-9 h-9 rounded-full bg-[var(--color-accent-soft)] flex items-center justify-center text-sm font-bold text-[var(--color-accent)]">
              {(user.email?.[0] || "?").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.email}</p>
              <p className="text-xs text-[var(--color-text-muted)]">Signed in</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full h-11 rounded-xl border border-[var(--color-danger)] text-[var(--color-danger)] text-sm font-medium transition-all active:scale-[0.98] hover:bg-[var(--color-danger)] hover:text-white"
          >
            Sign Out
          </button>
        </section>
      )}

      {/* About */}
      <section className="text-center pb-8">
        <p className="text-xs text-[var(--color-text-muted)]">
          ADDit — Built for ADHD brains
        </p>
        <p className="text-xs mt-1 text-[var(--color-text-muted)]">
          Data synced securely via Supabase
        </p>
      </section>
    </PageLayout>
  );
}
