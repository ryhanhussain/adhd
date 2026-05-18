"use client";

import { useCallback, useEffect, useState } from "react";
import { getLifeAreas } from "./db";
import type { LifeArea } from "./lifeAreas";

export function useLifeAreas(options: { includeArchived?: boolean } = {}): LifeArea[] {
  const [lifeAreas, setLifeAreas] = useState<LifeArea[]>([]);
  const includeArchived = options.includeArchived ?? true;

  const reload = useCallback(async () => {
    setLifeAreas(await getLifeAreas({ includeArchived }));
  }, [includeArchived]);

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    window.addEventListener("life-area-dirty", handler);
    window.addEventListener("life-areas-updated", handler);
    window.addEventListener("entry-updated", handler);
    return () => {
      window.removeEventListener("life-area-dirty", handler);
      window.removeEventListener("life-areas-updated", handler);
      window.removeEventListener("entry-updated", handler);
    };
  }, [reload]);

  return lifeAreas;
}

