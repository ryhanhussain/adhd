import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BucketIconKey } from "./categories";
import { MAX_LIFE_AREAS, type LifeArea } from "./lifeAreas";
import { getPersonalValueById, normalizePersonalValueIds, type PersonalValueId } from "./values";
import { normalizeWhyChain } from "./why";

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
export type NowNextRank = 0 | 1;
export type PriorityLevel = "high" | "medium" | "low";

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
  lifeAreaId?: string | null;
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
  /**
   * Selected home-page tab ("life" | "energy"). Synced via the same `profiles`
   * row as categories so the tab choice follows the user across devices.
   * `null` = never set; UI falls back to its own default.
   */
  homeTab: string | null;
  /** Epoch ms of the last local write to `homeTab`; drives LWW push/pull. */
  homeTabSyncedAt: number;
  // --- habits (v10) ---
  /** Supabase user id whose habits are currently mirrored in this browser. */
  habitSyncOwner: string | null;
  /** High-water mark for remote habits `updated_at` already pulled into local. */
  lastHabitPullAt: number;
  /** Supabase user id whose life areas are currently mirrored in this browser. */
  lifeAreaSyncOwner: string | null;
  /** High-water mark for remote life area `updated_at` values already pulled into local. */
  lastLifeAreaPullAt: number;
  /** JSON-encoded array of selected PersonalValue ids. */
  personalValues: string | null;
  /** Epoch ms timestamp of the last local personal-values write; used for LWW push/pull. */
  personalValuesSyncedAt: number;
}

/**
 * Daily habit tracker entry. Each habit is a recurring behaviour the user
 * wants to anchor every day; ticking it adds today's local-date string to
 * `completions`. If the habit has no activity (creation or tick) for more
 * than 10 days, it is silently soft-deleted by the home-page cleanup pass.
 *
 * `completions` is sorted descending (most-recent first), deduped, and
 * capped at the most recent 60 entries — enough to compute a long streak
 * without unbounded growth or sync payload bloat.
 *
 * `lastUntickAt` records the local-clock moment of the most recent untick,
 * so an accidental untick on day 9 doesn't immediately wipe the habit on
 * the next cleanup pass. Synced as a column so untick safety propagates
 * across devices.
 */
export interface Habit {
  id: string;
  name: string;         // 1-30 chars
  color: string;        // hex from COLOR_OPTIONS
  icon?: BucketIconKey;
  lifeAreaId?: string | null;
  order: number;
  /** Sorted-desc, deduped, capped at MAX_COMPLETIONS. Each entry is a local YYYY-MM-DD. */
  completions: string[];
  /** Epoch ms of the last untick action (or null). Used by the cleanup anchor only. */
  lastUntickAt: number | null;
  createdAt: number;
  // --- sync metadata ---
  updatedAt: number;
  deleted?: boolean;
  syncedAt?: number | null;
}

export const MAX_HABIT_COMPLETIONS = 60;
export const HABIT_NAME_MAX = 30;
export const HABIT_INACTIVITY_LIMIT_DAYS = 10;

export interface Intention {
  id: string;
  /**
   * Free-form task text. Edited inline; the AI does not see this text after
   * brain-dump parsing — only at completion time when an Entry is created.
   */
  text: string;
  /**
   * YYYY-MM-DD of the local creation date. Retained for analytics and the
   * `by-date` index, but no longer drives the home view (intentions persist
   * in the backlog regardless of `date`).
   */
  date: string;
  completed: boolean;
  completedAt: number | null;
  entryId: string | null; // links to Entry created on completion
  order: number;
  createdAt: number;
  archived?: boolean; // true = user manually archived; hidden from the backlog
  // --- intention categories (v8) ---
  /** id of an IntentionCategory; null = uncategorized and shown in the unsorted bucket. */
  categoryId?: string | null;
  /**
   * @deprecated Carry-over chains are no longer created by the home flow
   * (intentions persist in the backlog instead). Kept for `lib/analysis.ts`
   * dedupe of historical multi-day clones written before v9.
   */
  carriedFromId?: string | null;
  /**
   * v9: optional energy hint. Inferred at brain-dump time by Gemini and used
   * by the Energy view to slice the backlog. Pre-fills the Entry's energy
   * when the intention is completed; user can still override.
   */
  energy?: EnergyLevel | null;
  /** Optional Life Area id; null = untagged. */
  lifeAreaId?: string | null;
  /** Optional user-facing priority inferred at brain-dump time or edited later. */
  priority?: PriorityLevel | null;
  /** Optional activity category name used as a visual hint before completion. */
  activityCategory?: string | null;
  /**
   * Saved one-line reason chain for Focus mode, written when the task is
   * created and edited by the user before saving.
   */
  whyChain?: string | null;
  /**
   * Local YYYY-MM-DD. When set in the future, the intention is hidden from the
   * active Home backlog until that date arrives.
   */
  snoozedUntil?: string | null;
  /** Epoch ms of the last "make smaller" / reframe edit. */
  lastReframedAt?: number | null;
  /**
   * Rolling Time Block slot on the home dashboard.
   * 0 = Now, 1 = Next, null/undefined = Brain Dump Vault.
   */
  nowNextRank?: NowNextRank | null;
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
  habits: {
    key: string;
    value: Habit;
  };
  lifeAreas: {
    key: string;
    value: LifeArea;
  };
}

let dbPromise: Promise<IDBPDatabase<ADDitDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ADDitDB>("addit-db", 11, {
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
        // v9: optional `energy` field on Intention; optional `icon` on
        //     IntentionCategory (lives inside customIntentionCategories JSON).
        //     No schema/index changes; backfill is implicit (undefined → null).
        // v10: habits store (daily habit tracker). Fresh store, no backfill.
        if (oldVersion < 10) {
          if (!db.objectStoreNames.contains("habits")) {
            db.createObjectStore("habits", { keyPath: "id" });
          }
        }
        // v11: Life Areas store + optional lifeAreaId/priority/activityCategory
        // fields on entries, intentions, and habits. Optional fields need no
        // backfill; old rows naturally render as untagged.
        if (oldVersion < 11) {
          if (!db.objectStoreNames.contains("lifeAreas")) {
            db.createObjectStore("lifeAreas", { keyPath: "id" });
          }
        }
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

function LIFE_AREA_DIRTY_EVENT() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("life-area-dirty"));
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
  const homeTab = (await db.get("settings", "homeTab")) || null;
  const homeTabSyncedAtRaw = (await db.get("settings", "homeTabSyncedAt")) || "0";
  const homeTabSyncedAt = Number.parseInt(homeTabSyncedAtRaw, 10) || 0;
  const habitSyncOwner = (await db.get("settings", "habitSyncOwner")) || null;
  const lastHabitPullAtRaw = (await db.get("settings", "lastHabitPullAt")) || "0";
  const lastHabitPullAt = Number.parseInt(lastHabitPullAtRaw, 10) || 0;
  const lifeAreaSyncOwner = (await db.get("settings", "lifeAreaSyncOwner")) || null;
  const lastLifeAreaPullAtRaw = (await db.get("settings", "lastLifeAreaPullAt")) || "0";
  const lastLifeAreaPullAt = Number.parseInt(lastLifeAreaPullAtRaw, 10) || 0;
  const personalValues = (await db.get("settings", "personalValues")) || null;
  const personalValuesSyncedAtRaw = (await db.get("settings", "personalValuesSyncedAt")) || "0";
  const personalValuesSyncedAt = Number.parseInt(personalValuesSyncedAtRaw, 10) || 0;
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
    homeTab,
    homeTabSyncedAt,
    habitSyncOwner,
    lastHabitPullAt,
    lifeAreaSyncOwner,
    lastLifeAreaPullAt,
    personalValues,
    personalValuesSyncedAt,
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
  if (settings.homeTab !== undefined) {
    await db.put("settings", settings.homeTab || "", "homeTab");
    // Auto-stamp the LWW timestamp unless the caller is applying a remote pull
    // (which sets homeTabSyncedAt explicitly). Keeps every local tab change
    // dirty for push without each call site having to remember.
    if (settings.homeTabSyncedAt === undefined) {
      await db.put("settings", String(Date.now()), "homeTabSyncedAt");
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("home-tab-dirty"));
    }
  }
  if (settings.homeTabSyncedAt !== undefined) {
    await db.put("settings", String(settings.homeTabSyncedAt ?? 0), "homeTabSyncedAt");
  }
  if (settings.habitSyncOwner !== undefined) {
    await db.put("settings", settings.habitSyncOwner || "", "habitSyncOwner");
  }
  if (settings.lastHabitPullAt !== undefined) {
    await db.put("settings", String(settings.lastHabitPullAt ?? 0), "lastHabitPullAt");
  }
  if (settings.lifeAreaSyncOwner !== undefined) {
    await db.put("settings", settings.lifeAreaSyncOwner || "", "lifeAreaSyncOwner");
  }
  if (settings.lastLifeAreaPullAt !== undefined) {
    await db.put("settings", String(settings.lastLifeAreaPullAt ?? 0), "lastLifeAreaPullAt");
  }
  if (settings.personalValues !== undefined) {
    await db.put("settings", settings.personalValues || "", "personalValues");
    if (settings.personalValuesSyncedAt === undefined) {
      await db.put("settings", String(Date.now()), "personalValuesSyncedAt");
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("personal-values-dirty"));
    }
  }
  if (settings.personalValuesSyncedAt !== undefined) {
    await db.put("settings", String(settings.personalValuesSyncedAt ?? 0), "personalValuesSyncedAt");
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

function normalizeNowNextRankValue(value: unknown): NowNextRank | null {
  return value === 0 || value === 1 ? value : null;
}

function shouldKeepNowNextRank(intention: Intention, today: string): boolean {
  return (
    !intention.completed &&
    !intention.archived &&
    !intention.deleted &&
    (!intention.snoozedUntil || intention.snoozedUntil <= today)
  );
}

function clearsNowNextRank(updates: Partial<Omit<Intention, "id" | "createdAt">>): boolean {
  if (updates.completed === true || updates.archived === true || updates.deleted === true) {
    return true;
  }
  if (updates.snoozedUntil !== undefined && updates.snoozedUntil) {
    return updates.snoozedUntil > toLocalDateStr(new Date());
  }
  return false;
}

export async function addIntentions(intentions: Intention[]): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const tx = db.transaction("intentions", "readwrite");
  for (const intention of intentions) {
    tx.store.put({
      ...intention,
      nowNextRank: normalizeNowNextRankValue(intention.nowNextRank),
      whyChain: normalizeWhyChain(intention.whyChain),
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

/**
 * Backlog: every active intention regardless of `date`. Sorted by `order`
 * ascending (drag-reorder respects this), with `createdAt desc` as a stable
 * tiebreaker so newly-added items surface near the top within a bucket of
 * equal-`order` rows.
 *
 * "Active" = not completed, not archived, not soft-deleted. Realistic ceiling
 * is a few hundred rows per user, so a `getAll()` + filter is cheaper than
 * adding an index.
 */
export async function getActiveIntentions(): Promise<Intention[]> {
  await normalizeNowNextRanks();
  const db = await getDB();
  const all = await db.getAll("intentions");
  const today = toLocalDateStr(new Date());
  return all
    .filter((i) => !i.completed && !i.archived && !i.deleted)
    .filter((i) => !i.snoozedUntil || i.snoozedUntil <= today)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return b.createdAt - a.createdAt;
    });
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
        nowNextRank: null,
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
    const shouldClearNowNext = clearsNowNextRank(updates);
    const normalizedUpdates = {
      ...updates,
      ...(updates.whyChain !== undefined ? { whyChain: normalizeWhyChain(updates.whyChain) } : {}),
    };
    await db.put("intentions", {
      ...intention,
      ...normalizedUpdates,
      nowNextRank: shouldClearNowNext
        ? null
        : normalizedUpdates.nowNextRank !== undefined
          ? normalizeNowNextRankValue(normalizedUpdates.nowNextRank)
          : normalizeNowNextRankValue(intention.nowNextRank),
      updatedAt: normalizedUpdates.updatedAt ?? Date.now(),
      syncedAt: null,
    });
    INTENTION_UPDATED_EVENT();
  }
}

/**
 * Places one active intention into the Now (0) or Next (1) slot. Any existing
 * occupant of that slot is returned to the vault, preserving the hard two-slot
 * rolling block invariant.
 */
export async function setNowNextRank(id: string, rank: NowNextRank): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const today = toLocalDateStr(new Date());
  const tx = db.transaction("intentions", "readwrite");
  const all = await tx.store.getAll();
  const target = all.find((row) => row.id === id);
  if (!target || !shouldKeepNowNextRank(target, today)) {
    await tx.done;
    return;
  }

  let changed = false;
  for (const row of all) {
    if (row.id !== id && normalizeNowNextRankValue(row.nowNextRank) === rank) {
      await tx.store.put({
        ...row,
        nowNextRank: null,
        updatedAt: now,
        syncedAt: null,
      });
      changed = true;
    }
  }

  if (normalizeNowNextRankValue(target.nowNextRank) !== rank) {
    await tx.store.put({
      ...target,
      nowNextRank: rank,
      updatedAt: now,
      syncedAt: null,
    });
    changed = true;
  }

  await tx.done;
  if (changed) INTENTION_UPDATED_EVENT();
}

export async function clearNowNextRank(id: string): Promise<void> {
  const db = await getDB();
  const row = await db.get("intentions", id);
  if (!row || normalizeNowNextRankValue(row.nowNextRank) == null) return;
  await db.put("intentions", {
    ...row,
    nowNextRank: null,
    updatedAt: Date.now(),
    syncedAt: null,
  });
  INTENTION_UPDATED_EVENT();
}

export async function swapNowNextRanks(): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const tx = db.transaction("intentions", "readwrite");
  const all = await tx.store.getAll();
  const nowItem = all.find((row) => normalizeNowNextRankValue(row.nowNextRank) === 0);
  const nextItem = all.find((row) => normalizeNowNextRankValue(row.nowNextRank) === 1);
  if (!nowItem || !nextItem) {
    await tx.done;
    return;
  }

  await tx.store.put({
    ...nowItem,
    nowNextRank: 1,
    updatedAt: now,
    syncedAt: null,
  });
  await tx.store.put({
    ...nextItem,
    nowNextRank: 0,
    updatedAt: now,
    syncedAt: null,
  });
  await tx.done;
  INTENTION_UPDATED_EVENT();
}

/**
 * Clears invalid Now/Next ranks and duplicate slot occupants. If sync pulls two
 * rows into the same slot, the most recently updated active row keeps it.
 */
export async function normalizeNowNextRanks(): Promise<void> {
  const db = await getDB();
  const today = toLocalDateStr(new Date());
  const tx = db.transaction("intentions", "readwrite");
  const all = await tx.store.getAll();
  const now = Date.now();
  const keepers = new Map<NowNextRank, string>();
  const candidates = all
    .map((row) => ({ row, rank: normalizeNowNextRankValue(row.nowNextRank) }))
    .filter((item): item is { row: Intention; rank: NowNextRank } => item.rank !== null)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if ((a.row.updatedAt ?? 0) !== (b.row.updatedAt ?? 0)) return (b.row.updatedAt ?? 0) - (a.row.updatedAt ?? 0);
      if (a.row.order !== b.row.order) return a.row.order - b.row.order;
      return b.row.createdAt - a.row.createdAt;
    });

  for (const { row, rank } of candidates) {
    if (!shouldKeepNowNextRank(row, today)) continue;
    if (!keepers.has(rank)) keepers.set(rank, row.id);
  }

  let changed = false;
  for (const row of all) {
    const rank = normalizeNowNextRankValue(row.nowNextRank);
    if (rank === null) {
      if (row.nowNextRank !== null && row.nowNextRank !== undefined) {
        await tx.store.put({
          ...row,
          nowNextRank: null,
          updatedAt: now,
          syncedAt: null,
        });
        changed = true;
      }
      continue;
    }

    const keeperId = keepers.get(rank);
    if (keeperId !== row.id) {
      await tx.store.put({
        ...row,
        nowNextRank: null,
        updatedAt: now,
        syncedAt: null,
      });
      changed = true;
    }
  }

  await tx.done;
  if (changed) INTENTION_UPDATED_EVENT();
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
    nowNextRank: null,
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

// ---------------------------------------------------------------------------
// Life Areas (v11)
//
// User-defined meaning layer. Archive preserves historical references; hard
// deletion is only used for sync tombstones/account switching.
// ---------------------------------------------------------------------------

function sortLifeAreas(rows: LifeArea[]): LifeArea[] {
  return rows.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt - b.createdAt;
  });
}

function primaryCoreValueForValueIds(valueIds: PersonalValueId[]): LifeArea["coreValue"] {
  const first = valueIds[0] ? getPersonalValueById(valueIds[0]) : null;
  return first?.coreValue ?? null;
}

export async function getLifeAreas(options: { includeArchived?: boolean } = {}): Promise<LifeArea[]> {
  const db = await getDB();
  const all = await db.getAll("lifeAreas");
  return sortLifeAreas(
    all.filter((area) => !area.deleted && (options.includeArchived || !area.archived))
  );
}

export async function getAllLifeAreasForSync(): Promise<LifeArea[]> {
  const db = await getDB();
  return db.getAll("lifeAreas");
}

export async function getActiveLifeAreaCount(): Promise<number> {
  const areas = await getLifeAreas();
  return areas.length;
}

export async function addLifeArea(area: LifeArea): Promise<"ok" | "cap"> {
  const db = await getDB();
  const all = await db.getAll("lifeAreas");
  const activeCount = all.filter((row) => !row.deleted && !row.archived).length;
  if (!area.archived && activeCount >= MAX_LIFE_AREAS) return "cap";

  const now = Date.now();
  await db.put("lifeAreas", {
    ...area,
    name: area.name.trim().slice(0, 30),
    description: area.description.trim().slice(0, 140),
    valueIds: normalizePersonalValueIds(area.valueIds),
    coreValue: area.coreValue ?? primaryCoreValueForValueIds(normalizePersonalValueIds(area.valueIds)),
    archived: area.archived ?? false,
    deleted: area.deleted ?? false,
    updatedAt: area.updatedAt ?? now,
    syncedAt: null,
  });
  LIFE_AREA_DIRTY_EVENT();
  return "ok";
}

export async function updateLifeArea(
  id: string,
  updates: Partial<Omit<LifeArea, "id" | "createdAt">>
): Promise<"ok" | "cap" | "missing"> {
  const db = await getDB();
  const current = await db.get("lifeAreas", id);
  if (!current) return "missing";
  const isRestoring = updates.archived === false && current.archived;
  if (isRestoring) {
    const all = await db.getAll("lifeAreas");
    const activeCount = all.filter((row) => !row.deleted && !row.archived && row.id !== id).length;
    if (activeCount >= MAX_LIFE_AREAS) return "cap";
  }

  const next: LifeArea = {
    ...current,
    ...updates,
    name: (updates.name ?? current.name).trim().slice(0, 30),
    description: (updates.description ?? current.description).trim().slice(0, 140),
    valueIds: updates.valueIds === undefined ? normalizePersonalValueIds(current.valueIds) : normalizePersonalValueIds(updates.valueIds),
    coreValue:
      updates.coreValue === undefined
        ? updates.valueIds === undefined
          ? current.coreValue ?? null
          : primaryCoreValueForValueIds(normalizePersonalValueIds(updates.valueIds))
        : updates.coreValue,
    updatedAt: updates.updatedAt ?? Date.now(),
    syncedAt: null,
  };
  await db.put("lifeAreas", next);
  LIFE_AREA_DIRTY_EVENT();
  return "ok";
}

export async function archiveLifeArea(id: string): Promise<void> {
  await updateLifeArea(id, { archived: true });
}

export async function restoreLifeArea(id: string): Promise<"ok" | "cap" | "missing"> {
  return updateLifeArea(id, { archived: false });
}

export async function getDirtyLifeAreas(): Promise<LifeArea[]> {
  const rows = await getAllLifeAreasForSync();
  return rows.filter((area) => area.syncedAt == null || area.syncedAt < area.updatedAt);
}

export async function mergeRemoteLifeArea(remote: LifeArea): Promise<"applied" | "skipped"> {
  const db = await getDB();
  const tx = db.transaction("lifeAreas", "readwrite");
  const local = await tx.store.get(remote.id);
  if (local && local.updatedAt >= remote.updatedAt) {
    await tx.done;
    return "skipped";
  }
  await tx.store.put({ ...remote, syncedAt: remote.updatedAt });
  await tx.done;
  return "applied";
}

export async function markLifeAreasSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("lifeAreas", "readwrite");
  for (const id of ids) {
    const row = await tx.store.get(id);
    if (row) await tx.store.put({ ...row, syncedAt: row.updatedAt });
  }
  await tx.done;
}

export async function clearAllLifeAreas(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("lifeAreas", "readwrite");
  await tx.store.clear();
  await tx.done;
}

// ---------------------------------------------------------------------------
// Habits (v10)
//
// Same dirty-event + soft-delete pattern as intentions. The one twist is the
// `completions` array: sync conflicts merge it as a union (in habitsSync's
// mergeRemoteHabit), but every other field follows whole-row LWW.
// ---------------------------------------------------------------------------

function HABIT_DIRTY_EVENT() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("habit-dirty"));
  }
}

/**
 * Normalises a completions array: keeps only "YYYY-MM-DD" strings, dedupes,
 * sorts descending, caps to MAX_HABIT_COMPLETIONS. Pure — safe to call on
 * any input (including a remote payload).
 */
export function normaliseCompletions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== "string") continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
    seen.add(v);
  }
  return Array.from(seen)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, MAX_HABIT_COMPLETIONS);
}

export async function addHabit(habit: Habit): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  await db.put("habits", {
    ...habit,
    completions: normaliseCompletions(habit.completions),
    updatedAt: habit.updatedAt ?? now,
    deleted: habit.deleted ?? false,
    syncedAt: null,
  });
  HABIT_DIRTY_EVENT();
}

/** Active habits = not soft-deleted, sorted by `order` ascending, createdAt desc tiebreaker. */
export async function getActiveHabits(): Promise<Habit[]> {
  const db = await getDB();
  const all = await db.getAll("habits");
  return all
    .filter((h) => !h.deleted)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return b.createdAt - a.createdAt;
    });
}

export async function getHabitById(id: string): Promise<Habit | undefined> {
  const db = await getDB();
  const h = await db.get("habits", id);
  return h?.deleted ? undefined : h;
}

export async function updateHabit(
  id: string,
  updates: Partial<Omit<Habit, "id" | "createdAt">>
): Promise<void> {
  const db = await getDB();
  const habit = await db.get("habits", id);
  if (!habit) return;
  const next: Habit = {
    ...habit,
    ...updates,
    completions:
      updates.completions !== undefined
        ? normaliseCompletions(updates.completions)
        : habit.completions,
    updatedAt: updates.updatedAt ?? Date.now(),
    syncedAt: null,
  };
  await db.put("habits", next);
  HABIT_DIRTY_EVENT();
}

/**
 * Toggles today's date in a habit's `completions` set. Returns the new
 * "ticked today" state. Idempotent: ticking twice without an untick is a
 * no-op. On untick, stamps `lastUntickAt` so the cleanup pass treats the
 * untick as fresh activity (prevents accidental removal on day 9+).
 */
export async function toggleHabitCompletion(
  id: string,
  dateStr: string
): Promise<{ ticked: boolean }> {
  const db = await getDB();
  const habit = await db.get("habits", id);
  if (!habit) return { ticked: false };
  const set = new Set(habit.completions);
  let ticked: boolean;
  let lastUntickAt = habit.lastUntickAt;
  if (set.has(dateStr)) {
    set.delete(dateStr);
    ticked = false;
    lastUntickAt = Date.now();
  } else {
    set.add(dateStr);
    ticked = true;
  }
  await db.put("habits", {
    ...habit,
    completions: normaliseCompletions(Array.from(set)),
    lastUntickAt,
    updatedAt: Date.now(),
    syncedAt: null,
  });
  HABIT_DIRTY_EVENT();
  return { ticked };
}

/**
 * Soft-delete: marks the row deleted so the tombstone propagates via sync.
 * Local queries already filter `deleted === true`. Always route auto-cleanup
 * through this — never `db.delete` directly, or other devices won't observe
 * the removal.
 */
export async function deleteHabit(id: string): Promise<void> {
  const db = await getDB();
  const habit = await db.get("habits", id);
  if (!habit) return;
  await db.put("habits", {
    ...habit,
    deleted: true,
    updatedAt: Date.now(),
    syncedAt: null,
  });
  HABIT_DIRTY_EVENT();
}

// --- Sync-only helpers for habits. Do not use from UI code. ----------------

export async function getAllHabitsForSync(): Promise<Habit[]> {
  const db = await getDB();
  return db.getAll("habits");
}

export async function getDirtyHabits(): Promise<Habit[]> {
  const rows = await getAllHabitsForSync();
  return rows.filter((h) => h.syncedAt == null || h.syncedAt < h.updatedAt);
}

/**
 * Last-write-wins for every scalar field, but `completions` always merges
 * as a UNION of local + remote dates. This is the only place habitsSync
 * diverges from intentionsSync.
 *
 * If the union introduces dates the winning side didn't have, the row is
 * also marked dirty (syncedAt = null) so the merger re-pushes the unioned
 * set. Without this re-push, an offline tick observed only by one device
 * would never reach the other device once the row stopped changing.
 */
export async function mergeRemoteHabit(remote: Habit): Promise<"applied" | "skipped"> {
  const db = await getDB();
  const tx = db.transaction("habits", "readwrite");
  const local = await tx.store.get(remote.id);

  const localSet = new Set(local?.completions ?? []);
  const remoteSet = new Set(remote.completions ?? []);
  const merged = normaliseCompletions([...localSet, ...remoteSet]);

  // Preserve whichever lastUntickAt is more recent — never wipe the local
  // safety stamp with a stale remote null.
  const lastUntickAt = Math.max(local?.lastUntickAt ?? 0, remote.lastUntickAt ?? 0) || null;

  if (local && local.updatedAt > remote.updatedAt) {
    // Local newer. Apply remote's completions into local via union; if the
    // union is strictly larger than local had, flag dirty so we re-push it.
    const introducedNewDates = merged.length > localSet.size;
    await tx.store.put({
      ...local,
      completions: merged,
      lastUntickAt,
      ...(introducedNewDates ? { syncedAt: null } : {}),
    });
    await tx.done;
    return "skipped";
  }

  // Remote wins (or no local row). Apply remote, but union completions and
  // re-push if local had dates the remote was missing.
  const introducedNewDates = merged.length > remoteSet.size;
  await tx.store.put({
    ...remote,
    completions: merged,
    lastUntickAt,
    syncedAt: introducedNewDates ? null : remote.updatedAt,
  });
  await tx.done;
  return "applied";
}

export async function markHabitsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("habits", "readwrite");
  for (const id of ids) {
    const row = await tx.store.get(id);
    if (row) {
      await tx.store.put({ ...row, syncedAt: row.updatedAt });
    }
  }
  await tx.done;
}

export async function clearAllHabits(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("habits", "readwrite");
  await tx.store.clear();
  await tx.done;
}
