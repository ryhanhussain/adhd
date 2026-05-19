/**
 * Life Areas sync — row-per-area LWW with archive preserving history.
 *
 * Triggered by:
 *   - Sign-in / user change (via AuthProvider)
 *   - `life-area-dirty` events from lib/db.ts
 *   - visibility/online/focus events
 */

import { supabase } from "@/lib/supabase";
import {
  clearAllLifeAreas,
  getDirtyLifeAreas,
  getSettings,
  markLifeAreasSynced,
  mergeRemoteLifeArea,
  saveSettings,
} from "@/lib/db";
import type { BucketIconKey } from "@/lib/categories";
import type { CoreValue, LifeArea } from "@/lib/lifeAreas";
import { normalizePersonalValueIds } from "@/lib/values";

interface RemoteLifeAreaRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  core_value: string | null;
  value_ids: string[] | null;
  sort_order: number;
  archived: boolean;
  deleted: boolean;
  created_at: number;
  updated_at: number;
}

function toRemote(area: LifeArea, userId: string): RemoteLifeAreaRow {
  return {
    id: area.id,
    user_id: userId,
    name: area.name,
    description: area.description,
    color: area.color,
    icon: area.icon,
    core_value: area.coreValue,
    value_ids: normalizePersonalValueIds(area.valueIds),
    sort_order: area.sortOrder,
    archived: area.archived,
    deleted: area.deleted ?? false,
    created_at: area.createdAt,
    updated_at: area.updatedAt,
  };
}

function fromRemote(row: RemoteLifeAreaRow): LifeArea {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon as BucketIconKey,
    coreValue: row.core_value as CoreValue | null,
    valueIds: normalizePersonalValueIds(row.value_ids),
    sortOrder: row.sort_order,
    archived: row.archived,
    deleted: row.deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.updated_at,
  };
}

let running: Promise<void> | null = null;
let pendingFollowUp = false;

export async function syncLifeAreasNow(): Promise<void> {
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
      await syncLifeAreasNow();
    }
  })();
  return running;
}

async function pullOnce(userId: string): Promise<{ applied: boolean }> {
  const pullFrom = Math.max(0, (await getSettings()).lastLifeAreaPullAt);
  let newHighWater = pullFrom;
  let appliedAny = false;

  const { data, error } = await supabase
    .from("life_areas")
    .select("*")
    .eq("user_id", userId)
    .gte("updated_at", pullFrom)
    .order("updated_at", { ascending: true });

  if (error) {
    console.warn("[lifeAreasSync] pull failed:", error.message);
    return { applied: appliedAny };
  }

  for (const row of (data ?? []) as RemoteLifeAreaRow[]) {
    const result = await mergeRemoteLifeArea(fromRemote(row));
    if (result === "applied") appliedAny = true;
    if (row.updated_at > newHighWater) newHighWater = row.updated_at;
  }

  if (newHighWater > pullFrom) {
    await saveSettings({ lastLifeAreaPullAt: newHighWater });
  }
  return { applied: appliedAny };
}

async function pullAndPushOnce(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const settings = await getSettings();
  if (settings.lifeAreaSyncOwner && settings.lifeAreaSyncOwner !== userId) {
    await clearAllLifeAreas();
    await saveSettings({ lifeAreaSyncOwner: userId, lastLifeAreaPullAt: 0 });
  } else if (!settings.lifeAreaSyncOwner) {
    await saveSettings({ lifeAreaSyncOwner: userId });
  }

  let appliedAny = (await pullOnce(userId)).applied;

  const dirty = await getDirtyLifeAreas();
  let pushed = false;
  if (dirty.length > 0) {
    const payload = dirty.map((area) => toRemote(area, userId));
    const { error } = await supabase
      .from("life_areas")
      .upsert(payload, { onConflict: "id" });
    if (error) {
      console.warn("[lifeAreasSync] push failed:", error.message);
    } else {
      await markLifeAreasSynced(dirty.map((area) => area.id));
      pushed = true;
    }
  }

  if (pushed) {
    const second = await pullOnce(userId);
    if (second.applied) appliedAny = true;
  }

  if (appliedAny && typeof window !== "undefined") {
    window.dispatchEvent(new Event("life-areas-updated"));
    window.dispatchEvent(new Event("entry-updated"));
  }
}

type Unsubscribe = () => void;
let teardown: Unsubscribe | null = null;

export function startLifeAreasSync(): Unsubscribe {
  stopLifeAreasSync();

  const onDirty = () => {
    void syncLifeAreasNow();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncLifeAreasNow();
  };
  const onOnline = () => {
    void syncLifeAreasNow();
  };

  window.addEventListener("life-area-dirty", onDirty);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);

  void syncLifeAreasNow();

  teardown = () => {
    window.removeEventListener("life-area-dirty", onDirty);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onOnline);
    teardown = null;
  };
  return teardown;
}

export function stopLifeAreasSync(): void {
  teardown?.();
}

export async function handleLifeAreasSignOut(): Promise<void> {
  stopLifeAreasSync();
}
