"use client";

import { useEffect, useState } from "react";
import { getReflectionByDate, toLocalDateStr } from "@/lib/db";

/**
 * Afternoon anticipation chip (15:00–18:59 local). Turns the evening
 * reflection into something visible all afternoon instead of a surprise
 * modal at 7 pm. Once 19:00 hits, `ReflectionPrompt` takes over.
 *
 * Hidden when: before 15:00, at/after 19:00, or today's reflection is
 * already saved.
 */
export default function ReflectionTease() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const hour = new Date().getHours();
      if (hour < 15 || hour >= 19) {
        if (!cancelled) setVisible(false);
        return;
      }
      const existing = await getReflectionByDate(toLocalDateStr(new Date()));
      if (!cancelled) setVisible(!existing);
    };
    check();
    const interval = setInterval(check, 60_000);
    const handle = () => check();
    window.addEventListener("entry-updated", handle);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("entry-updated", handle);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="flex justify-center animate-fade-in">
      <span className="inline-flex items-center gap-1.5 px-3 h-7 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-[11px] font-semibold">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          <circle cx="12" cy="12" r="5" />
        </svg>
        Reflect tonight
      </span>
    </div>
  );
}
