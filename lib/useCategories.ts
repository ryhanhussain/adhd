"use client";

import { useState, useEffect } from "react";
import { type Category, DEFAULT_CATEGORIES } from "./categories";
import { getSettings } from "./db";

export function useCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    getSettings().then((s) => {
      if (s.customCategories) {
        try {
          const parsed = JSON.parse(s.customCategories) as Category[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCategories(parsed);
          }
        } catch {
          // ignore parse errors, use defaults
        }
      }
    });
  }, []);

  return categories;
}
