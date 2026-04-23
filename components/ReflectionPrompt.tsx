"use client";

import { useState, useEffect, useRef } from "react";
import { addReflection, getReflectionByDate, toLocalDateStr, type Entry } from "@/lib/db";

type MoodIconProps = { active: boolean };

const MoodFrown = ({ active }: MoodIconProps) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);
const MoodMeh = ({ active }: MoodIconProps) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="8" y1="15" x2="16" y2="15" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);
const MoodNeutral = ({ active }: MoodIconProps) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="8" y1="14" x2="16" y2="14" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);
const MoodSmile = ({ active }: MoodIconProps) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);
const MoodLaugh = ({ active }: MoodIconProps) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M7 13a5 5 0 0 0 10 0H7z" fill="currentColor" fillOpacity="0.15" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

const MOODS = [
  { Icon: MoodFrown, label: "Rough" },
  { Icon: MoodMeh, label: "Meh" },
  { Icon: MoodNeutral, label: "Okay" },
  { Icon: MoodSmile, label: "Good" },
  { Icon: MoodLaugh, label: "Great" },
];

interface ReflectionPromptProps {
  entries: Entry[];
}

function generateSummary(entries: Entry[]): string {
  if (entries.length === 0) return "No entries logged today.";

  const totalMs = entries.reduce((sum, e) => {
    const end = e.endTime === 0 ? Date.now() : e.endTime;
    return sum + Math.max(0, end - e.startTime);
  }, 0);
  const totalMin = Math.round(totalMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const timeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;

  const tags = new Set<string>();
  entries.forEach((e) => e.tags.forEach((t) => tags.add(t)));

  const phrases = [
    `You tracked ${timeStr} across ${entries.length} ${entries.length === 1 ? "entry" : "entries"} today.`,
    tags.size > 0 ? `Areas: ${Array.from(tags).join(", ")}.` : "",
  ].filter(Boolean);

  return phrases.join(" ");
}

export default function ReflectionPrompt({ entries }: ReflectionPromptProps) {
  const [visible, setVisible] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const moodButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const today = toLocalDateStr(new Date());

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 19) {
      setVisible(false);
      return;
    }
    // Check if already reflected today
    getReflectionByDate(today).then((existing) => {
      if (existing) {
        setSaved(true);
      }
      setVisible(true);
    });
  }, [today]);

  if (!visible || dismissed) return null;

  const summary = generateSummary(entries);

  const handleSave = async () => {
    if (mood === null) return;
    await addReflection({
      date: today,
      mood,
      note: note.trim(),
      summary,
      createdAt: Date.now(),
    });
    setSaved(true);
  };

  if (saved) {
    return (
      <div className="rounded-xl p-4 bg-[var(--color-surface)] border border-[var(--color-border)] animate-fade-in">
        <p className="text-sm text-center text-[var(--color-text-muted)]">
          ✓ Reflection saved. Rest well tonight.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 bg-[var(--color-surface)] border border-[var(--color-border)] animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">How was today?</h3>
        <button
          onClick={() => setDismissed(true)}
          className="text-[var(--color-text-muted)] text-xs min-h-11 px-2"
          aria-label="Dismiss reflection prompt"
        >
          Not now
        </button>
      </div>

      {/* Summary */}
      <p className="text-xs text-[var(--color-text-muted)] mb-3">{summary}</p>

      {/* Mood picker */}
      <div
        className="flex justify-between mb-3"
        role="radiogroup"
        aria-label="How was today"
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
          e.preventDefault();
          const current = mood ?? 0;
          const next =
            e.key === "ArrowRight" || e.key === "ArrowDown"
              ? current < 5 ? current + 1 : 1
              : current > 1 ? current - 1 : 5;
          setMood(next);
          moodButtonRefs.current[next - 1]?.focus();
        }}
      >
        {MOODS.map((m, i) => {
          const isActive = mood === i + 1;
          const Icon = m.Icon;
          return (
            <button
              key={i}
              ref={(el) => { moodButtonRefs.current[i] = el; }}
              onClick={() => setMood(i + 1)}
              role="radio"
              tabIndex={isActive ? 0 : mood === null && i === 0 ? 0 : -1}
              aria-checked={isActive}
              aria-label={m.label}
              className="flex flex-col items-center gap-1 min-w-11 min-h-11 p-2 rounded-lg transition-all"
              style={{
                backgroundColor: isActive ? "var(--color-accent-soft)" : "transparent",
                color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                transform: isActive ? "scale(1.1)" : "scale(1)",
              }}
            >
              <Icon active={isActive} />
              <span className="text-[9px]">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Optional note */}
      {mood !== null && (
        <div className="animate-fade-in">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything else on your mind? (optional)"
            className="w-full text-sm p-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] resize-none focus:outline-none focus:border-[var(--color-accent)]"
            rows={2}
          />
          <button
            onClick={handleSave}
            className="w-full mt-2 h-11 rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium active:scale-[0.98] transition-transform"
          >
            Save Reflection
          </button>
        </div>
      )}
    </div>
  );
}
