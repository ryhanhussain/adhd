"use client";

import { useState, useEffect, useCallback } from "react";
import { type Category, DEFAULT_CATEGORIES } from "./categories";
import { getSettings } from "./db";

export function useCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);

  const reload = useCallback(async () => {
    const s = await getSettings();
    if (!s.customCategories) {
      setCategories(DEFAULT_CATEGORIES);
      return;
    }
    try {
      const parsed = JSON.parse(s.customCategories) as Category[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setCategories(parsed);
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
    } catch {
      setCategories(DEFAULT_CATEGORIES);
    }
  }, []);

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    window.addEventListener("categories-updated", handler);
    return () => window.removeEventListener("categories-updated", handler);
  }, [reload]);

  return categories;
}
