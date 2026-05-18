"use client";

import type { ReactNode } from "react";
import { saveSettings, type EnergyLevel, type Intention, type NowNextRank } from "@/lib/db";
import type { IntentionCategory } from "@/lib/categories";
import type { HomeTab } from "./HomeTabs";
import BucketGrid from "./BucketGrid";
import EnergyView from "./EnergyView";

interface BrainDumpVaultProps {
  open: boolean;
  targetRank: NowNextRank | null;
  nowFilled: boolean;
  nextFilled: boolean;
  intentions: Intention[];
  intentionCategories: IntentionCategory[];
  homeTab: HomeTab;
  editingIntentionId?: string | null;
  editSignal?: number;
  onOpenChange: (open: boolean) => void;
  onTargetRankChange: (rank: NowNextRank | null) => void;
  onHomeTabChange: (tab: HomeTab) => void;
  onOpenBrainDump: () => void;
  onPullToNowNext: (id: string, rank: NowNextRank) => Promise<void>;
  onComplete: (id: string, note: string, startTime: number, endTime: number, energy?: EnergyLevel | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategoryChange: (id: string, categoryId: string | null) => Promise<void>;
  onEnergyChange: (id: string, energy: EnergyLevel | null) => Promise<void>;
  onTextChange: (id: string, text: string) => Promise<void>;
}

function rankLabel(rank: NowNextRank): string {
  return rank === 0 ? "Now" : "Next";
}

function firstOpenRank(nowFilled: boolean, nextFilled: boolean): NowNextRank | null {
  if (!nowFilled) return 0;
  if (!nextFilled) return 1;
  return null;
}

function VaultTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-8 px-3.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
        active
          ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_10px_24px_-14px_var(--color-accent)]"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}

export default function BrainDumpVault({
  open,
  targetRank,
  nowFilled,
  nextFilled,
  intentions,
  intentionCategories,
  homeTab,
  editingIntentionId,
  editSignal = 0,
  onOpenChange,
  onTargetRankChange,
  onHomeTabChange,
  onOpenBrainDump,
  onPullToNowNext,
  onComplete,
  onDelete,
  onCategoryChange,
  onEnergyChange,
  onTextChange,
}: BrainDumpVaultProps) {
  const fallbackRank = firstOpenRank(nowFilled, nextFilled);
  const targetIsOpen =
    targetRank != null && (targetRank === 0 ? !nowFilled : !nextFilled);
  const effectiveRank = targetIsOpen ? targetRank : fallbackRank;
  const pullDisabled = effectiveRank == null;
  const pullLabel = effectiveRank == null ? "Two active" : `Pull to ${rankLabel(effectiveRank)}`;
  const targetCopy = effectiveRank == null
    ? "Now & Next are full."
    : `Choose one intention for ${rankLabel(effectiveRank)}.`;

  const setTab = (tab: HomeTab) => {
    if (tab === homeTab) return;
    onHomeTabChange(tab);
    void saveSettings({ homeTab: tab });
  };

  const handlePull = async (id: string) => {
    if (effectiveRank == null) return;
    await onPullToNowNext(id, effectiveRank);
    onTargetRankChange(null);
    onOpenChange(false);
  };

  return (
    <section className="glass-panel rounded-3xl border border-[var(--glass-border)] overflow-hidden animate-fade-in">
      <button
        type="button"
        onClick={() => {
          onOpenChange(!open);
          if (open) onTargetRankChange(null);
        }}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
            Brain Dump Vault
          </p>
          <p className="text-sm font-bold truncate">
            {intentions.length} {intentions.length === 1 ? "intention" : "intentions"} outside Now &amp; Next
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline text-xs font-semibold text-[var(--color-text-muted)]">
            {open ? targetCopy : "Collapsed"}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--glass-border)] px-4 pb-4 pt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">{targetCopy}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                The dashboard stays capped at two active intentions.
              </p>
            </div>
            <div
              role="tablist"
              aria-label="Group vault intentions by"
              className="glass-control inline-flex p-1 rounded-full self-start sm:self-auto"
            >
              <VaultTab active={homeTab === "life"} onClick={() => setTab("life")}>
                Life areas
              </VaultTab>
              <VaultTab active={homeTab === "energy"} onClick={() => setTab("energy")}>
                Energy
              </VaultTab>
            </div>
          </div>

          {intentions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/55 px-4 py-5">
              <p className="text-sm font-bold">The vault is empty.</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Capture the loose threads first; pull only one or two into motion.
              </p>
              <button
                onClick={onOpenBrainDump}
                className="mt-3 h-10 px-4 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-xs font-bold active:scale-[0.97] transition-all"
              >
                Brain dump
              </button>
            </div>
          ) : homeTab === "life" ? (
            <BucketGrid
              intentions={intentions}
              intentionCategories={intentionCategories}
              showEnergyLabel
              pullLabel={pullLabel}
              pullDisabled={pullDisabled}
              onPullToNowNext={handlePull}
              editingIntentionId={editingIntentionId}
              editSignal={editSignal}
              onComplete={onComplete}
              onDelete={onDelete}
              onCategoryChange={onCategoryChange}
              onEnergyChange={onEnergyChange}
              onTextChange={onTextChange}
            />
          ) : (
            <EnergyView
              intentions={intentions}
              intentionCategories={intentionCategories}
              pullLabel={pullLabel}
              pullDisabled={pullDisabled}
              onPullToNowNext={handlePull}
              editingIntentionId={editingIntentionId}
              editSignal={editSignal}
              onComplete={onComplete}
              onDelete={onDelete}
              onCategoryChange={onCategoryChange}
              onTextChange={onTextChange}
              onEnergyChange={onEnergyChange}
            />
          )}
        </div>
      )}
    </section>
  );
}
