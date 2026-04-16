/**
 * Categories sync — single-row LWW against profiles.custom_categories.
 *
 * Much simpler than entries/reflections: no pagination, no tombstones,
 * no row-per-item. The entire category array is stored as JSONB on the
 * user's profile row and replaced wholesale using last-write-wins on
 * `custom_categories_updated_at` (a bigint epoch ms timestamp).
 *
 * Triggered by:
 *   - Sign-in / user change (via `startCategoriesSync` in AuthProvider)
 *   - `categories-dirty` window events (dispatched by settings/page.tsx after saves)
 *   - `visibilitychange` / `online` / `focus` events
 */

import { supabase } from "@/lib/supabase";
import { getSettings, saveSettings } from "@/lib/db";

export async function syncCategoriesNow(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const settings = await getSettings();
  const localTs = settings.categoriesSyncedAt ?? 0;
  const localCategories = settings.customCategories;

  // Pull remote profile row
  const { data: profile, error: pullError } = await supabase
    .from("profiles")
    .select("custom_categories, custom_categories_updated_at")
    .eq("id", userId)
    .single();

  if (pullError) {
    console.warn("[categoriesSync] pull failed:", pullError.message);
    return;
  }

  const remoteTs: number = profile?.custom_categories_updated_at ?? 0;

  if (remoteTs > localTs) {
    // Remote is newer — adopt it locally
    const categoriesJson = profile?.custom_categories
      ? JSON.stringify(profile.custom_categories)
      : null;
    await saveSettings({
      customCategories: categoriesJson,
      categoriesSyncedAt: remoteTs,
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("categories-updated"));
    }
  } else if (localTs > remoteTs && localCategories != null) {
    // Local is newer — push to remote
    let parsed: unknown;
    try {
      parsed = JSON.parse(localCategories);
    } catch {
      console.warn("[categoriesSync] local categories JSON is invalid, skipping push");
      return;
    }
    const { error: pushError } = await supabase
      .from("profiles")
      .update({
        custom_categories: parsed,
        custom_categories_updated_at: localTs,
      })
      .eq("id", userId);

    if (pushError) {
      console.warn("[categoriesSync] push failed:", pushError.message);
    }
  }
}

// --- Lifecycle ---------------------------------------------------------------

type Unsubscribe = () => void;
let teardown: Unsubscribe | null = null;

export function startCategoriesSync(): Unsubscribe {
  stopCategoriesSync();

  const onDirty = () => { void syncCategoriesNow(); };
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncCategoriesNow();
  };
  const onOnline = () => { void syncCategoriesNow(); };

  window.addEventListener("categories-dirty", onDirty);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);

  void syncCategoriesNow();

  teardown = () => {
    window.removeEventListener("categories-dirty", onDirty);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onOnline);
    teardown = null;
  };
  return teardown;
}

export function stopCategoriesSync(): void {
  teardown?.();
}

export async function handleCategoriesSignOut(): Promise<void> {
  stopCategoriesSync();
}
