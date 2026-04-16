import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/** Returns a YYYY-MM-DD string in the user's local timezone (not UTC). */
export function toLocalDateStr(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
}

export interface Reflection {
  date: string; // YYYY-MM-DD (primary key)
  mood: number; // 1-5
  note: string;
  summary: string; // AI-generated accomplishment summary
  createdAt: number;
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
  // --- sync metadata (v6) ---
  updatedAt: number;         // epoch ms of the last local or remote write; drives last-write-wins merge
  deleted?: boolean;         // soft-delete tombstone so other devices observe the removal
  syncedAt?: number | null;  // updatedAt value at the moment of the last successful push; null = dirty
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
    dbPromise = openDB<ADDitDB>("addit-db", 6, {
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
        // v6: sync metadata — backfill updatedAt so existing rows aren't treated
        // as brand new or ancient. They get `syncedAt = null` on purpose so the
        // first post-upgrade sync pushes them to Supabase. Returning this
        // promise to `upgrade` ensures the transaction waits for the backfill
        // before committing.
        if (oldVersion < 6 && db.objectStoreNames.contains("intentions")) {
          return (async () => {
            const store = tx.objectStore("intentions");
            let cursor = await store.openCursor();
            while (cursor) {
              const value = cursor.value as Intention;
              const needsBackfill =
                typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt);
              if (needsBackfill) {
                const ts = value.completedAt ?? value.createdAt ?? Date.now();
                await cursor.update({
                  ...value,
                  updatedAt: ts,
                  deleted: value.deleted ?? false,
                  syncedAt: null,
                });
              }
              cursor = await cursor.continue();
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

export async function addEntry(entry: Entry): Promise<void> {
  const db = await getDB();
  await db.put("entries", entry);
}

export async function getEntriesByDate(date: string): Promise<Entry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex("entries", "by-date", date);
  return entries.sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));
}

export async function getEntriesForDateRange(startDate: string, endDate: string): Promise<Entry[]> {
  const db = await getDB();
  const range = IDBKeyRange.bound(startDate, endDate);
  const entries = await db.getAllFromIndex("entries", "by-date", range);
  return entries.sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));
}

export async function getAllEntries(): Promise<Entry[]> {
  const db = await getDB();
  return db.getAll("entries");
}

export async function searchEntries(query: string): Promise<Entry[]> {
  const db = await getDB();
  const all = await db.getAll("entries");
  const lower = query.toLowerCase();
  return all
    .filter((e) => e.text.toLowerCase().includes(lower) || e.tags.some((t) => t.toLowerCase().includes(lower)))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function updateEntryTags(id: string, tags: string[]): Promise<void> {
  const db = await getDB();
  const entry = await db.get("entries", id);
  if (entry) {
    entry.tags = tags;
    await db.put("entries", entry);
  }
}

export async function updateEntry(
  id: string,
  updates: Partial<Omit<Entry, "id" | "createdAt">>
): Promise<Entry | null> {
  const db = await getDB();
  const entry = await db.get("entries", id);
  if (!entry) return null;
  const updated = { ...entry, ...updates };
  if (updates.startTime !== undefined) {
    updated.date = toLocalDateStr(updates.startTime);
  }
  await db.put("entries", updated);
  return updated;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("entries", id);
}

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const customCategories = (await db.get("settings", "customCategories")) || null;
  const theme = (await db.get("settings", "theme")) || null;
  const lastSeenMilestone = (await db.get("settings", "lastSeenMilestone")) || null;
  const lastCarryoverPromptDate = (await db.get("settings", "lastCarryoverPromptDate")) || null;
  const intentionSyncOwner = (await db.get("settings", "intentionSyncOwner")) || null;
  const lastIntentionPullAtRaw = (await db.get("settings", "lastIntentionPullAt")) || "0";
  const lastIntentionPullAt = Number.parseInt(lastIntentionPullAtRaw, 10) || 0;
  return {
    customCategories,
    theme,
    lastSeenMilestone,
    lastCarryoverPromptDate,
    intentionSyncOwner,
    lastIntentionPullAt,
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
  }
  if (settings.intentionSyncOwner !== undefined) {
    await db.put("settings", settings.intentionSyncOwner || "", "intentionSyncOwner");
  }
  if (settings.lastIntentionPullAt !== undefined) {
    await db.put("settings", String(settings.lastIntentionPullAt ?? 0), "lastIntentionPullAt");
  }
}

// Reflections
export async function addReflection(reflection: Reflection): Promise<void> {
  const db = await getDB();
  await db.put("reflections", reflection);
}

export async function getReflectionByDate(date: string): Promise<Reflection | undefined> {
  const db = await getDB();
  return db.get("reflections", date);
}

// Intentions
//
// Every write stamps `updatedAt = now` and clears `syncedAt` so the sync layer
// knows the row is dirty. Removal is a soft-delete (`deleted = true`) so other
// devices can observe the tombstone and converge; queries filter tombstones out.
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

// --- Sync-only helpers. Do not use from UI code. ------------------------

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
  // Preserve the dirty bit if the local copy has newer unsynced edits
  // (shouldn't happen given the guard above, but belt-and-braces).
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
