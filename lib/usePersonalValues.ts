"use client";

import { useCallback, useEffect, useState } from "react";
import { getSettings } from "./db";
import { parsePersonalValues, type PersonalValue } from "./values";

export function usePersonalValues(): PersonalValue[] {
  const [values, setValues] = useState<PersonalValue[]>([]);

  const reload = useCallback(async () => {
    const settings = await getSettings();
    setValues(parsePersonalValues(settings.personalValues));
  }, []);

  useEffect(() => {
    void reload();
    const handler = () => void reload();
    window.addEventListener("personal-values-updated", handler);
    window.addEventListener("personal-values-dirty", handler);
    window.addEventListener("life-areas-updated", handler);
    return () => {
      window.removeEventListener("personal-values-updated", handler);
      window.removeEventListener("personal-values-dirty", handler);
      window.removeEventListener("life-areas-updated", handler);
    };
  }, [reload]);

  return values;
}
