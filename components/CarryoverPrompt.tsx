"use client";

import { useState } from "react";
import {
  addIntentions,
  archiveIntentions,
  deleteIntention,
  getIntentionsByDate,
  toLocalDateStr,
  type Intention,
} from "@/lib/db";

interface CarryoverPromptProps {
  items: Intention[];
  onDone: () => void;
}

export default function CarryoverPrompt({ items, onDone }: CarryoverPromptProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));
  const [working, setWorking] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const carryOver = async () => {
    setWorking(true);
    try {
      const today = toLocalDateStr(new Date());
      const existing = await getIntentionsByDate(today);
      const offset = existing.length;
      const now = Date.now();

      const toCarry = items.filter((i) => selected.has(i.id));
      const toArchive = items.filter((i) => !selected.has(i.id)).map((i) => i.id);

      if (toCarry.length > 0) {
        const cloned: Intention[] = toCarry.map((i, idx) => ({
          id: crypto.randomUUID(),
          text: i.text,
          date: today,
          completed: false,
          completedAt: null,
          entryId: null,
          order: offset + idx,
          createdAt: now,
          updatedAt: now,
          archived: false,
          deleted: false,
          syncedAt: null,
        }));
        await addIntentions(cloned);
        // Carried-over originals are replaced by today's clones; remove them.
        for (const i of toCarry) {
          await deleteIntention(i.id);
        }
      }

      if (toArchive.length > 0) {
        await archiveIntentions(toArchive);
      }

      window.dispatchEvent(new Event("entry-updated"));
      onDone();
    } finally {
      setWorking(false);
    }
  };

  const skipAll = async () => {
    setWorking(true);
    try {
      await archiveIntentions(items.map((i) => i.id));
      window.dispatchEvent(new Event("entry-updated"));
      onDone();
    } finally {
      setWorking(false);
    }
  };

  const count = selected.size;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in pb-nav sm:pb-0">
      <div className="w-full max-w-lg mx-auto bg-[var(--color-bg)] border border-[var(--color-border)] rounded-3xl p-5 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="mb-1">
          <h2 className="text-lg font-bold tracking-tight">Carry over from yesterday?</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            You had {items.length} {items.length === 1 ? "intention" : "intentions"} left pending. Pick what still matters today.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 mt-3 pr-1">
          <ul className="flex flex-col">
            {items.map((item) => {
              const checked = selected.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    onClick={() => toggle(item.id)}
                    className="w-full flex items-center gap-3 py-2.5 px-1 text-left active:scale-[0.99] transition-transform"
                  >
                    <span
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                        checked
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
                          : "border-[var(--color-accent)]/40"
                      }`}
                      aria-hidden="true"
                    >
                      {checked && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-on-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`flex-1 text-sm transition-colors ${
                        checked ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)] line-through"
                      }`}
                    >
                      {item.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <button
            onClick={carryOver}
            disabled={working}
            className="w-full h-11 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold active:scale-[0.98] transition-all disabled:opacity-60"
          >
            {count === 0
              ? "Archive all"
              : count === items.length
              ? `Carry over all ${count}`
              : `Carry over ${count} • archive ${items.length - count}`}
          </button>
          <div className="flex gap-2">
            <button
              onClick={skipAll}
              disabled={working}
              className="flex-1 h-10 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] active:scale-[0.98] transition-all disabled:opacity-60"
            >
              Skip all
            </button>
            <button
              onClick={onDone}
              disabled={working}
              className="flex-1 h-10 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-muted)] active:scale-[0.98] transition-all disabled:opacity-60"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
