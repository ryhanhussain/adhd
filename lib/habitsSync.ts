/**
 * Habits sync — bridges local IndexedDB and Supabase.
 *
 * Mirrors lib/intentionsSync.ts almost verbatim. The one notable divergence
 * is inside `mergeRemoteHabit` (lib/db.ts): the `completions` array merges
 * as a UNION of local + remote dates rather than wholesale LWW replacement.
 * This is what protects against an offline device losing its ticks if it
 * reconnects after the other device's row has been server-stamped newer.
 *
 * Triggered by:
 *   - Sign-in / user change (via `startHabitsSync` in AuthProvider)
 *   - `habit-dirty` window events (dispatched by db.ts on every local write)
 *   - `visibilitychange` / `online` events
 */

import { supabase } from "@/lib/supabase";
import {
  clearAllHabits,
  getDirtyHabits,
  getSettings,
  markHabitsSynced,
  mergeRemoteHabit,
  normaliseCompletions,
  saveSettings,
  type Habit,
} from "@/lib/db";
import type { BucketIconKey } from "@/lib/categories";

interface RemoteHabitRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  life_area_id: string | null;
  order_index: number;
  completions: unknown; // jsonb — defensively normalised in fromRemote
  last_untick_at: number | null;
  deleted: boolean;
  created_at: number;
  updated_at: number;
}

function toRemote(habit: Habit, userId: string): RemoteHabitRow {
  return {
    id: habit.id,
    user_id: userId,
    name: habit.name,
    color: habit.color,
    icon: habit.icon ?? null,
    life_area_id: habit.lifeAreaId ?? null,
    order_index: habit.order,
    completions: habit.completions,
    last_untick_at: habit.lastUntickAt,
    deleted: habit.deleted ?? false,
    created_at: habit.createdAt,
    updated_at: habit.updatedAt,
  };
}

function fromRemote(row: RemoteHabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: (row.icon ?? undefined) as BucketIconKey | undefined,
    lifeAreaId: row.life_area_id ?? null,
    order: row.order_index,
    completions: normaliseCompletions(row.completions),
    lastUntickAt: row.last_untick_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted,
    syncedAt: row.updated_at,
  };
}

// --- Serialization ---------------------------------------------------------
let running: Promise<void> | null = null;
let pendingFollowUp = false;

export async function syncHabitsNow(): Promise<void> {
  if (running) {
    pendingFollowUp = true;
    return running;
  }
  running = (async () => {
    try {
      await pullAndPushOnce();
    } finally {
      running = null;
    }
    if (pendingFollowUp) {
      pendingFollowUp = false;
      await syncHabitsNow();
    }
  })();
  return running;
}

async function pullOnce(userId: string): Promise<{ applied: boolean }> {
  const pullFrom = Math.max(0, (await getSettings()).lastHabitPullAt);
  let newHighWater = pullFrom;
  let appliedAny = false;

  const pageSize = 500;
  let page = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("habits")
      .select("*")
      .eq("user_id", userId)
      .gte("updated_at", pullFrom)
      .order("updated_at", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error) {
      console.warn("[habitsSync] pull failed:", error.message);
      return { applied: appliedAny };
    }
    if (!data || data.length === 0) break;

    for (const row of data as RemoteHabitRow[]) {
      const result = await mergeRemoteHabit(fromRemote(row));
      if (result === "applied") appliedAny = true;
      if (row.updated_at > newHighWater) newHighWater = row.updated_at;
    }

    if (data.length < pageSize) break;
    page += 1;
  }

  if (newHighWater > pullFrom) {
    await saveSettings({ lastHabitPullAt: newHighWater });
  }
  return { applied: appliedAny };
}

async function pullAndPushOnce(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const settings = await getSettings();

  if (settings.habitSyncOwner && settings.habitSyncOwner !== userId) {
    await clearAllHabits();
    await saveSettings({ habitSyncOwner: userId, lastHabitPullAt: 0 });
  } else if (!settings.habitSyncOwner) {
    await saveSettings({ habitSyncOwner: userId });
  }

  let appliedAny = (await pullOnce(userId)).applied;

  const dirty = await getDirtyHabits();
  let pushed = false;
  if (dirty.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < dirty.length; i += chunkSize) {
      const chunk = dirty.slice(i, i + chunkSize);
      const payload = chunk.map((row) => toRemote(row, userId));
      const { error } = await supabase
        .from("habits")
        .upsert(payload, { onConflict: "id" });
      if (error) {
        console.warn("[habitsSync] push failed:", error.message);
        break;
      }
      await markHabitsSynced(chunk.map((row) => row.id));
      pushed = true;
    }
  }

  if (pushed) {
    const second = await pullOnce(userId);
    if (second.applied) appliedAny = true;
  }

  if (appliedAny && typeof window !== "undefined") {
    window.dispatchEvent(new Event("habit-updated"));
    // Also wake any consumers listening to the shared `entry-updated` bus so
    // existing reactive UI surfaces (no per-component listener required).
    window.dispatchEvent(new Event("entry-updated"));
  }
}

// --- Lifecycle -------------------------------------------------------------
type Unsubscribe = () => void;
let teardown: Unsubscribe | null = null;

export function startHabitsSync(): Unsubscribe {
  stopHabitsSync();

  const onDirty = () => {
    void syncHabitsNow();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncHabitsNow();
  };
  const onOnline = () => {
    void syncHabitsNow();
  };

  window.addEventListener("habit-dirty", onDirty);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);

  void syncHabitsNow();

  teardown = () => {
    window.removeEventListener("habit-dirty", onDirty);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onOnline);
    teardown = null;
  };
  return teardown;
}

export function stopHabitsSync(): void {
  teardown?.();
}

export async function handleHabitsSignOut(): Promise<void> {
  stopHabitsSync();
}
