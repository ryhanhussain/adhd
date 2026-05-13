"use client";

import type { Entry, Habit, Intention } from "@/lib/db";
import type { IntentionCategory } from "@/lib/categories";
import { isTickedToday } from "@/lib/habits";
import { useHabits } from "@/lib/useHabits";
import { getEnergyLabel } from "@/lib/energy";

const STALE_AFTER_MS = 18 * 60 * 60 * 1000;

interface NowCoachCardProps {
  activeEntry?: Entry | null;
  hasPomodoro: boolean;
  focusedIntention?: Intention | null;
  intentions: Intention[];
  intentionCategories: IntentionCategory[];
  today: string;
  onFinishActive: () => void;
  onOpenBrainDump: () => void;
  onStartFocus: (intentionId?: string | null) => void;
  onSnoozeIntention: (id: string) => void;
  onReframeIntention: (id: string) => void;
  onArchiveIntention: (id: string) => void;
  onToggleHabit: (habit: Habit) => void;
}

interface CoachAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

function ageHours(ts: number): number {
  return Math.max(0, (Date.now() - ts) / 3_600_000);
}

function bucketNameFor(intention: Intention, buckets: IntentionCategory[]): string | null {
  if (!intention.categoryId) return null;
  return buckets.find((b) => b.id === intention.categoryId)?.name ?? null;
}

function pickBestIntention(intentions: Intention[]): Intention | null {
  if (intentions.length === 0) return null;
  const hour = new Date().getHours();
  const preferredEnergy =
    hour < 11 ? "high" : hour >= 18 ? "low" : hour >= 14 ? "medium" : null;

  return [...intentions].sort((a, b) => {
    const aEnergy = preferredEnergy && a.energy === preferredEnergy ? 2 : 0;
    const bEnergy = preferredEnergy && b.energy === preferredEnergy ? 2 : 0;
    const aAge = Math.min(4, ageHours(a.createdAt) / 24);
    const bAge = Math.min(4, ageHours(b.createdAt) / 24);
    const aScore = aEnergy + aAge - a.order * 0.01;
    const bScore = bEnergy + bAge - b.order * 0.01;
    return bScore - aScore;
  })[0];
}

function getTitleAndActions({
  activeEntry,
  hasPomodoro,
  focusedIntention,
  intentions,
  intentionCategories,
  today,
  habits,
  onFinishActive,
  onOpenBrainDump,
  onStartFocus,
  onSnoozeIntention,
  onReframeIntention,
  onArchiveIntention,
  onToggleHabit,
}: NowCoachCardProps & { habits: Habit[] }): {
  eyebrow: string;
  title: string;
  detail: string;
  actions: CoachAction[];
} {
  if (hasPomodoro) {
    const label = focusedIntention?.text ?? "Focus burst";
    return {
      eyebrow: "Best next move",
      title: "Stay with the session already in motion.",
      detail: label,
      actions: [],
    };
  }

  if (activeEntry) {
    return {
      eyebrow: "Best next move",
      title: "Close the loop on what is running now.",
      detail: activeEntry.summary || activeEntry.text,
      actions: [
        { label: "Finish", onClick: onFinishActive, primary: true },
      ],
    };
  }

  const stale = intentions.find(
    (i) => ageHours(i.createdAt) >= STALE_AFTER_MS / 3_600_000 && !i.lastReframedAt
  );
  if (stale) {
    const bucket = bucketNameFor(stale, intentionCategories);
    return {
      eyebrow: "Best next move",
      title: "This one might just need a smaller shape.",
      detail: bucket ? `${stale.text} · ${bucket}` : stale.text,
      actions: [
        { label: "Make smaller", onClick: () => onReframeIntention(stale.id), primary: true },
        { label: "Snooze", onClick: () => onSnoozeIntention(stale.id) },
        { label: "Archive", onClick: () => onArchiveIntention(stale.id) },
      ],
    };
  }

  const dueHabit = habits.find((habit) => !isTickedToday(habit, today));
  if (dueHabit) {
    return {
      eyebrow: "Best next move",
      title: "Anchor one small daily habit.",
      detail: dueHabit.name,
      actions: [
        { label: "Mark done", onClick: () => onToggleHabit(dueHabit), primary: true },
        { label: "Just Start", onClick: () => onStartFocus(null) },
      ],
    };
  }

  const best = pickBestIntention(intentions);
  if (best) {
    const bucket = bucketNameFor(best, intentionCategories);
    const energy = best.energy ? getEnergyLabel(best.energy) : null;
    return {
      eyebrow: "Best next move",
      title: "Pick one thread and give it a clean start.",
      detail: [best.text, bucket, energy].filter(Boolean).join(" · "),
      actions: [
        { label: "Focus", onClick: () => onStartFocus(best.id), primary: true },
        { label: "Make smaller", onClick: () => onReframeIntention(best.id) },
      ],
    };
  }

  return {
    eyebrow: "Best next move",
    title: "Start with capture, not perfect planning.",
    detail: "Add what is on your mind, or begin a 25-minute focus burst.",
    actions: [
      { label: "Brain dump", onClick: onOpenBrainDump, primary: true },
      { label: "Just Start", onClick: () => onStartFocus(null) },
    ],
  };
}

export default function NowCoachCard(props: NowCoachCardProps) {
  const habits = useHabits();
  const { eyebrow, title, detail, actions } = getTitleAndActions({ ...props, habits });

  return (
    <section className="glass-panel rounded-3xl border border-[var(--glass-border)] px-4 py-3 shadow-sm animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
            {eyebrow}
          </p>
          <h2 className="text-base font-bold tracking-tight leading-snug mt-0.5">
            {title}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] truncate mt-0.5">
            {detail}
          </p>
        </div>
        {actions.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide sm:flex-shrink-0">
            {actions.slice(0, 3).map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className={`h-10 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap active:scale-[0.98] transition-all ${
                  action.primary
                    ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-lg shadow-[var(--color-accent)]/15"
                    : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
