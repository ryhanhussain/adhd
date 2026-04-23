interface SkeletonProps {
  className?: string;
  /** Render as a rounded-2xl card shape. Sets a default h-24 if no height class given. */
  card?: boolean;
}

export default function Skeleton({ className = "", card = false }: SkeletonProps) {
  const base = card
    ? "h-24 rounded-2xl bg-[var(--color-surface)]/60"
    : "rounded bg-[var(--color-surface)]";
  return <div className={`${base} animate-shimmer ${className}`} />;
}
