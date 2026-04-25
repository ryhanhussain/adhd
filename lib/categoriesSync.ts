/**
 * Categories sync — single-row LWW against profiles.custom_categories and
 * profiles.custom_intention_categories.
 *
 * Much simpler than entries/reflections: no pagination, no tombstones,
 * no row-per-item. Each array is stored as JSONB on the user's profile row
 * and replaced wholesale using last-write-wins on its `*_updated_at`
 * (bigint epoch ms) sibling column.
 *
 * Triggered by:
 *   - Sign-in / user change (via `startCategoriesSync` in AuthProvider)
 *   - `categories-dirty` / `intention-categories-dirty` window events
 *     (dispatched by settings/page.tsx after saves)
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
  const localIntentionTs = settings.intentionCategoriesSyncedAt ?? 0;
  const localIntentionCategories = settings.customIntentionCategories;
  const localCarryoverTs = settings.lastCarryoverPromptDateSyncedAt ?? 0;
  const localCarryoverDate = settings.lastCarryoverPromptDate;

  // Pull remote profile row (all fields in one round-trip).
  // `.maybeSingle()` returns null (not 406) when the row doesn't exist yet —
  // first-sync-after-signup, before any category push has happened.
  const { data: profile, error: pullError } = await supabase
    .from("profiles")
    .select(
      "custom_categories, custom_categories_updated_at, custom_intention_categories, custom_intention_categories_updated_at, last_carryover_prompt_date, last_carryover_prompt_date_updated_at"
    )
    .eq("id", userId)
    .maybeSingle();

  if (pullError) {
    console.warn("[categoriesSync] pull failed:", pullError.message);
    return;
  }

  const remoteTs: number = profile?.custom_categories_updated_at ?? 0;
  const remoteIntentionTs: number = profile?.custom_intention_categories_updated_at ?? 0;
  const remoteCarryoverTs: number = profile?.last_carryover_prompt_date_updated_at ?? 0;

  // --- Activity categories ---
  if (remoteTs > localTs) {
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(localCategories);
    } catch {
      console.warn("[categoriesSync] local categories JSON is invalid, skipping push");
    }
    if (parsed !== undefined) {
      const { error: pushError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            custom_categories: parsed,
            custom_categories_updated_at: localTs,
          },
          { onConflict: "id" }
        );

      if (pushError) {
        console.warn("[categoriesSync] push failed:", pushError.message);
      }
    }
  }

  // --- Intention categories ---
  if (remoteIntentionTs > localIntentionTs) {
    const intentionJson = profile?.custom_intention_categories
      ? JSON.stringify(profile.custom_intention_categories)
      : null;
    await saveSettings({
      customIntentionCategories: intentionJson,
      intentionCategoriesSyncedAt: remoteIntentionTs,
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("intention-categories-updated"));
    }
  } else if (localIntentionTs > remoteIntentionTs && localIntentionCategories != null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(localIntentionCategories);
    } catch {
      console.warn("[categoriesSync] local intention categories JSON is invalid, skipping push");
      return;
    }
    const { error: pushError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          custom_intention_categories: parsed,
          custom_intention_categories_updated_at: localIntentionTs,
        },
        { onConflict: "id" }
      );

    if (pushError) {
      console.warn("[categoriesSync] intention push failed:", pushError.message);
    }
  }

  // --- lastCarryoverPromptDate ---
  // Same LWW pattern. Pulling sets the explicit syncedAt so saveSettings
  // doesn't auto-stamp it (which would mark it dirty and bounce back).
  if (remoteCarryoverTs > localCarryoverTs) {
    const remoteDate = (profile?.last_carryover_prompt_date as string | null) ?? null;
    await saveSettings({
      lastCarryoverPromptDate: remoteDate,
      lastCarryoverPromptDateSyncedAt: remoteCarryoverTs,
    });
  } else if (localCarryoverTs > remoteCarryoverTs && localCarryoverDate) {
    const { error: pushError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          last_carryover_prompt_date: localCarryoverDate,
          last_carryover_prompt_date_updated_at: localCarryoverTs,
        },
        { onConflict: "id" }
      );

    if (pushError) {
      console.warn("[categoriesSync] carryover push failed:", pushError.message);
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
  window.addEventListener("intention-categories-dirty", onDirty);
  window.addEventListener("carryover-prompt-date-dirty", onDirty);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);

  void syncCategoriesNow();

  teardown = () => {
    window.removeEventListener("categories-dirty", onDirty);
    window.removeEventListener("intention-categories-dirty", onDirty);
    window.removeEventListener("carryover-prompt-date-dirty", onDirty);
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
