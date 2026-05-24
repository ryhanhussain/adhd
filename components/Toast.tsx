"use client";

import { type ReactNode } from "react";

interface ToastProps {
  message: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Where to pin vertically. `nav` uses safe-area clearance; `dock` sits above the Home input dock. */
  position?: "nav" | "dock";
}

export default function Toast({ message, action, position = "nav" }: ToastProps) {
  const clearance = position === "nav" ? "above-nav" : "above-dock";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed ${clearance} left-1/2 z-[70] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full bg-[var(--color-text)] px-5 py-2.5 text-sm font-bold text-[var(--color-bg)] shadow-lg animate-toast-in`}
    >
      <span>{message}</span>
      {action && (
        <button
          onClick={action.onClick}
          className="font-bold underline underline-offset-2"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
