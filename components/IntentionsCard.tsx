"use client";

import type { Intention } from "@/lib/db";
import IntentionItem from "./IntentionItem";

interface IntentionsCardProps {
  intentions: Intention[];
  onComplete: (id: string, note: string, startTime: number, endTime: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function IntentionsCard({ intentions, onComplete, onDelete }: IntentionsCardProps) {
  if (intentions.length === 0) return null;

  const pending = intentions.filter((i) => !i.completed).length;
  const total = intentions.length;
  const completed = total - pending;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  // Hide the card entirely when all are completed (they've all moved to Ta-Da)
  if (pending === 0) return null;

  return (
    <section className="animate-fade-in">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 px-1">
        Daily Intentions
      </h2>
      <div className="bg-[var(--color-accent-soft)] rounded-2xl p-4 border border-[var(--color-accent)]/15 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--color-accent)]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Progress header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-[var(--color-text)]">
            {pending} remaining
          </span>
          <span className="text-xs text-[var(--color-accent)] font-medium tabular-nums">
            {completed}/{total}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1 rounded-full bg-[var(--color-border)]/40 mb-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Intention items — completed ones return null, pending show inline */}
        <div className="flex flex-col">
          {intentions.map((intention) => (
            <IntentionItem
              key={intention.id}
              intention={intention}
              onComplete={onComplete}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
