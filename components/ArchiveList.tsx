"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addIntentions,
  deleteIntention,
  getArchivedIntentions,
  getIntentionsByDate,
  toLocalDateStr,
  type Intention,
} from "@/lib/db";

function formatDateHeading(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(dt, today)) return "Today";
  if (sameDay(dt, yesterday)) return "Yesterday";
  return dt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function ArchiveList() {
  const [archived, setArchived] = useState<Intention[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const items = await getArchivedIntentions();
    setArchived(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("entry-updated", handler);
    return () => window.removeEventListener("entry-updated", handler);
  }, [load]);

  const restore = async (item: Intention) => {
    const today = toLocalDateStr(new Date());
    const existing = await getIntentionsByDate(today);
    const now = Date.now();
    await addIntentions([
      {
        id: crypto.randomUUID(),
        text: item.text,
        date: today,
        completed: false,
        completedAt: null,
        entryId: null,
        order: existing.length,
        createdAt: now,
        updatedAt: now,
        archived: false,
        deleted: false,
        syncedAt: null,
      },
    ]);
    await deleteIntention(item.id);
    window.dispatchEvent(new Event("entry-updated"));
  };

  const remove = async (id: string) => {
    await deleteIntention(id);
    window.dispatchEvent(new Event("entry-updated"));
  };

  if (loading) {
    return <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>;
  }

  if (archived.length === 0) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <p className="text-lg font-semibold mb-1">Nothing archived yet</p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Intentions you skip from the daily carry-over land here for later review.
        </p>
      </div>
    );
  }

  // Group by original date
  const groups = new Map<string, Intention[]>();
  for (const item of archived) {
    const g = groups.get(item.date) ?? [];
    g.push(item);
    groups.set(item.date, g);
  }

  return (
    <div className="flex flex-col gap-5">
      {[...groups.entries()].map(([date, items]) => (
        <section key={date} className="animate-fade-in">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2 px-1">
            {formatDateHeading(date)}
          </h2>
          <div className="glass-panel rounded-2xl p-2 border border-[var(--color-border)]">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 py-2.5 px-2 border-b border-[var(--color-border)] last:border-b-0"
              >
                <span className="flex-1 text-sm text-[var(--color-text)]">{item.text}</span>
                <button
                  onClick={() => restore(item)}
                  className="h-8 px-3 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] text-xs font-semibold active:scale-95 transition-transform"
                  aria-label="Restore to today"
                >
                  Restore
                </button>
                <button
                  onClick={() => remove(item.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-all active:scale-90"
                  aria-label="Delete permanently"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
