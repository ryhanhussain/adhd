"use client";

import { type Entry } from "@/lib/db";
import { getCategoryStyle, type Category } from "@/lib/categories";
import TagBadge from "./TagBadge";

interface TimelineEntryProps {
  entry: Entry;
  categories: Category[];
  onTap: (entry: Entry) => void;
  style?: React.CSSProperties;
  showTimeOnCard?: boolean;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TimelineEntry({ entry, categories, onTap, style, showTimeOnCard = false }: TimelineEntryProps) {
  const primaryStyle = getCategoryStyle(entry.tags[0] || "Other", categories);
  const startTime = entry.startTime || entry.timestamp;
  const isTimer = entry.endTime === 0;
  const endTime = isTimer ? Date.now() : (entry.endTime || entry.timestamp);
  const durationMinutes = Math.round((endTime - startTime) / 60000);
  const hasDuration = durationMinutes > 0 || isTimer;

  return (
    <div
      onClick={() => onTap(entry)}
      className="glass-panel w-full rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-lg active:scale-[0.98] relative group"
      style={{
        borderLeft: `3px solid ${primaryStyle.color}`,
        ...style,
      }}
    >
      <div 
        className="absolute inset-0 opacity-[0.05] pointer-events-none group-hover:opacity-[0.12] transition-opacity duration-300"
        style={{ backgroundColor: primaryStyle.color }}
      />
      
      {/* Glossy highlight at top edge for premium feel */}
      <div className="absolute top-0 inset-x-0 h-px bg-white/10 dark:bg-white/5 pointer-events-none" />

      <div className="relative z-10 px-4 py-3.5 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-medium leading-snug flex-1">{entry.summary || entry.text}</p>
          
          <svg className="opacity-20 flex-shrink-0 mt-0.5 group-hover:opacity-60 transition-opacity duration-300" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mt-auto">
          {hasDuration && (
            <div
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full tabular-nums ${isTimer ? "animate-pulse-soft shadow-[0_0_12px_rgba(var(--color-accent-rgb),0.3)]" : ""}`}
              style={{
                backgroundColor: primaryStyle.color + (isTimer ? "25" : "15"),
                color: primaryStyle.color,
                border: `1px solid ${primaryStyle.color}30`
              }}
            >
              {isTimer && (
                <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              )}
              {isTimer ? `${formatDuration(durationMinutes)}+` : formatDuration(durationMinutes)}
            </div>
          )}

          {showTimeOnCard && (
            <span className="text-xs font-medium text-[var(--color-text-muted)] flex items-center gap-1.5 tabular-nums">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {formatTime(startTime)}{isTimer ? " — now" : hasDuration ? ` — ${formatTime(endTime)}` : ""}
            </span>
          )}

          <div className="flex flex-wrap gap-1.5 ml-auto">
            {entry.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} categories={categories} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
