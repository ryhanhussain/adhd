"use client";

import { useState } from "react";
import { type Entry } from "@/lib/db";
import { getCategoryStyle, type Category } from "@/lib/categories";
import { getEnergyEmoji } from "@/lib/energy";

interface TaDaTimelineProps {
  entries: Entry[];
  categories: Category[];
  onTap: (entry: Entry) => void;
  highlightIds?: Set<string>;
}

const INITIAL_SHOW = 10;

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function TaDaTimeline({ entries, categories, onTap, highlightIds }: TaDaTimelineProps) {
  const [showAll, setShowAll] = useState(false);

  // Sort oldest first (chronological order — building up the day)
  const sorted = [...entries].sort(
    (a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp)
  );

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_SHOW);
  const hasMore = sorted.length > INITIAL_SHOW && !showAll;

  if (sorted.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Today&apos;s Ta-Da List
        </h2>
        <span className="text-xs font-bold text-[var(--color-accent)] tabular-nums">
          {sorted.length} {sorted.length === 1 ? "thing" : "things"} done
        </span>
      </div>

      <div className="relative pl-6">
        {/* Vertical subway line */}
        <div
          className="absolute left-[7px] top-2 bottom-2 w-[2px] rounded-full"
          style={{ backgroundColor: "var(--color-border)" }}
        />

        <div className="flex flex-col gap-1">
          {visible.map((entry, i) => {
            const style = getCategoryStyle(entry.tags[0] || "Other", categories);
            const startTime = entry.startTime || entry.timestamp;
            const isTimer = entry.endTime === 0;
            const endTime = isTimer ? Date.now() : (entry.endTime || entry.timestamp);
            const durationMs = endTime - startTime;
            const isJustLanded = highlightIds?.has(entry.id);

            return (
              <div
                key={entry.id}
                className={`relative flex items-center gap-3 py-1.5 cursor-pointer group ${isJustLanded ? "animate-tada-land" : ""}`}
                onClick={() => onTap(entry)}
                style={{
                  opacity: 0,
                  animation: isJustLanded
                    ? `tadaLand 0.6s var(--spring-bouncy) forwards`
                    : `slideUp 0.3s var(--spring) ${i * 40}ms forwards`,
                }}
              >
                {/* Station dot */}
                <div
                  className={`absolute left-[-17px] w-[16px] h-[16px] rounded-full border-2 flex items-center justify-center z-10 transition-transform group-hover:scale-110 ${
                    isTimer ? "animate-now-pulse" : ""
                  }`}
                  style={{
                    borderColor: style.color,
                    backgroundColor: "var(--color-surface)",
                  }}
                >
                  <div
                    className="w-[6px] h-[6px] rounded-full"
                    style={{ backgroundColor: style.color }}
                  />
                </div>

                {/* Entry content */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-[10px] tabular-nums text-[var(--color-text-muted)] shrink-0 w-12">
                    {formatTime(startTime)}
                  </span>
                  <p className="text-sm truncate flex-1 group-hover:text-[var(--color-accent)] transition-colors">
                    {entry.summary || entry.text}
                  </p>
                  {entry.energy && (
                    <span className="text-xs shrink-0" title={`Energy: ${entry.energy}`}>
                      {getEnergyEmoji(entry.energy)}
                    </span>
                  )}
                </div>

                {/* Duration badge */}
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 tabular-nums ${
                    isTimer ? "animate-pulse-soft" : ""
                  }`}
                  style={{
                    backgroundColor: style.color + "30",
                    color: "var(--color-text)",
                  }}
                >
                  {isTimer ? `${formatDuration(durationMs)}+` : formatDuration(durationMs)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Show all button */}
        {hasMore && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-2 ml-2 text-xs font-medium text-[var(--color-accent)] hover:underline"
          >
            Show all {sorted.length} entries
          </button>
        )}
      </div>
    </div>
  );
}
