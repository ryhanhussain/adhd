"use client";

import { type Entry } from "@/lib/db";
import { getDailyEnergyData, getEnergyColor, type EnergyPoint } from "@/lib/energy";

interface EnergyInsightsProps {
  entries: Entry[];
}

const ENERGY_Y: Record<string, number> = {
  high: 8,
  medium: 24,
  scattered: 40,
  low: 56,
};

function timeToX(point: EnergyPoint, minHour: number, maxHour: number, width: number): number {
  const totalMinutes = (maxHour - minHour) * 60;
  const pointMinutes = (point.hour - minHour) * 60 + point.minute;
  return (pointMinutes / totalMinutes) * width;
}

export default function EnergyInsights({ entries }: EnergyInsightsProps) {
  const { points, counts } = getDailyEnergyData(entries);

  if (points.length === 0) return null;

  const totalEnergy = counts.high + counts.medium + counts.low + counts.scattered;
  const minHour = Math.max(0, points[0].hour - 1);
  const maxHour = Math.min(24, points[points.length - 1].hour + 2);
  const svgWidth = 280;
  const svgHeight = 64;

  // Build path connecting the dots
  const pathPoints = points.map((p) => ({
    x: timeToX(p, minHour, maxHour, svgWidth),
    y: ENERGY_Y[p.energy],
  }));

  let pathD = "";
  if (pathPoints.length > 1) {
    pathD = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
    for (let i = 1; i < pathPoints.length; i++) {
      const prev = pathPoints[i - 1];
      const curr = pathPoints[i];
      const cpx = (prev.x + curr.x) / 2;
      pathD += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
  }

  // Hour labels
  const hourLabels: { hour: number; x: number }[] = [];
  for (let h = Math.ceil(minHour); h <= Math.floor(maxHour); h += 2) {
    hourLabels.push({ hour: h, x: timeToX({ hour: h, minute: 0, energy: "high", timestamp: 0 }, minHour, maxHour, svgWidth) });
  }

  return (
    <div className="mt-4 animate-fade-in">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
        Energy Today
      </h3>

      {/* SVG dot-line chart */}
      <div className="w-full overflow-hidden">
        <svg viewBox={`-10 -4 ${svgWidth + 20} ${svgHeight + 20}`} className="w-full" style={{ height: 80 }}>
          {/* Y-axis labels */}
          <text x="-8" y={ENERGY_Y.high + 4} fontSize="7" fill="var(--color-text-muted)" textAnchor="end">🔋</text>
          <text x="-8" y={ENERGY_Y.medium + 4} fontSize="7" fill="var(--color-text-muted)" textAnchor="end">⚡</text>
          <text x="-8" y={ENERGY_Y.scattered + 4} fontSize="7" fill="var(--color-text-muted)" textAnchor="end">🌪️</text>
          <text x="-8" y={ENERGY_Y.low + 4} fontSize="7" fill="var(--color-text-muted)" textAnchor="end">🪫</text>

          {/* Horizontal guide lines */}
          {[ENERGY_Y.high, ENERGY_Y.medium, ENERGY_Y.scattered, ENERGY_Y.low].map((y) => (
            <line
              key={y}
              x1={0}
              y1={y}
              x2={svgWidth}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth="0.5"
              opacity="0.4"
            />
          ))}

          {/* Connecting line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              opacity="0.4"
              strokeLinecap="round"
            />
          )}

          {/* Dots */}
          {points.map((p, i) => {
            const x = timeToX(p, minHour, maxHour, svgWidth);
            const y = ENERGY_Y[p.energy];
            const color = getEnergyColor(p.energy);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="6" fill={color} opacity="0.15" />
                <circle
                  cx={x}
                  cy={y}
                  r="3.5"
                  fill={color}
                  style={{ animation: `fadeIn 0.3s ease ${i * 80}ms backwards` }}
                />
              </g>
            );
          })}

          {/* Hour labels */}
          {hourLabels.map(({ hour, x }) => (
            <text
              key={hour}
              x={x}
              y={svgHeight + 12}
              fontSize="7"
              fill="var(--color-text-muted)"
              textAnchor="middle"
            >
              {hour % 12 || 12}{hour >= 12 ? "p" : "a"}
            </text>
          ))}
        </svg>
      </div>

      {/* Summary pills */}
      {totalEnergy >= 2 && (
        <div className="flex gap-1.5 mt-1">
          {(["high", "medium", "low", "scattered"] as const).map((level) => {
            if (counts[level] === 0) return null;
            return (
              <span
                key={level}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: getEnergyColor(level) + "18",
                  color: getEnergyColor(level),
                }}
              >
                {counts[level]} {level}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
