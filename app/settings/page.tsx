"use client";

import { useState, useEffect } from "react";
import { getSettings, saveSettings, getAllEntries } from "@/lib/db";
import { DEFAULT_CATEGORIES, COLOR_OPTIONS, type Category } from "@/lib/categories";
import { useAuth } from "@/components/AuthProvider";

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
      setTheme(s.theme || "system");
      setLoaded(true);
    }
    loadSettings();
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
    window.dispatchEvent(new Event("categories-dirty"));
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
    <div className="flex flex-col gap-8">
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
    </div>
  );
}
