"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Download, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import Toast from "@/components/Toast";
import { Button, MetadataChip, PageHeader, PageShell, Panel, SectionHeader, SegmentedControl } from "@/components/ui/primitives";
import {
  getAllEntriesForSync,
  getAllIntentionsForSync,
  getSettings,
  saveSettings,
} from "@/lib/db";

type ThemeChoice = "system" | "light" | "dark";

const themes: Array<{ value: ThemeChoice; label: string; icon: ReactNode }> = [
  { value: "system", label: "System", icon: <Monitor size={15} /> },
  { value: "light", label: "Light", icon: <Sun size={15} /> },
  { value: "dark", label: "Dark", icon: <Moon size={15} /> },
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
    <PageShell maxWidth="md">
      <PageHeader
        eyebrow="Settings"
        title="Account"
        description="Manage account, appearance, and local backup."
      />

      <Panel className="grid gap-4">
        <SectionHeader title="Signed in" />
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <UserRound size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="break-words text-sm font-bold">{user?.email ?? "No email"}</p>
            <MetadataChip className="mt-1">Sync enabled</MetadataChip>
          </div>
        </div>
        <Button
          onClick={() => void signOut()}
          variant="secondary"
        >
          <LogOut size={17} />
          Sign out
        </Button>
      </Panel>

      <Panel className="grid gap-4">
        <SectionHeader title="Appearance" description="Choose how ADDit follows your device." />
        <SegmentedControl
          value={theme as ThemeChoice}
          onChange={(value) => void handleThemeChange(value)}
          ariaLabel="Theme"
          className="grid-cols-3"
          options={themes}
        />
      </Panel>

      <Panel className="grid gap-4">
        <SectionHeader title="Data" description="Export tasks and completion history." />
        <Button
          onClick={() => void handleExport()}
          variant="primary"
        >
          <Download size={17} />
          Export backup
        </Button>
      </Panel>

      {toast && <Toast message={toast} />}
    </PageShell>
  );
}
