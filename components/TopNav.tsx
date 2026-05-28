"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, PencilLine, Settings, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

const tabs = [
  {
    href: "/",
    label: "Home",
    Icon: PencilLine,
  },
  {
    href: "/calendar",
    label: "Calendar",
    Icon: CalendarDays,
  },
  {
    href: "/settings",
    label: "Settings",
    Icon: Settings,
  },
];

function formatNow(d: Date): string {
  // e.g. "Tue 14:32"
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${hh}:${mm}`;
}

function initialOf(email: string | null | undefined): string {
  if (!email) return "·";
  const first = email.trim()[0];
  return first ? first.toUpperCase() : "·";
}

type SyncStatus = "saved" | "syncing" | "offline";

function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "saved"
  );

  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "saved");
      }, 1800);
    };

    const markDirty = () => {
      setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "syncing");
      settle();
    };
    const markOnline = () => {
      setStatus("syncing");
      settle();
    };
    const markOffline = () => {
      if (settleTimer) clearTimeout(settleTimer);
      setStatus("offline");
    };

    window.addEventListener("entry-dirty", markDirty);
    window.addEventListener("intention-dirty", markDirty);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      window.removeEventListener("entry-dirty", markDirty);
      window.removeEventListener("intention-dirty", markDirty);
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  const label =
    status === "offline" ? "Offline" : status === "syncing" ? "Syncing" : "Saved";
  const color =
    status === "offline"
      ? "bg-amber-500"
      : status === "syncing"
        ? "bg-[var(--color-accent)] animate-pulse-soft"
        : "bg-[var(--color-success)]";

  return (
    <span
      className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-muted)]"
      title={label}
      aria-label={`Sync status: ${label}`}
    >
      <span className={`w-2 h-2 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Responsive top navigation. Replaces the bottom NavBar on all sizes.
 * On `<sm` screens the wordmark collapses to its glyph and the tab labels
 * are hidden, keeping the bar a single tappable row.
 */
export default function TopNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mb-4 flex h-14 items-center justify-between gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--color-surface-elevated)]/80 px-2 shadow-[0_18px_60px_-34px_rgba(40,20,80,0.35)] backdrop-blur sm:mb-6 sm:gap-4 sm:rounded-full sm:px-4">
      <Link
        href="/"
        aria-label="ADDit home"
        className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl text-sm font-black tracking-tight text-[var(--color-text)] transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] sm:min-w-0 sm:px-2"
      >
        <Sparkles size={18} className="text-[var(--color-accent)]" aria-hidden="true" />
        <span className="hidden sm:inline">ADDit</span>
      </Link>

      <nav
        aria-label="Primary"
        className="flex min-w-0 items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== "/" && pathname.startsWith(tab.href));
          const Icon = tab.Icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={`hit-area flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-bold transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] sm:px-3 ${
                active
                  ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_10px_24px_-14px_var(--color-accent)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <Icon size={18} strokeWidth={2.4} aria-hidden="true" />
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        <SyncIndicator />
        <span className="hidden lg:inline text-xs font-bold tabular-nums text-[var(--color-text-muted)]">
          {now ? formatNow(now) : ""}
        </span>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-black text-[var(--color-accent)]"
          title={user?.email ?? undefined}
        >
          {initialOf(user?.email)}
        </span>
      </div>
    </div>
  );
}
