"use client";

import { useState, useEffect, useCallback } from "react";
import { type IntentionCategory } from "./categories";
import { getSettings } from "./db";

export function useIntentionCategories(): IntentionCategory[] {
  const [categories, setCategories] = useState<IntentionCategory[]>([]);

  const reload = useCallback(async () => {
    const s = await getSettings();
    if (!s.customIntentionCategories) {
      setCategories([]);
      return;
    }
    try {
      const parsed = JSON.parse(s.customIntentionCategories) as IntentionCategory[];
      if (Array.isArray(parsed)) {
        setCategories(parsed);
      } else {
        setCategories([]);
      }
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    window.addEventListener("intention-categories-updated", handler);
    return () => window.removeEventListener("intention-categories-updated", handler);
  }, [reload]);

  return categories;
}
