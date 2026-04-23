"use client";

import { type ReactNode } from "react";

interface ToastProps {
  message: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Where to pin vertically. `nav` sits above the bottom nav; `dock` sits above the input dock (Home). */
  position?: "nav" | "dock";
}

export default function Toast({ message, action, position = "dock" }: ToastProps) {
  const clearance = position === "nav" ? "above-nav" : "above-dock";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed ${clearance} left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-5 py-2.5 rounded-full bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium shadow-lg animate-toast-in`}
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
