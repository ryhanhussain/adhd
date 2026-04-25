import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/** Returns a YYYY-MM-DD string in the user's local timezone (not UTC). */
export function toLocalDateStr(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Maps an "HH:MM" time onto a local YYYY-MM-DD date, returning the local epoch ms. DST-safe. */
export function timeStringToTimestampOnDate(hhmm: string, dateStr: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

/** Clamps an epoch ms timestamp to the local-day window [00:00:00.000, 23:59:59.999] of dateStr. */
export function clampToLocalDate(ts: number, dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dayStart = new Date(y, mo - 1, d, 0, 0, 0, 0).getTime();
  const dayEnd = new Date(y, mo - 1, d, 23, 59, 59, 999).getTime();
  return Math.min(Math.max(ts, dayStart), dayEnd);
}

export type EnergyLevel = "high" | "medium" | "low" | "scattered";

export interface Entry {
  id: string;
  text: string;
  timestamp: number;
  startTime: number;
  endTime: number;
  date: string; // YYYY-MM-DD
  location: { lat: number; lng: number } | null;
  tags: string[];
  energy?: EnergyLevel | null;
  summary?: string | null;
  createdAt: number;
  // --- sync metadata (v7) ---
  updatedAt?: number;        // epoch ms of last local or remote write; drives LWW merge
  deleted?: boolean;         // soft-delete tombstone so other devices observe the removal
  syncedAt?: number | null;  // updatedAt value at the moment of the last successful push; null = dirty
}

export interface Reflection {
  date: string; // YYYY-MM-DD (primary key)
  mood: number; // 1-5
  note: string;
  summary: string; // AI-generated accomplishment summary
  createdAt: number;
  // --- sync metadata (v7) ---
  updatedAt?: number;
  deleted?: boolean;
  syncedAt?: number | null;
}

export interface Settings {
  customCategories: string | null;
  theme: string | null; // "light" | "dark" | "system"
  lastSeenMilestone: string | null; // e.g. "7" or "30"
  lastCarryoverPromptDate: string | null; // YYYY-MM-DD of last day the carryover prompt was shown
  /** Supabase user id whose intentions are currently mirrored in this browser. */
  intentionSyncOwner: string | null;
  /** High-water mark for remote `updated_at` values already pulled into local. */
  lastIntentionPullAt: number;
  // --- entries/reflections sync (v7) ---
  entrySyncOwner: string | null;
  lastEntryPullAt: number;
  reflectionSyncOwner: string | null;
  lastReflectionPullAt: number;
  /** Epoch ms timestamp of the last local categories write; used for LWW push/pull. */
  categoriesSyncedAt: number;
  // --- intention categories (v8) ---
  /** JSON-encoded array of IntentionCategory; null = user has no buckets (flat list fallback). */
  customIntentionCategories: string | null;
  /** Epoch ms timestamp of the last local intention-categories write; used for LWW push/pull. */
  intentionCategoriesSyncedAt: number;
  /**
   * Epoch ms timestamp of the last local write to `lastCarryoverPromptDate`.
   * Synced via the same `profiles` row as categories so a carry-over performed
   * on one device prevents the prompt from re-firing on another. Stamped
   * automatically by `saveSettings` whenever `lastCarryoverPromptDate` is set.
   */
  lastCarryoverPromptDateSyncedAt: number;
}

export interface Intention {
  id: string;
  text: string;
  date: string; // YYYY-MM-DD (original date the intention was created for)
  completed: boolean;
  completedAt: number | null;
  entryId: string | null; // links to Entry created on completion
  order: number;
  createdAt: number;
  archived?: boolean; // true = user declined carryover or auto-archived; hidden from Home
  // --- intention categories (v8) ---
  /** id of an IntentionCategory; null = uncategorized; unknown id renders as uncategorized. */
  categoryId?: string | null;
  /**
   * id of the previous-day intention this row was cloned from on carry-over.
   * Walking the chain to its root yields the user-perceived "single task" so
   * analysis can dedupe carry-over clones, and CarryoverPrompt can stay
   * idempotent across devices (skip cloning if today already has a row whose
   * carriedFromId matches the candidate).
   */
  carriedFromId?: string | null;
  // --- sync metadata (v6) ---
  updatedAt: number;         // epoch ms of the last local or remote write; drives last-write-wins merge
  deleted?: boolean;         // soft-delete tombstone so other devices observe the removal
  syncedAt?: number | null;  // updatedAt value at the moment of the last successful push; null = dirty
}

const pendingEntryDeletions = new Set<string>();

export function markEntryPendingDelete(id: string) {
  pendingEntryDeletions.add(id);
}

export function unmarkEntryPendingDelete(id: string) {
  pendingEntryDeletions.delete(id);
}

interface ADDitDB extends DBSchema {
  entries: {
    key: string;
    value: Entry;
    indexes: { "by-date": string };
  };
  settings: {
    key: string;
    value: string;
  };
  reflections: {
    key: string;
    value: Reflection;
  };
  intentions: {
    key: string;
    value: Intention;
    indexes: { "by-date": string };
  };
}

let dbPromise: Promise<IDBPDatabase<ADDitDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ADDitDB>("addit-db", 8, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const entryStore = db.createObjectStore("entries", { keyPath: "id" });
          entryStore.createIndex("by-date", "date");
          db.createObjectStore("settings");
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("reflections")) {
            db.createObjectStore("reflections", { keyPath: "date" });
          }
        }
        // v3: energy field added to Entry interface (optional, no store changes needed)
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains("intentions")) {
            const intentionStore = db.createObjectStore("intentions", { keyPath: "id" });
            intentionStore.createIndex("by-date", "date");
          }
        }
        // v5: archived field added to Intention (optional, no store changes needed)
        //
        // v6: sync metadata backfill for intentions.
        // v7: sync metadata backfill for entries and reflections.
        // v8: categoryId added to Intention (optional, defaults to undefined → "uncategorized")
        //     and customIntentionCategories/intentionCategoriesSyncedAt added to Settings.
        //     No store changes; Settings keys default to null/0 when absent.
        //
        // Both backfills share a single async block so that any upgrade path
        // (e.g. fresh install → v7, or v3 → v7) runs whatever is needed in
        // one transaction without the early-return of the old v6 block
        // swallowing the v7 pass.
        const needsV6Backfill = oldVersion < 6 && db.objectStoreNames.contains("intentions");
        const needsV7Backfill = oldVersion < 7;

        if (needsV6Backfill || needsV7Backfill) {
          return (async () => {
            const now = Date.now();

            if (needsV6Backfill) {
              const store = tx.objectStore("intentions");
              let cursor = await store.openCursor();
              while (cursor) {
                const value = cursor.value as Intention;
                const needsBackfill =
                  typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt);
                if (needsBackfill) {
                  const ts = value.completedAt ?? value.createdAt ?? now;
                  await cursor.update({
                    ...value,
                    updatedAt: ts,
                    deleted: value.deleted ?? false,
                    syncedAt: null,
                  });
                }
                cursor = await cursor.continue();
              }
            }

            if (needsV7Backfill && db.objectStoreNames.contains("entries")) {
              const store = tx.objectStore("entries");
              let cursor = await store.openCursor();
              while (cursor) {
                const value = cursor.value as Entry;
                const needsBackfill =
                  typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt);
                if (needsBackfill) {
                  const ts = value.startTime ?? value.timestamp ?? value.createdAt ?? now;
                  await cursor.update({
                    ...value,
                    updatedAt: ts,
                    deleted: value.deleted ?? false,
                    syncedAt: null,
                  });
                }
                cursor = await cursor.continue();
              }
            }

            if (needsV7Backfill && db.objectStoreNames.contains("reflections")) {
              const store = tx.objectStore("reflections");
              let cursor = await store.openCursor();
              while (cursor) {
                const value = cursor.value as Reflection;
                const needsBackfill =
                  typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt);
                if (needsBackfill) {
                  const ts = value.createdAt ?? now;
                  await cursor.update({
                    ...value,
                    updatedAt: ts,
                    deleted: value.deleted ?? false,
                    syncedAt: null,
                  });
                }
                cursor = await cursor.continue();
              }
            }
          })();
        }
      },
      blocked() {
        console.warn("IndexedDB upgrade blocked — close other tabs using this app");
      },
      blocking() {
        // Close connection so new HMR context can upgrade safely
        if (dbPromise) {
          dbPromise.then((db) => db.close());
          dbPromise = null;
        }
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Dirty-event helpers — separate from the UI `entry-updated` event.
// `entry-dirty` / `reflection-dirty` wake up the sync layer.
// `entry-updated` wakes up UI components (kept as-is).
// ---------------------------------------------------------------------------

function ENTRY_DIRTY_EVENT() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("entry-dirty"));
  }
}

function REFLECTION_DIRTY_EVENT() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("reflection-dirty"));
  }
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function addEntry(entry: Entry): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  await db.put("entries", {
    ...entry,
    updatedAt: entry.updatedAt ?? now,
    deleted: entry.deleted ?? false,
    syncedAt: null,
  });
  ENTRY_DIRTY_EVENT();
}

export async function getEntriesByDate(date: string): Promise<Entry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex("entries", "by-date", date);
  return entries
    .filter((e) => !e.deleted && !pendingEntryDeletions.has(e.id))
    .sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));
}

export async function getEntriesForDateRange(startDate: string, endDate: string): Promise<Entry[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(startDate, endDate);
  const entries = await db.getAllFromIndex("entries", "by-date", range);
  return entries
    .filter((e) => !e.deleted && !pendingEntryDeletions.has(e.id))
    .sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));
}

export async function getAllEntries(): Promise<Entry[]> {
  const db = await getDB();
  const all = await db.getAll("entries");
  return all.filter((e) => !e.deleted && !pendingEntryDeletions.has(e.id));
}

/**
 * Returns entries with `date >= sinceDate` (YYYY-MM-DD), using the `by-date`
 * index for a bounded read. Use this for streak/garden/insights computations
 * instead of `getAllEntries()` so the query cost stays constant as a user's
 * history grows.
 */
export async function getEntriesSince(sinceDate: string): Promise<Entry[]> {
  const db = await getDB();
  const range = IDBKeyRange.lowerBound(sinceDate);
  const entries = await db.getAllFromIndex("entries", "by-date", range);
  return entries.filter((e) => !e.deleted && !pendingEntryDeletions.has(e.id));
}

/**
 * Counts distinct local dates that have at least one non-deleted entry. Used by
 * the AI-analysis gate, which unlocks after the user has logged on 7+ separate
 * days. Bounded read over the last 400 days, matching `getEntriesSince` cost.
 */
export async function getDistinctEntryDateCount(): Promise<number> {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 399);
  const sinceDate = toLocalDateStr(cutoff);
  const entries = await getEntriesSince(sinceDate);
  const dates = new Set<string>();
  for (const e of entries) dates.add(e.date);
  return dates.size;
}

export async function searchEntries(query: string): Promise<Entry[]> {
  const db = await getDB();
  const all = await db.getAll("entries");
  const lower = query.toLowerCase();
  return all
    .filter((e) => !e.deleted && !pendingEntryDeletions.has(e.id))
    .filter((e) => e.text.toLowerCase().includes(lower) || e.tags.some((t) => t.toLowerCase().includes(lower)))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function updateEntryTags(id: string, tags: string[]): Promise<void> {
  const db = await getDB();
  const entry = await db.get("entries", id);
  if (entry) {
    await db.put("entries", {
      ...entry,
      tags,
      updatedAt: Date.now(),
      syncedAt: null,
    });
    ENTRY_DIRTY_EVENT();
  }
}

export async function updateEntry(
  id: string,
  updates: Partial<Omit<Entry, "id" | "createdAt">>
): Promise<Entry | null> {
  const db = await getDB();
  const entry = await db.get("entries", id);
  if (!entry) return null;
  const updated: Entry = {
    ...entry,
    ...updates,
    updatedAt: Date.now(),
    syncedAt: null,
  };
  if (updates.startTime !== undefined) {
    updated.date = toLocalDateStr(updates.startTime);
  }
  await db.put("entries", updated);
  ENTRY_DIRTY_EVENT();
  return updated;
}

/**
 * Soft-delete: marks the row as deleted and dirty so the tombstone propagates
 * via sync. Local queries already filter `deleted === true`.
 */
export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  const entry = await db.get("entries", id);
  if (entry) {
    await db.put("entries", {
      ...entry,
      deleted: true,
      updatedAt: Date.now(),
      syncedAt: null,
    });
    ENTRY_DIRTY_EVENT();
  }
  unmarkEntryPendingDelete(id);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const customCategories = (await db.get("settings", "customCategories")) || null;
  const theme = (await db.get("settings", "theme")) || null;
  const lastSeenMilestone = (await db.get("settings", "lastSeenMilestone")) || null;
  const lastCarryoverPromptDate = (await db.get("settings", "lastCarryoverPromptDate")) || null;
  const intentionSyncOwner = (await db.get("settings", "intentionSyncOwner")) || null;
  const lastIntentionPullAtRaw = (await db.get("settings", "lastIntentionPullAt")) || "0";
  const lastIntentionPullAt = Number.parseInt(lastIntentionPullAtRaw, 10) || 0;
  const entrySyncOwner = (await db.get("settings", "entrySyncOwner")) || null;
  const lastEntryPullAtRaw = (await db.get("settings", "lastEntryPullAt")) || "0";
  const lastEntryPullAt = Number.parseInt(lastEntryPullAtRaw, 10) || 0;
  const reflectionSyncOwner = (await db.get("settings", "reflectionSyncOwner")) || null;
  const lastReflectionPullAtRaw = (await db.get("settings", "lastReflectionPullAt")) || "0";
  const lastReflectionPullAt = Number.parseInt(lastReflectionPullAtRaw, 10) || 0;
  const categoriesSyncedAtRaw = (await db.get("settings", "categoriesSyncedAt")) || "0";
  const categoriesSyncedAt = Number.parseInt(categoriesSyncedAtRaw, 10) || 0;
  const customIntentionCategories = (await db.get("settings", "customIntentionCategories")) || null;
  const intentionCategoriesSyncedAtRaw = (await db.get("settings", "intentionCategoriesSyncedAt")) || "0";
  const intentionCategoriesSyncedAt = Number.parseInt(intentionCategoriesSyncedAtRaw, 10) || 0;
  const lastCarryoverPromptDateSyncedAtRaw = (await db.get("settings", "lastCarryoverPromptDateSyncedAt")) || "0";
  const lastCarryoverPromptDateSyncedAt = Number.parseInt(lastCarryoverPromptDateSyncedAtRaw, 10) || 0;
  return {
    customCategories,
    theme,
    lastSeenMilestone,
    lastCarryoverPromptDate,
    intentionSyncOwner,
    lastIntentionPullAt,
    entrySyncOwner,
    lastEntryPullAt,
    reflectionSyncOwner,
    lastReflectionPullAt,
    categoriesSyncedAt,
    customIntentionCategories,
    intentionCategoriesSyncedAt,
    lastCarryoverPromptDateSyncedAt,
  };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const db = await getDB();
  if (settings.customCategories !== undefined) {
    await db.put("settings", settings.customCategories || "", "customCategories");
  }
  if (settings.theme !== undefined) {
    await db.put("settings", settings.theme || "system", "theme");
  }
  if (settings.lastSeenMilestone !== undefined) {
    await db.put("settings", settings.lastSeenMilestone || "", "lastSeenMilestone");
  }
  if (settings.lastCarryoverPromptDate !== undefined) {
    await db.put("settings", settings.lastCarryoverPromptDate || "", "lastCarryoverPromptDate");
    // Auto-stamp the LWW timestamp unless caller is explicitly setting it
    // (e.g. categoriesSync after applying a remote pull). This makes every
    // local carryover-prompt write dirty for push without each call site
    // having to remember.
    if (settings.lastCarryoverPromptDateSyncedAt === undefined) {
      await db.put("settings", String(Date.now()), "lastCarryoverPromptDateSyncedAt");
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("carryover-prompt-date-dirty"));
    }
  }
  if (settings.intentionSyncOwner !== undefined) {
    await db.put("settings", settings.intentionSyncOwner || "", "intentionSyncOwner");
  }
  if (settings.lastIntentionPullAt !== undefined) {
    await db.put("settings", String(settings.lastIntentionPullAt ?? 0), "lastIntentionPullAt");
  }
  if (settings.entrySyncOwner !== undefined) {
    await db.put("settings", settings.entrySyncOwner || "", "entrySyncOwner");
  }
  if (settings.lastEntryPullAt !== undefined) {
    await db.put("settings", String(settings.lastEntryPullAt ?? 0), "lastEntryPullAt");
  }
  if (settings.reflectionSyncOwner !== undefined) {
    await db.put("settings", settings.reflectionSyncOwner || "", "reflectionSyncOwner");
  }
  if (settings.lastReflectionPullAt !== undefined) {
    await db.put("settings", String(settings.lastReflectionPullAt ?? 0), "lastReflectionPullAt");
  }
  if (settings.categoriesSyncedAt !== undefined) {
    await db.put("settings", String(settings.categoriesSyncedAt ?? 0), "categoriesSyncedAt");
  }
  if (settings.customIntentionCategories !== undefined) {
    await db.put("settings", settings.customIntentionCategories || "", "customIntentionCategories");
  }
  if (settings.intentionCategoriesSyncedAt !== undefined) {
    await db.put("settings", String(settings.intentionCategoriesSyncedAt ?? 0), "intentionCategoriesSyncedAt");
  }
  if (settings.lastCarryoverPromptDateSyncedAt !== undefined) {
    await db.put(
      "settings",
      String(settings.lastCarryoverPromptDateSyncedAt ?? 0),
      "lastCarryoverPromptDateSyncedAt"
    );
  }
}

// ---------------------------------------------------------------------------
// Reflections
// ---------------------------------------------------------------------------

export async function addReflection(reflection: Reflection): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  await db.put("reflections", {
    ...reflection,
    updatedAt: reflection.updatedAt ?? now,
    deleted: reflection.deleted ?? false,
    syncedAt: null,
  });
  REFLECTION_DIRTY_EVENT();
}

export async function getReflectionByDate(date: string): Promise<Reflection | undefined> {
  const db = await getDB();
  const r = await db.get("reflections", date);
  return r?.deleted ? undefined : r;
}

// ---------------------------------------------------------------------------
// Intentions
//
// Every write stamps `updatedAt = now` and clears `syncedAt` so the sync layer
// knows the row is dirty. Removal is a soft-delete (`deleted = true`) so other
// devices can observe the tombstone and converge; queries filter tombstones out.
// ---------------------------------------------------------------------------
function INTENTION_UPDATED_EVENT() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("intention-dirty"));
  }
}

export async function addIntentions(intentions: Intention[]): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const tx = db.transaction("intentions", "readwrite");
  for (const intention of intentions) {
    tx.store.put({
      ...intention,
      updatedAt: intention.updatedAt ?? now,
      deleted: intention.deleted ?? false,
      syncedAt: intention.syncedAt ?? null,
    });
  }
  await tx.done;
  INTENTION_UPDATED_EVENT();
}

export async function getIntentionsByDate(date: string): Promise<Intention[]> {
  const db = await getDB();
  const intentions = await db.getAllFromIndex("intentions", "by-date", date);
  return intentions
    .filter((i) => !i.archived && !i.deleted)
    .sort((a, b) => a.order - b.order);
}

/** Pending = not completed AND not archived, for a given date. */
export async function getPendingIntentionsByDate(date: string): Promise<Intention[]> {
  const db = await getDB();
  const intentions = await db.getAllFromIndex("intentions", "by-date", date);
  return intentions
    .filter((i) => !i.completed && !i.archived && !i.deleted)
    .sort((a, b) => a.order - b.order);
}

/** Returns intentions with `date` in [startDate, endDate] inclusive (YYYY-MM-DD), excluding tombstones. */
export async function getIntentionsForDateRange(startDate: string, endDate: string): Promise<Intention[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(startDate, endDate);
  const rows = await db.getAllFromIndex("intentions", "by-date", range);
  return rows.filter((i) => !i.deleted);
}

/** Returns reflections with `date` in [startDate, endDate] inclusive, excluding tombstones. */
export async function getReflectionsForDateRange(startDate: string, endDate: string): Promise<Reflection[]> {
  const db = await getDB();
  const all = await db.getAll("reflections");
  return all.filter((r) => !r.deleted && r.date >= startDate && r.date <= endDate);
}

/** All archived intentions, newest original-date first. */
export async function getArchivedIntentions(): Promise<Intention[]> {
  const db = await getDB();
  const all = await db.getAll("intentions");
  return all
    .filter((i) => i.archived && !i.deleted)
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.order - b.order;
    });
}

export async function archiveIntentions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const now = Date.now();
  const tx = db.transaction("intentions", "readwrite");
  for (const id of ids) {
    const intention = await tx.store.get(id);
    if (intention && !intention.archived) {
      await tx.store.put({
        ...intention,
        archived: true,
        updatedAt: now,
        syncedAt: null,
      });
    }
  }
  await tx.done;
  INTENTION_UPDATED_EVENT();
}

export async function updateIntention(
  id: string,
  updates: Partial<Omit<Intention, "id" | "createdAt">>
): Promise<void> {
  const db = await getDB();
  const intention = await db.get("intentions", id);
  if (intention) {
    await db.put("intentions", {
      ...intention,
      ...updates,
      updatedAt: updates.updatedAt ?? Date.now(),
      syncedAt: null,
    });
    INTENTION_UPDATED_EVENT();
  }
}

/**
 * Re-numbers `order` on the given intention ids so they match the array index
 * (0, 1, 2, …). Only touches rows whose existing `order` differs, so a no-op
 * drag doesn't churn sync state. All writes happen in a single transaction.
 */
export async function reorderIntentions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const now = Date.now();
  const tx = db.transaction("intentions", "readwrite");
  for (let i = 0; i < ids.length; i++) {
    const row = await tx.store.get(ids[i]);
    if (!row) continue;
    if (row.order === i) continue;
    await tx.store.put({
      ...row,
      order: i,
      updatedAt: now,
      syncedAt: null,
    });
  }
  await tx.done;
  INTENTION_UPDATED_EVENT();
}

/**
 * Soft-delete: marks the row as deleted and dirty so the tombstone propagates
 * via sync. Local queries already filter `deleted === true`.
 */
export async function deleteIntention(id: string): Promise<void> {
  const db = await getDB();
  const intention = await db.get("intentions", id);
  if (!intention) return;
  await db.put("intentions", {
    ...intention,
    deleted: true,
    updatedAt: Date.now(),
    syncedAt: null,
  });
  INTENTION_UPDATED_EVENT();
}

// --- Sync-only helpers for intentions. Do not use from UI code. ------------

/** Returns every local intention, including tombstones and archived. */
export async function getAllIntentionsForSync(): Promise<Intention[]> {
  const db = await getDB();
  return db.getAll("intentions");
}

/** Dirty rows = local updatedAt hasn't been confirmed as pushed. */
export async function getDirtyIntentions(): Promise<Intention[]> {
  const rows = await getAllIntentionsForSync();
  return rows.filter((i) => i.syncedAt == null || i.syncedAt < i.updatedAt);
}

/**
 * Merges a remote row into local storage using last-write-wins on updatedAt.
 * Safe to call repeatedly (idempotent).
 */
export async function mergeRemoteIntention(remote: Intention): Promise<"applied" | "skipped"> {
  const db = await getDB();
  const tx = db.transaction("intentions", "readwrite");
  const local = await tx.store.get(remote.id);
  if (local && local.updatedAt >= remote.updatedAt) {
    await tx.done;
    return "skipped";
  }
  await tx.store.put({ ...remote, syncedAt: remote.updatedAt });
  await tx.done;
  return "applied";
}

/** Stamps a set of rows as cleanly synced at their current updatedAt. */
export async function markIntentionsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("intentions", "readwrite");
  for (const id of ids) {
    const row = await tx.store.get(id);
    if (row) {
      await tx.store.put({ ...row, syncedAt: row.updatedAt });
    }
  }
  await tx.done;
}

/** Used when switching Supabase users on the same device — avoids leaking data between accounts. */
export async function clearAllIntentions(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("intentions", "readwrite");
  await tx.store.clear();
  await tx.done;
}

// --- Sync-only helpers for entries. Do not use from UI code. ---------------

/** Returns every local entry, including tombstones. */
export async function getAllEntriesForSync(): Promise<Entry[]> {
  const db = await getDB();
  return db.getAll("entries");
}

/** Dirty rows = local updatedAt hasn't been confirmed as pushed. */
export async function getDirtyEntries(): Promise<Entry[]> {
  const rows = await getAllEntriesForSync();
  return rows.filter((e) => e.syncedAt == null || e.syncedAt < (e.updatedAt ?? 0));
}

/**
 * Merges a remote entry into local storage using last-write-wins on updatedAt.
 * Safe to call repeatedly (idempotent).
 */
export async function mergeRemoteEntry(remote: Entry): Promise<"applied" | "skipped"> {
  const db = await getDB();
  const tx = db.transaction("entries", "readwrite");
  const local = await tx.store.get(remote.id);
  if (local && (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0)) {
    await tx.done;
    return "skipped";
  }
  await tx.store.put({ ...remote, syncedAt: remote.updatedAt });
  await tx.done;
  return "applied";
}

/** Stamps a set of entries as cleanly synced at their current updatedAt. */
export async function markEntriesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("entries", "readwrite");
  for (const id of ids) {
    const row = await tx.store.get(id);
    if (row) {
      await tx.store.put({ ...row, syncedAt: row.updatedAt });
    }
  }
  await tx.done;
}

/** Used when switching Supabase users on the same device. */
export async function clearAllEntries(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("entries", "readwrite");
  await tx.store.clear();
  await tx.done;
}

// --- Sync-only helpers for reflections. Do not use from UI code. -----------

/** Returns every local reflection, including tombstones. */
export async function getAllReflectionsForSync(): Promise<Reflection[]> {
  const db = await getDB();
  return db.getAll("reflections");
}

/** Dirty rows = local updatedAt hasn't been confirmed as pushed. */
export async function getDirtyReflections(): Promise<Reflection[]> {
  const rows = await getAllReflectionsForSync();
  return rows.filter((r) => r.syncedAt == null || r.syncedAt < (r.updatedAt ?? 0));
}

/**
 * Merges a remote reflection into local storage using last-write-wins on updatedAt.
 * Safe to call repeatedly (idempotent).
 */
export async function mergeRemoteReflection(remote: Reflection): Promise<"applied" | "skipped"> {
  const db = await getDB();
  const tx = db.transaction("reflections", "readwrite");
  const local = await tx.store.get(remote.date);
  if (local && (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0)) {
    await tx.done;
    return "skipped";
  }
  await tx.store.put({ ...remote, syncedAt: remote.updatedAt });
  await tx.done;
  return "applied";
}

/** Stamps a set of reflections as cleanly synced at their current updatedAt. */
export async function markReflectionsSynced(dates: string[]): Promise<void> {
  if (dates.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("reflections", "readwrite");
  for (const date of dates) {
    const row = await tx.store.get(date);
    if (row) {
      await tx.store.put({ ...row, syncedAt: row.updatedAt });
    }
  }
  await tx.done;
}

/** Used when switching Supabase users on the same device. */
export async function clearAllReflections(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("reflections", "readwrite");
  await tx.store.clear();
  await tx.done;
}
