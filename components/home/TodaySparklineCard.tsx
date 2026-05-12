"use client";

import { useMemo } from "react";
import type { Entry } from "@/lib/db";

interface TodaySparklineCardProps {
  entries: Entry[];
}

const SVG_W = 280;
const SVG_H = 56;

function buildHourlyMinutes(entries: Entry[]): number[] {
  const buckets = new Array<number>(24).fill(0);
  const now = Date.now();
  for (const e of entries) {
    const start = e.startTime || e.timestamp;
    const end = e.endTime && e.endTime > 0 ? e.endTime : now;
    if (end <= start) continue;
    // Walk one hour bucket at a time. Cap to today's local window.
    let cursor = start;
    while (cursor < end) {
      const d = new Date(cursor);
      const hour = d.getHours();
      const hourEnd = new Date(d);
      hourEnd.setMinutes(60, 0, 0);
      const slice = Math.min(end, hourEnd.getTime()) - cursor;
      buckets[hour] += slice / 60_000;
      cursor += slice;
    }
  }
  return buckets;
}

function formatDuration(totalMinutes: number): { h: number; m: number } {
  const rounded = Math.round(totalMinutes);
  return { h: Math.floor(rounded / 60), m: rounded % 60 };
}

function hour12(h: number): string {
  const hh = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 || h === 24 ? "am" : "pm";
  return `${hh}${suffix}`;
}

/**
 * Right-rail card: total focused minutes today + peak window + 24-hour
 * sparkline. Bezier-smoothed using the same control-point math as
 * EnergyInsights so the curve reads as "energy of the day" not a hard
 * histogram.
 */
export default function TodaySparklineCard({ entries }: TodaySparklineCardProps) {
  const { totalMinutes, peakHour, path, dotX, dotY } = useMemo(() => {
    const buckets = buildHourlyMinutes(entries);
    const total = buckets.reduce((acc, v) => acc + v, 0);
    const maxV = Math.max(1, ...buckets);
    let peak = 0;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i] > buckets[peak]) peak = i;
    }
    const points = buckets.map((v, i) => ({
      x: (i / 23) * SVG_W,
      y: SVG_H - (v / maxV) * (SVG_H - 6) - 3,
    }));

    let d = "";
    if (points.length > 1) {
      d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        d += ` C ${cpx.toFixed(2)} ${prev.y.toFixed(2)}, ${cpx.toFixed(
          2
        )} ${curr.y.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
      }
    }

    const dot = points[peak];
    return {
      totalMinutes: total,
      peakHour: peak,
      path: d,
      dotX: dot?.x ?? 0,
      dotY: dot?.y ?? 0,
    };
  }, [entries]);

  const { h, m } = formatDuration(totalMinutes);
  const hasData = totalMinutes >= 1;

  return (
    <div className="glass-panel rounded-2xl p-4 flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
        Today
      </p>
      <p className="text-2xl font-black tabular-nums leading-none">
        {h > 0 ? `${h}h ` : ""}
        {m}
        <span className="text-sm font-semibold text-[var(--color-text-muted)] ml-0.5">m</span>
      </p>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        {hasData ? `peak ${hour12(peakHour)}–${hour12(peakHour + 1)}` : "no peak yet"}
      </p>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full"
        style={{ height: 48 }}
        aria-hidden="true"
      >
        {hasData && (
          <>
            <path
              d={`${path} L ${SVG_W} ${SVG_H} L 0 ${SVG_H} Z`}
              fill="var(--color-accent)"
              opacity={0.12}
            />
            <path
              d={path}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={dotX} cy={dotY} r={2.5} fill="var(--color-accent)" />
          </>
        )}
      </svg>
    </div>
  );
}
