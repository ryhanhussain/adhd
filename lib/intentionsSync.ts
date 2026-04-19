/**
 * Intentions sync — bridges local IndexedDB and Supabase.
 *
 * Design goals:
 *   1. Offline-first: local writes never block on the network.
 *   2. Last-write-wins per-row via `updatedAt` (epoch ms, client-set).
 *   3. Soft-delete via `deleted = true` so tombstones converge across devices.
 *   4. Account isolation: on sign-in as a different user, local intentions are
 *      cleared before pulling the new owner's data.
 *   5. Concurrency-safe: only one sync pass runs at a time; additional triggers
 *      while a pass is in flight are coalesced into a single follow-up pass.
 *
 * Triggered by:
 *   - Sign-in / user change (via `startIntentionsSync` in AuthProvider)
 *   - `intention-dirty` window events (dispatched by db.ts on every local write)
 *   - `visibilitychange` / `online` events (via `startIntentionsSync`)
 */

import { supabase } from "@/lib/supabase";
import {
  clearAllIntentions,
  getDirtyIntentions,
  getSettings,
  markIntentionsSynced,
  mergeRemoteIntention,
  saveSettings,
  type Intention,
} from "@/lib/db";

/** Shape of a row in the Supabase `intentions` table (snake_case). */
interface RemoteIntentionRow {
  id: string;
  user_id: string;
  text: string;
  log_date: string;
  completed: boolean;
  completed_at: number | null;
  entry_id: string | null;
  order_index: number;
  archived: boolean;
  deleted: boolean;
  category_id: string | null;
  created_at: number;
  updated_at: number;
}

function toRemote(intention: Intention, userId: string): RemoteIntentionRow {
  return {
    id: intention.id,
    user_id: userId,
    text: intention.text,
    log_date: intention.date,
    completed: intention.completed,
    completed_at: intention.completedAt,
    entry_id: intention.entryId,
    order_index: intention.order,
    archived: intention.archived ?? false,
    deleted: intention.deleted ?? false,
    category_id: intention.categoryId ?? null,
    created_at: intention.createdAt,
    updated_at: intention.updatedAt,
  };
}

function fromRemote(row: RemoteIntentionRow): Intention {
  return {
    id: row.id,
    text: row.text,
    date: row.log_date,
    completed: row.completed,
    completedAt: row.completed_at,
    entryId: row.entry_id,
    order: row.order_index,
    createdAt: row.created_at,
    archived: row.archived,
    deleted: row.deleted,
    categoryId: row.category_id ?? null,
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
export async function syncIntentionsNow(): Promise<void> {
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
      await syncIntentionsNow();
    }
  })();
  return running;
}

/** Runs a single paginated pull, returning whether any row was applied. */
async function pullOnce(userId: string): Promise<{ applied: boolean }> {
  const pullFrom = Math.max(0, (await getSettings()).lastIntentionPullAt);
  let newHighWater = pullFrom;
  let appliedAny = false;

  const pageSize = 500;
  let page = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("intentions")
      .select("*")
      .eq("user_id", userId)
      .gte("updated_at", pullFrom)
      .order("updated_at", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error) {
      console.warn("[intentionsSync] pull failed:", error.message);
      return { applied: appliedAny };
    }
    if (!data || data.length === 0) break;

    for (const row of data as RemoteIntentionRow[]) {
      const result = await mergeRemoteIntention(fromRemote(row));
      if (result === "applied") appliedAny = true;
      if (row.updated_at > newHighWater) newHighWater = row.updated_at;
    }

    if (data.length < pageSize) break;
    page += 1;
  }

  if (newHighWater > pullFrom) {
    await saveSettings({ lastIntentionPullAt: newHighWater });
  }
  return { applied: appliedAny };
}

async function pullAndPushOnce(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return; // Signed out — nothing to sync. Local data still works.

  const settings = await getSettings();

  // If the stored owner disagrees with the signed-in user, account switched.
  // Wipe local intentions before pulling to avoid leaking rows across accounts.
  if (settings.intentionSyncOwner && settings.intentionSyncOwner !== userId) {
    await clearAllIntentions();
    await saveSettings({ intentionSyncOwner: userId, lastIntentionPullAt: 0 });
  } else if (!settings.intentionSyncOwner) {
    await saveSettings({ intentionSyncOwner: userId });
  }

  // ----- PULL: fetch everything updated since our high-water mark. -----
  // Using `>= lastPullAt` catches rows written at the exact same ms we last
  // stopped; `mergeRemoteIntention` dedupes via last-write-wins so duplicates
  // are harmless.
  let appliedAny = (await pullOnce(userId)).applied;

  // ----- PUSH: upload every dirty local row. -----
  const dirty = await getDirtyIntentions();
  let pushed = false;
  if (dirty.length > 0) {
    // Chunk to stay well under Supabase's payload limits (~8MB) and keep each
    // RTT small.
    const chunkSize = 100;
    for (let i = 0; i < dirty.length; i += chunkSize) {
      const chunk = dirty.slice(i, i + chunkSize);
      const payload = chunk.map((row) => toRemote(row, userId));
      const { error } = await supabase
        .from("intentions")
        .upsert(payload, { onConflict: "id" });
      if (error) {
        console.warn("[intentionsSync] push failed:", error.message);
        break; // Stop; remaining rows stay dirty for the next cycle.
      }
      await markIntentionsSynced(chunk.map((row) => row.id));
      pushed = true;
    }
  }

  // ----- RECONCILE PULL -----
  // The Supabase trigger `stamp_intentions_updated_at` overrides our pushed
  // `updated_at` with the server's clock. Re-pulling lets us adopt the
  // server-authoritative timestamps locally, which is what makes the LWW
  // ordering robust against client clock skew between devices.
  if (pushed) {
    const second = await pullOnce(userId);
    if (second.applied) appliedAny = true;
  }

  // Notify the UI that local state changed from the remote side. Reusing the
  // existing `entry-updated` bus keeps all consumers (Home, Archive, etc.)
  // reactive without a new listener per component.
  if (appliedAny && typeof window !== "undefined") {
    window.dispatchEvent(new Event("entry-updated"));
  }
}

// --- Lifecycle -------------------------------------------------------------

type Unsubscribe = () => void;
let teardown: Unsubscribe | null = null;

/**
 * Begin syncing for the signed-in user. Idempotent: calling it again replaces
 * the previous listeners. Must be called after Supabase auth is resolved.
 */
export function startIntentionsSync(): Unsubscribe {
  stopIntentionsSync();

  const onDirty = () => {
    // Fire-and-forget; errors are logged inside the sync routine.
    void syncIntentionsNow();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncIntentionsNow();
  };
  const onOnline = () => {
    void syncIntentionsNow();
  };

  window.addEventListener("intention-dirty", onDirty);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);

  // Kick off an immediate pass so the UI populates with remote rows on mount.
  void syncIntentionsNow();

  teardown = () => {
    window.removeEventListener("intention-dirty", onDirty);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onOnline);
    teardown = null;
  };
  return teardown;
}

export function stopIntentionsSync(): void {
  teardown?.();
}

/**
 * Called on sign-out: stops listeners but leaves the owner pointer in place.
 * Keeping the owner sticky is what lets the next sign-in detect account
 * switches (pointer != new user id → wipe local before pulling). Local
 * intentions are intentionally preserved so the same user resumes cleanly
 * if they sign back in.
 */
export async function handleIntentionsSignOut(): Promise<void> {
  stopIntentionsSync();
}
