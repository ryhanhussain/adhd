"use client";

import { useEffect, useState } from "react";
import { getSettings } from "@/lib/db";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const applyTheme = async () => {
      const settings = await getSettings();
      const theme = settings.theme || "system";
      const html = document.documentElement;
      html.classList.remove("light", "dark");
      if (theme !== "system") {
        html.classList.add(theme);
      }
    };
    applyTheme();

    // Listen for theme changes from settings
    const handleThemeChange = () => applyTheme();
    window.addEventListener("theme-changed", handleThemeChange);
    return () => window.removeEventListener("theme-changed", handleThemeChange);
  }, []);

  if (!mounted) return null;
  return <>{children}</>;
}
