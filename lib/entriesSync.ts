/**
 * Entries sync — bridges local IndexedDB and Supabase.
 *
 * Design goals (same as intentionsSync.ts):
 *   1. Offline-first: local writes never block on the network.
 *   2. Last-write-wins per-row via `updatedAt` (epoch ms, server-stamped).
 *   3. Soft-delete via `deleted = true` so tombstones converge across devices.
 *   4. Account isolation: on sign-in as a different user, local entries are
 *      cleared before pulling the new owner's data.
 *   5. Concurrency-safe: only one sync pass runs at a time; additional triggers
 *      while a pass is in flight are coalesced into a single follow-up pass.
 *
 * Triggered by:
 *   - Sign-in / user change (via `startEntriesSync` in AuthProvider)
 *   - `entry-dirty` window events (dispatched by db.ts on every local write)
 *   - `visibilitychange` / `online` / `focus` events
 */

import { supabase } from "@/lib/supabase";
import {
  clearAllEntries,
  getDirtyEntries,
  getSettings,
  markEntriesSynced,
  mergeRemoteEntry,
  saveSettings,
  type Entry,
} from "@/lib/db";

/** Shape of a row in the Supabase `entries` table (snake_case). */
interface RemoteEntryRow {
  id: string;
  user_id: string;
  text: string;
  timestamp: number;
  start_time: number;
  end_time: number;
  log_date: string;
  location: { lat: number; lng: number } | null;
  tags: string[];
  energy: string | null;
  summary: string | null;
  deleted: boolean;
  created_at: number;
  updated_at: number;
}

function toRemote(entry: Entry, userId: string): RemoteEntryRow {
  return {
    id: entry.id,
    user_id: userId,
    text: entry.text,
    timestamp: entry.timestamp,
    start_time: entry.startTime,
    end_time: entry.endTime,
    log_date: entry.date,
    location: entry.location ?? null,
    tags: entry.tags,
    energy: entry.energy ?? null,
    summary: entry.summary ?? null,
    deleted: entry.deleted ?? false,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt ?? entry.createdAt,
  };
}

function fromRemote(row: RemoteEntryRow): Entry {
  return {
    id: row.id,
    text: row.text,
    timestamp: row.timestamp,
    startTime: row.start_time,
    endTime: row.end_time,
    date: row.log_date,
    location: row.location,
    tags: row.tags,
    energy: row.energy as Entry["energy"],
    summary: row.summary,
    createdAt: row.created_at,
    deleted: row.deleted,
    updatedAt: row.updated_at,
    syncedAt: row.updated_at,
  };
}

// --- Serialization: at most one sync in flight, one follow-up queued. --------
let running: Promise<void> | null = null;
let pendingFollowUp = false;

/**
 * Runs a full sync cycle (pull then push). If a sync is already in flight,
 * queues at most one follow-up so we don't drop the latest trigger but also
 * don't stack up work.
 */
export async function syncEntriesNow(): Promise<void> {
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
      await syncEntriesNow();
    }
  })();
  return running;
}

/** Runs a single paginated pull, returning whether any row was applied. */
async function pullOnce(userId: string): Promise<{ applied: boolean }> {
  const pullFrom = Math.max(0, (await getSettings()).lastEntryPullAt);
  let newHighWater = pullFrom;
  let appliedAny = false;

  const pageSize = 500;
  let page = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", userId)
      .gte("updated_at", pullFrom)
      .order("updated_at", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error) {
      console.warn("[entriesSync] pull failed:", error.message);
      return { applied: appliedAny };
    }
    if (!data || data.length === 0) break;

    for (const row of data as RemoteEntryRow[]) {
      const result = await mergeRemoteEntry(fromRemote(row));
      if (result === "applied") appliedAny = true;
      if (row.updated_at > newHighWater) newHighWater = row.updated_at;
    }

    if (data.length < pageSize) break;
    page += 1;
  }

  if (newHighWater > pullFrom) {
    await saveSettings({ lastEntryPullAt: newHighWater });
  }
  return { applied: appliedAny };
}

async function pullAndPushOnce(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return; // Signed out — nothing to sync.

  const settings = await getSettings();

  // Account-switch detection: wipe local entries before pulling the new owner's data.
  if (settings.entrySyncOwner && settings.entrySyncOwner !== userId) {
    await clearAllEntries();
    await saveSettings({ entrySyncOwner: userId, lastEntryPullAt: 0 });
  } else if (!settings.entrySyncOwner) {
    await saveSettings({ entrySyncOwner: userId });
  }

  // ----- PULL -----
  let appliedAny = (await pullOnce(userId)).applied;

  // ----- PUSH -----
  const dirty = await getDirtyEntries();
  let pushed = false;
  if (dirty.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < dirty.length; i += chunkSize) {
      const chunk = dirty.slice(i, i + chunkSize);
      const payload = chunk.map((row) => toRemote(row, userId));
      const { error } = await supabase
        .from("entries")
        .upsert(payload, { onConflict: "id" });
      if (error) {
        console.warn("[entriesSync] push failed:", error.message);
        break; // Remaining rows stay dirty for the next cycle.
      }
      await markEntriesSynced(chunk.map((row) => row.id));
      pushed = true;
    }
  }

  // ----- RECONCILE PULL -----
  // The Supabase trigger `stamp_entry_updated_at` overrides our pushed
  // `updated_at` with the server's clock. Re-pulling adopts server-authoritative
  // timestamps locally, making LWW robust against client clock skew.
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

/**
 * Begin syncing for the signed-in user. Idempotent — calling it again replaces
 * the previous listeners.
 */
export function startEntriesSync(): Unsubscribe {
  stopEntriesSync();

  const onDirty = () => { void syncEntriesNow(); };
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncEntriesNow();
  };
  const onOnline = () => { void syncEntriesNow(); };

  window.addEventListener("entry-dirty", onDirty);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);

  // Immediate pass to populate UI with remote rows on mount.
  void syncEntriesNow();

  teardown = () => {
    window.removeEventListener("entry-dirty", onDirty);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onOnline);
    teardown = null;
  };
  return teardown;
}

export function stopEntriesSync(): void {
  teardown?.();
}

/**
 * Called on sign-out: stops listeners but leaves the owner pointer in place.
 * Keeping the owner sticky lets the next sign-in detect account switches
 * (pointer != new user id → wipe local before pulling).
 */
export async function handleEntriesSignOut(): Promise<void> {
  stopEntriesSync();
}
