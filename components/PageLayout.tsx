import { type ReactNode } from "react";

interface PageLayoutProps {
  children: ReactNode;
  /** Add bottom padding to clear the fixed navbar. Defaults to true. */
  padNav?: boolean;
  /** Vertical gap between direct children. Defaults to "5" (1.25rem). */
  gap?: "3" | "4" | "5" | "6" | "8";
  className?: string;
}

/**
 * Single-column page shell: centered, mobile-first max width, optional navbar clearance.
 * Home uses a wider 2-column grid and keeps its own wrapper.
 */
export default function PageLayout({
  children,
  padNav = true,
  gap = "5",
  className = "",
}: PageLayoutProps) {
  const gapClass = {
    "3": "gap-3",
    "4": "gap-4",
    "5": "gap-5",
    "6": "gap-6",
    "8": "gap-8",
  }[gap];

  return (
    <div
      className={`flex flex-col ${gapClass} lg:max-w-lg lg:mx-auto ${padNav ? "pb-nav" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
