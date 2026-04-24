"use client";

import { useState, useEffect } from "react";
import { getSettings, saveSettings, getAllEntries } from "@/lib/db";
import {
  DEFAULT_CATEGORIES,
  COLOR_OPTIONS,
  MAX_INTENTION_CATEGORIES,
  INTENTION_CATEGORY_NAME_MAX,
  INTENTION_CATEGORY_DESCRIPTION_MAX,
  type Category,
  type IntentionCategory,
} from "@/lib/categories";
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
  const [intentionPendingRemoveId, setIntentionPendingRemoveId] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);

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
                    <div className="absolute left-0 top-full mt-1 z-50 bg-[var(--color-surface-elevated)] rounded-xl shadow-lg border border-[var(--color-border)] p-2 flex gap-1.5 flex-wrap w-[220px] animate-slide-up">
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
                      <div className="absolute left-0 top-full mt-1 z-50 bg-[var(--color-surface-elevated)] rounded-xl shadow-lg border border-[var(--color-border)] p-2 flex gap-1.5 flex-wrap w-[220px] animate-slide-up">
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
