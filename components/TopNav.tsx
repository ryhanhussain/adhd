"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const tabs = [
  {
    href: "/",
    label: "Now",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
      </svg>
    ),
  },
  {
    href: "/focus",
    label: "Focus",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M9 2h6" />
      </svg>
    ),
  },
  {
    href: "/timeline",
    label: "Timeline",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    href: "/analysis",
    label: "Progress",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="14" width="3" height="6" rx="0.5" />
        <rect x="10.5" y="9" width="3" height="11" rx="0.5" />
        <rect x="17" y="4" width="3" height="16" rx="0.5" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
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
    window.addEventListener("reflection-dirty", markDirty);
    window.addEventListener("intention-dirty", markDirty);
    window.addEventListener("habit-dirty", markDirty);
    window.addEventListener("categories-dirty", markDirty);
    window.addEventListener("intention-categories-dirty", markDirty);
    window.addEventListener("home-tab-dirty", markDirty);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      window.removeEventListener("entry-dirty", markDirty);
      window.removeEventListener("reflection-dirty", markDirty);
      window.removeEventListener("intention-dirty", markDirty);
      window.removeEventListener("habit-dirty", markDirty);
      window.removeEventListener("categories-dirty", markDirty);
      window.removeEventListener("intention-categories-dirty", markDirty);
      window.removeEventListener("home-tab-dirty", markDirty);
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
      className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-muted)]"
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
    <div className="flex items-center justify-between gap-2 sm:gap-4 mb-4 lg:mb-6 px-2 sm:px-4 h-12 sm:h-14 rounded-full glass-panel border border-[var(--glass-border)]">
      <Link
        href="/"
        aria-label="ADDit home"
        className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-[var(--color-text)] active:scale-95 transition-transform"
      >
        <span className="text-[var(--color-accent)]" aria-hidden="true">✦</span>
        <span className="hidden sm:inline">ADDit</span>
      </Link>

      <nav
        aria-label="Primary"
        className="glass-control flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-full"
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== "/" && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={`hit-area flex items-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                active
                  ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_10px_24px_-14px_var(--color-accent)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        <SyncIndicator />
        <span className="hidden sm:inline text-xs font-medium tabular-nums text-[var(--color-text-muted)]">
          {now ? formatNow(now) : ""}
        </span>
        <span
          aria-hidden="true"
          className="glass-control w-8 h-8 rounded-full text-[var(--color-accent)] flex items-center justify-center text-xs font-bold flex-shrink-0"
          title={user?.email ?? undefined}
        >
          {initialOf(user?.email)}
        </span>
      </div>
    </div>
  );
}
