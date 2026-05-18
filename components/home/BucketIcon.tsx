import type { BucketIconKey } from "@/lib/categories";

interface BucketIconProps {
  name?: BucketIconKey;
  size?: number;
  className?: string;
}

/**
 * Inline-SVG icon registry for intention buckets. Stroke-only and driven by
 * `currentColor` so the parent can color the icon via CSS. All icons share
 * the same 24x24 viewBox and visual weight so they swap cleanly inside the
 * bucket-card icon chip.
 */
export default function BucketIcon({ name = "sparkle", size = 18, className }: BucketIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };

  switch (name) {
    case "briefcase":
      return (
        <svg {...common}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M2 13h20" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "cart":
      return (
        <svg {...common}>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
        </svg>
      );
    case "heart-pulse":
      return (
        <svg {...common}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
          <path d="M3.22 12H9.5l.5-1 2 4 .5-2 .5 2 1-2h6.78" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "dumbbell":
      return (
        <svg {...common}>
          <path d="M6 5v14M2 9v6M18 5v14M22 9v6M6 12h12" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
          <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5H6.5A2.5 2.5 0 0 0 4 19.5z" />
        </svg>
      );
    case "leaf":
      return (
        <svg {...common}>
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6" />
        </svg>
      );
    case "brain":
      return (
        <svg {...common}>
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3 2.5 2.5 0 0 1 2.46-2.04Z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3 2.5 2.5 0 0 0-2.46-2.04Z" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5z" />
        </svg>
      );
    case "code":
      return (
        <svg {...common}>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case "palette":
      return (
        <svg {...common}>
          <circle cx="13.5" cy="6.5" r="1.5" />
          <circle cx="17.5" cy="10.5" r="1.5" />
          <circle cx="8.5" cy="7.5" r="1.5" />
          <circle cx="6.5" cy="12.5" r="1.5" />
          <path d="M12 22a10 10 0 1 1 10-10c0 1.66-1.34 3-3 3h-2.6a2 2 0 0 0-1.95 2.45l.07.3a2 2 0 0 1-1.95 2.45H12Z" />
        </svg>
      );
    case "moon-star":
      return (
        <svg {...common}>
          <path d="M12 3a6.6 6.6 0 0 0 8.6 8.6A8 8 0 1 1 12 3Z" />
          <path d="M19 3v4M17 5h4" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "hand-helping":
      return (
        <svg {...common}>
          <path d="M11 12h2a2 2 0 0 0 0-4h-2.5a3 3 0 0 0-2.1.86L3 14" />
          <path d="m7 18 1.6-1.4a3 3 0 0 1 2-.6H15a3 3 0 0 0 2.1-.86l4.4-4.14a2 2 0 0 0-2.8-2.86L16 10.5" />
          <path d="m2 13 6 6" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
      );
    case "coins":
      return (
        <svg {...common}>
          <ellipse cx="8" cy="6" rx="5" ry="3" />
          <path d="M3 6v6c0 1.7 2.2 3 5 3s5-1.3 5-3V6" />
          <path d="M13 9.5c2.9.2 5 1.4 5 3s-2.2 3-5 3c-1.2 0-2.3-.2-3.1-.6" />
          <path d="M18 12.5v5c0 1.7-2.2 3-5 3-2 0-3.7-.7-4.5-1.7" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "church":
      return (
        <svg {...common}>
          <path d="M12 2v5" />
          <path d="M9.5 4.5h5" />
          <path d="m5 10 7-5 7 5" />
          <path d="M6 10v11h12V10" />
          <path d="M10 21v-6a2 2 0 0 1 4 0v6" />
        </svg>
      );
    case "graduation-cap":
      return (
        <svg {...common}>
          <path d="M22 10 12 5 2 10l10 5 10-5Z" />
          <path d="M6 12v5c3 2 9 2 12 0v-5" />
          <path d="M22 10v6" />
        </svg>
      );
    case "baby":
      return (
        <svg {...common}>
          <path d="M9 12h.01M15 12h.01" />
          <path d="M10 16c1.2.8 2.8.8 4 0" />
          <path d="M19 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          <path d="M12 3c-1.3 0-2.5.6-3.3 1.5C9.7 5.2 11.1 5 12 4c.9 1 2.3 1.2 3.3.5A4.3 4.3 0 0 0 12 3Z" />
        </svg>
      );
    case "smile":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <path d="M9 9h.01M15 9h.01" />
        </svg>
      );
    case "wrench":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.8-2.8 2.2-2.6Z" />
        </svg>
      );
    case "plane":
      return (
        <svg {...common}>
          <path d="M17.8 19.2 16 11l5-5a2 2 0 0 0-3-3l-5 5-8.2-1.8L3 8l6 4-4 4-3-.5L1 17l4 2 2 4 1.5-1-.5-3 4-4 4 6 1.8-1.8Z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
  }
}
