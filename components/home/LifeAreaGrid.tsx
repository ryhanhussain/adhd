"use client";

import { useEffect, useMemo, useState } from "react";
import type { Category, IntentionCategory } from "@/lib/categories";
import type { Entry, EnergyLevel, Intention } from "@/lib/db";
import { getEntriesForDateRange, toLocalDateStr } from "@/lib/db";
import { getEntryDuration } from "@/lib/analysis";
import { activeLifeAreas, getLifeAreaById, getLifeAreaValues, type LifeArea } from "@/lib/lifeAreas";
import { usePersonalValues } from "@/lib/usePersonalValues";
import BucketCard from "./BucketCard";

const UNTAGGED_KEY = "__untagged__";
const UNTAGGED_COLOR = "#a1a1aa";

function startOfWeek(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toLocalDateStr(d);
}

function endOfWeek(): string {
  const d = new Date(startOfWeek() + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return toLocalDateStr(d);
}

function WeeklyLifeAreaStrip({
  entries,
  lifeAreas,
}: {
  entries: Entry[];
  lifeAreas: LifeArea[];
}) {
  const active = activeLifeAreas(lifeAreas);
  const totals = new Map<string, number>();
  let total = 0;

  for (const entry of entries) {
    const mins = getEntryDuration(entry);
    if (mins <= 0) continue;
    const key = entry.lifeAreaId && getLifeAreaById(entry.lifeAreaId, lifeAreas) ? entry.lifeAreaId : UNTAGGED_KEY;
    totals.set(key, (totals.get(key) ?? 0) + mins);
    total += mins;
  }

  const rows = [
    ...active.map((area) => ({
      key: area.id,
      name: area.name,
      color: area.color,
      minutes: totals.get(area.id) ?? 0,
    })),
    {
      key: UNTAGGED_KEY,
      name: "Untagged",
      color: UNTAGGED_COLOR,
      minutes: totals.get(UNTAGGED_KEY) ?? 0,
    },
  ].filter((row) => row.minutes > 0);

  if (total <= 0) {
    return (
      <div className="h-2 rounded-full bg-[var(--color-border)]/50" title="No Life Area time logged this week yet" />
    );
  }

  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-[var(--color-border)]/45" aria-label="This week's time by Life Area">
      {rows.map((row) => (
        <div
          key={row.key}
          style={{
            width: `${Math.max(2, (row.minutes / total) * 100)}%`,
            backgroundColor: row.color,
          }}
          title={`${row.name}: ${Math.round(row.minutes)}m`}
        />
      ))}
    </div>
  );
}

interface LifeAreaGridProps {
  intentions: Intention[];
  lifeAreas: LifeArea[];
  intentionCategories: IntentionCategory[];
  categories: Category[];
  focusedIntentionId?: string | null;
  pullLabel?: string;
  pullDisabled?: boolean;
  onPullToNowNext?: (id: string) => Promise<void>;
  editingIntentionId?: string | null;
  editSignal?: number;
  onComplete: (id: string, note: string, startTime: number, endTime: number, energy?: EnergyLevel | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCategoryChange: (id: string, categoryId: string | null) => Promise<void>;
  onEnergyChange: (id: string, energy: EnergyLevel | null) => Promise<void>;
  onLifeAreaChange: (id: string, lifeAreaId: string | null) => Promise<void>;
  onPriorityChange: (id: string, priority: Intention["priority"] | null) => Promise<void>;
  onTextChange: (id: string, text: string) => Promise<void>;
}

export default function LifeAreaGrid({
  intentions,
  lifeAreas,
  intentionCategories,
  categories,
  focusedIntentionId,
  pullLabel,
  pullDisabled,
  onPullToNowNext,
  editingIntentionId,
  editSignal = 0,
  onComplete,
  onDelete,
  onCategoryChange,
  onEnergyChange,
  onLifeAreaChange,
  onPriorityChange,
  onTextChange,
}: LifeAreaGridProps) {
  const [weekEntries, setWeekEntries] = useState<Entry[]>([]);
  const personalValues = usePersonalValues();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries = await getEntriesForDateRange(startOfWeek(), endOfWeek());
      if (!cancelled) setWeekEntries(entries);
    };
    void load();
    const handler = () => void load();
    window.addEventListener("entry-updated", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("entry-updated", handler);
    };
  }, []);

  const sections = useMemo(() => {
    const active = activeLifeAreas(lifeAreas);
    const grouped = new Map<string, Intention[]>();
    for (const intention of intentions) {
      const area = getLifeAreaById(intention.lifeAreaId, lifeAreas);
      const key = area && !area.archived ? area.id : UNTAGGED_KEY;
      const arr = grouped.get(key) ?? [];
      arr.push(intention);
      grouped.set(key, arr);
    }
    for (const arr of grouped.values()) arr.sort((a, b) => a.order - b.order);

    const ordered = active.map((area) => ({
      key: area.id,
      name: area.name,
      description: area.description,
      color: area.color,
      icon: area.icon,
      valueChips: getLifeAreaValues(area, personalValues),
      items: grouped.get(area.id) ?? [],
    }));

    const untagged = grouped.get(UNTAGGED_KEY) ?? [];
    if (untagged.length > 0) {
      ordered.push({
        key: UNTAGGED_KEY,
        name: "Untagged",
        description: "Assign these when the meaning is clearer.",
        color: UNTAGGED_COLOR,
        icon: "sparkle",
        valueChips: [],
        items: untagged,
      });
    }

    return ordered;
  }, [intentions, lifeAreas, personalValues]);

  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="glass-panel rounded-2xl border border-[var(--glass-border)] px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
            This week by Life Area
          </p>
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">
            includes untagged
          </span>
        </div>
        <WeeklyLifeAreaStrip entries={weekEntries} lifeAreas={lifeAreas} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        {sections.map((section) => (
          <BucketCard
            key={section.key}
            sectionKey={section.key}
            name={section.name}
            description={section.description}
            color={section.color}
            icon={section.icon}
            valueChips={section.valueChips}
            items={section.items}
            intentionCategories={intentionCategories}
            lifeAreas={lifeAreas}
            categories={categories}
            focusedIntentionId={focusedIntentionId}
            showEnergyLabel
            pullLabel={pullLabel}
            pullDisabled={pullDisabled}
            onPullToNowNext={onPullToNowNext}
            editingIntentionId={editingIntentionId}
            editSignal={editSignal}
            onComplete={onComplete}
            onDelete={onDelete}
            onCategoryChange={onCategoryChange}
            onEnergyChange={onEnergyChange}
            onLifeAreaChange={onLifeAreaChange}
            onPriorityChange={onPriorityChange}
            onTextChange={onTextChange}
          />
        ))}
      </div>
    </div>
  );
}
