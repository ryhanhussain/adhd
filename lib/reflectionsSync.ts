/**
 * Reflections sync — bridges local IndexedDB and Supabase.
 *
 * Same design as intentionsSync.ts / entriesSync.ts, adapted for reflections.
 * The one notable difference: the conflict key for upsert is the composite
 * `user_id,log_date` (matching the table's composite PK) rather than a UUID.
 *
 * Triggered by:
 *   - Sign-in / user change (via `startReflectionsSync` in AuthProvider)
 *   - `reflection-dirty` window events (dispatched by db.ts on every local write)
 *   - `visibilitychange` / `online` / `focus` events
 */

import { supabase } from "@/lib/supabase";
import {
  clearAllReflections,
  getDirtyReflections,
  getSettings,
  markReflectionsSynced,
  mergeRemoteReflection,
  saveSettings,
  type Reflection,
} from "@/lib/db";

/** Shape of a row in the Supabase `reflections` table (snake_case). */
interface RemoteReflectionRow {
  user_id: string;
  log_date: string;
  mood: number;
  note: string;
  summary: string;
  deleted: boolean;
  created_at: number;
  updated_at: number;
}

function toRemote(reflection: Reflection, userId: string): RemoteReflectionRow {
  return {
    user_id: userId,
    log_date: reflection.date,
    mood: reflection.mood,
    note: reflection.note,
    summary: reflection.summary,
    deleted: reflection.deleted ?? false,
    created_at: reflection.createdAt,
    updated_at: reflection.updatedAt ?? reflection.createdAt,
  };
}

function fromRemote(row: RemoteReflectionRow): Reflection {
  return {
    date: row.log_date,
    mood: row.mood,
    note: row.note,
    summary: row.summary,
    createdAt: row.created_at,
    deleted: row.deleted,
    updatedAt: row.updated_at,
    syncedAt: row.updated_at,
  };
}

// --- Serialization -----------------------------------------------------------
let running: Promise<void> | null = null;
let pendingFollowUp = false;

export async function syncReflectionsNow(): Promise<void> {
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
      await syncReflectionsNow();
    }
  })();
  return running;
}

async function pullOnce(userId: string): Promise<{ applied: boolean }> {
  const pullFrom = Math.max(0, (await getSettings()).lastReflectionPullAt);
  let newHighWater = pullFrom;
  let appliedAny = false;

  const pageSize = 500;
  let page = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("reflections")
      .select("*")
      .eq("user_id", userId)
      .gte("updated_at", pullFrom)
      .order("updated_at", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error) {
      console.warn("[reflectionsSync] pull failed:", error.message);
      return { applied: appliedAny };
    }
    if (!data || data.length === 0) break;

    for (const row of data as RemoteReflectionRow[]) {
      const result = await mergeRemoteReflection(fromRemote(row));
      if (result === "applied") appliedAny = true;
      if (row.updated_at > newHighWater) newHighWater = row.updated_at;
    }

    if (data.length < pageSize) break;
    page += 1;
  }

  if (newHighWater > pullFrom) {
    await saveSettings({ lastReflectionPullAt: newHighWater });
  }
  return { applied: appliedAny };
}

async function pullAndPushOnce(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const settings = await getSettings();

  if (settings.reflectionSyncOwner && settings.reflectionSyncOwner !== userId) {
    await clearAllReflections();
    await saveSettings({ reflectionSyncOwner: userId, lastReflectionPullAt: 0 });
  } else if (!settings.reflectionSyncOwner) {
    await saveSettings({ reflectionSyncOwner: userId });
  }

  // ----- PULL -----
  let appliedAny = (await pullOnce(userId)).applied;

  // ----- PUSH -----
  const dirty = await getDirtyReflections();
  let pushed = false;
  if (dirty.length > 0) {
    // Reflections are one-per-day so the total count is tiny; no chunking needed.
    const payload = dirty.map((row) => toRemote(row, userId));
    const { error } = await supabase
      .from("reflections")
      .upsert(payload, { onConflict: "user_id,log_date" });
    if (error) {
      console.warn("[reflectionsSync] push failed:", error.message);
    } else {
      await markReflectionsSynced(dirty.map((r) => r.date));
      pushed = true;
    }
  }

  // ----- RECONCILE PULL -----
  if (pushed) {
    const second = await pullOnce(userId);
    if (second.applied) appliedAny = true;
  }

  if (appliedAny && typeof window !== "undefined") {
    window.dispatchEvent(new Event("entry-updated"));
  }
}

// --- Lifecycle ---------------------------------------------------------------

type Unsubscribe = () => void;
let teardown: Unsubscribe | null = null;

export function startReflectionsSync(): Unsubscribe {
  stopReflectionsSync();

  const onDirty = () => { void syncReflectionsNow(); };
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncReflectionsNow();
  };
  const onOnline = () => { void syncReflectionsNow(); };

  window.addEventListener("reflection-dirty", onDirty);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);

  void syncReflectionsNow();

  teardown = () => {
    window.removeEventListener("reflection-dirty", onDirty);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onOnline);
    teardown = null;
  };
  return teardown;
}

export function stopReflectionsSync(): void {
  teardown?.();
}

export async function handleReflectionsSignOut(): Promise<void> {
  stopReflectionsSync();
}
