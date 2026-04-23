"use client";

interface EmptyHomeProps {
  totalDays: number;
  currentStreak: number;
}

export default function EmptyHome({ totalDays, currentStreak }: EmptyHomeProps) {
  const isFirstRun = totalDays === 0;

  const title = isFirstRun
    ? "Welcome to ADDit"
    : currentStreak > 0
      ? `${currentStreak}-day streak — keep it going`
      : "Clean slate today";

  const body = isFirstRun
    ? "Tell me what you just did — I'll handle the rest."
    : "Tap Log Activity below to mark what you're doing, or Plan Day to brain-dump.";

  return (
    <div className="glass-panel rounded-2xl p-6 text-center animate-fade-in">
      <div
        aria-hidden="true"
        className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "var(--color-accent-soft)" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </div>
      <p className="text-base font-semibold mb-1">{title}</p>
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm mx-auto">{body}</p>
    </div>
  );
}
