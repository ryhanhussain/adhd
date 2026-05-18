"use client";

import type { ReactNode } from "react";
import type { Entry, EnergyLevel, Intention, NowNextRank } from "@/lib/db";
import type { IntentionCategory } from "@/lib/categories";
import IntentionItem from "@/components/IntentionItem";

interface NowNextZoneProps {
  slots: [Intention | null, Intention | null];
  vaultCount: number;
  activeEntry?: Entry | null;
  hasPomodoro: boolean;
  focusedIntention?: Intention | null;
  intentionCategories: IntentionCategory[];
  focusedIntentionId?: string | null;
  onOpenVault: (rank: NowNextRank) => void;
  onOpenBrainDump: () => void;
  onStartFocus: (intentionId?: string | null) => void;
  onFinishActive: () => void;
  onClearSlot: (id: string) => Promise<void>;
  onSwapSlots: () => Promise<void>;
  onSnoozeIntention: (id: string) => Promise<void>;
  onArchiveIntention: (id: string) => Promise<void>;
  onComplete: (id: string, note: string, startTime: number, endTime: number, energy?: EnergyLevel | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategoryChange: (id: string, categoryId: string | null) => Promise<void>;
  onEnergyChange: (id: string, energy: EnergyLevel | null) => Promise<void>;
  onTextChange: (id: string, text: string) => Promise<void>;
}

const SLOT_LABELS: Record<NowNextRank, string> = {
  0: "Now",
  1: "Next",
};

function SmallAction({
  children,
  onClick,
  primary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-9 px-3 rounded-xl text-xs font-bold transition-all active:scale-[0.97] ${
        primary
          ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-lg shadow-[var(--color-accent)]/15"
          : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBanner({
  activeEntry,
  hasPomodoro,
  focusedIntention,
  onStartFocus,
  onFinishActive,
}: Pick<
  NowNextZoneProps,
  "activeEntry" | "hasPomodoro" | "focusedIntention" | "onStartFocus" | "onFinishActive"
>) {
  if (hasPomodoro) {
    return (
      <div className="rounded-2xl border border-[var(--color-accent)]/25 bg-[var(--color-accent-soft)] px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Active focus
          </p>
          <p className="text-sm font-semibold truncate">
            {focusedIntention?.text ?? "Focus burst"}
          </p>
        </div>
        <SmallAction onClick={() => onStartFocus()} primary>
          Open Focus
        </SmallAction>
      </div>
    );
  }

  if (!activeEntry) return null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          Timer running
        </p>
        <p className="text-sm font-semibold truncate">
          {activeEntry.summary || activeEntry.text}
        </p>
      </div>
      <SmallAction onClick={onFinishActive} primary>
        Finish
      </SmallAction>
    </div>
  );
}

function EmptySlot({
  rank,
  vaultCount,
  onOpenVault,
  onOpenBrainDump,
}: Pick<NowNextZoneProps, "vaultCount" | "onOpenVault" | "onOpenBrainDump"> & {
  rank: NowNextRank;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/55 px-3 py-4 min-h-[8.5rem] flex flex-col justify-center">
      <p className="text-sm font-bold">
        {SLOT_LABELS[rank]} is open.
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">
        Pull one intention out of the vault when you are ready to see it here.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <SmallAction onClick={() => onOpenVault(rank)} primary>
          Pull from vault
        </SmallAction>
        {vaultCount === 0 && (
          <SmallAction onClick={onOpenBrainDump}>
            Brain dump
          </SmallAction>
        )}
      </div>
    </div>
  );
}

function FilledSlot({
  rank,
  intention,
  canSwap,
  intentionCategories,
  focused,
  onClearSlot,
  onSwapSlots,
  onSnoozeIntention,
  onArchiveIntention,
  onStartFocus,
  onComplete,
  onDelete,
  onCategoryChange,
  onEnergyChange,
  onTextChange,
}: {
  rank: NowNextRank;
  intention: Intention;
  canSwap: boolean;
  intentionCategories: IntentionCategory[];
  focused: boolean;
} & Pick<
  NowNextZoneProps,
  | "onClearSlot"
  | "onSwapSlots"
  | "onSnoozeIntention"
  | "onArchiveIntention"
  | "onStartFocus"
  | "onComplete"
  | "onDelete"
  | "onCategoryChange"
  | "onEnergyChange"
  | "onTextChange"
>) {
  return (
    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--color-surface-elevated)]/70 p-3 min-h-[8.5rem] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-accent)]">
          {SLOT_LABELS[rank]}
        </span>
        <div className="flex gap-1.5">
          {canSwap && (
            <button
              onClick={() => void onSwapSlots()}
              className="h-7 px-2 rounded-lg text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-text)]/5 transition-colors"
            >
              Swap
            </button>
          )}
          <button
            onClick={() => void onClearSlot(intention.id)}
            className="h-7 px-2 rounded-lg text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-text)]/5 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <IntentionItem
        intention={intention}
        onComplete={onComplete}
        onDelete={onDelete}
        intentionCategories={intentionCategories}
        onCategoryChange={onCategoryChange}
        onEnergyChange={onEnergyChange}
        onTextChange={onTextChange}
        focused={focused}
        showEnergyLabel
      />

      <div className="flex flex-wrap gap-2">
        <SmallAction onClick={() => onStartFocus(intention.id)} primary>
          Focus
        </SmallAction>
        <SmallAction onClick={() => void onSnoozeIntention(intention.id)}>
          Snooze
        </SmallAction>
        <SmallAction onClick={() => void onArchiveIntention(intention.id)}>
          Archive
        </SmallAction>
      </div>
    </div>
  );
}

export default function NowNextZone({
  slots,
  vaultCount,
  activeEntry,
  hasPomodoro,
  focusedIntention,
  intentionCategories,
  focusedIntentionId,
  onOpenVault,
  onOpenBrainDump,
  onStartFocus,
  onFinishActive,
  onClearSlot,
  onSwapSlots,
  onSnoozeIntention,
  onArchiveIntention,
  onComplete,
  onDelete,
  onCategoryChange,
  onEnergyChange,
  onTextChange,
}: NowNextZoneProps) {
  const bothFilled = !!slots[0] && !!slots[1];

  return (
    <section className="glass-panel rounded-3xl border border-[var(--glass-border)] p-4 shadow-sm animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
            Rolling time block
          </p>
          <h2 className="text-2xl font-black tracking-tight leading-tight">
            Now &amp; Next
          </h2>
        </div>
        <div className="rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1 text-xs font-bold text-[var(--color-text-muted)] whitespace-nowrap">
          {vaultCount} in vault
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <StatusBanner
          activeEntry={activeEntry}
          hasPomodoro={hasPomodoro}
          focusedIntention={focusedIntention}
          onStartFocus={onStartFocus}
          onFinishActive={onFinishActive}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([0, 1] as NowNextRank[]).map((rank) => {
            const intention = slots[rank];
            return intention ? (
              <FilledSlot
                key={rank}
                rank={rank}
                intention={intention}
                canSwap={bothFilled}
                intentionCategories={intentionCategories}
                focused={focusedIntentionId === intention.id}
                onClearSlot={onClearSlot}
                onSwapSlots={onSwapSlots}
                onSnoozeIntention={onSnoozeIntention}
                onArchiveIntention={onArchiveIntention}
                onStartFocus={onStartFocus}
                onComplete={onComplete}
                onDelete={onDelete}
                onCategoryChange={onCategoryChange}
                onEnergyChange={onEnergyChange}
                onTextChange={onTextChange}
              />
            ) : (
              <EmptySlot
                key={rank}
                rank={rank}
                vaultCount={vaultCount}
                onOpenVault={onOpenVault}
                onOpenBrainDump={onOpenBrainDump}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
