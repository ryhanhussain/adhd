"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Toast from "@/components/Toast";
import {
  getAllEntriesForSync,
  getAllIntentionsForSync,
  getSettings,
  saveSettings,
} from "@/lib/db";

const themes = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useState("system");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSettings().then((settings) => {
      if (!cancelled) setTheme(settings.theme || "system");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleThemeChange = async (nextTheme: string) => {
    setTheme(nextTheme);
    await saveSettings({ theme: nextTheme });
    window.dispatchEvent(new Event("theme-changed"));
  };

  const handleExport = async () => {
    const [settings, entries, intentions] = await Promise.all([
      getSettings(),
      getAllEntriesForSync(),
      getAllIntentionsForSync(),
    ]);
    const backup = {
      schema: "addit-tasks-backup-v1",
      exportedAt: new Date().toISOString(),
      settings: {
        theme: settings.theme,
        intentionSyncOwner: settings.intentionSyncOwner,
        entrySyncOwner: settings.entrySyncOwner,
      },
      entries,
      intentions,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `addit-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Backup exported");
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-20">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Settings
        </p>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Account</h1>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Signed in
          </span>
          <span className="break-words text-sm font-semibold">{user?.email ?? "No email"}</span>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 h-10 rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          Sign out
        </button>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Theme
          </span>
          <select
            value={theme}
            onChange={(event) => void handleThemeChange(event.target.value)}
            className="h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold"
          >
            {themes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Data
          </span>
          <span className="text-sm font-medium text-[var(--color-text-muted)]">
            Export tasks and completion history.
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleExport()}
          className="mt-4 h-10 rounded-lg bg-[var(--color-accent)] px-4 text-sm font-semibold text-[var(--color-on-accent)]"
        >
          Export backup
        </button>
      </section>

      {toast && <Toast message={toast} />}
    </div>
  );
}
