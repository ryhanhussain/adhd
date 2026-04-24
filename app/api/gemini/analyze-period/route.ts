import { NextRequest, NextResponse } from "next/server";
import {
  getUserFromRequest,
  checkAndIncrementQuota,
  checkAndIncrementFeatureCap,
  callGemini,
  ANALYZE_DAILY_CAP,
} from "../_shared";

export const runtime = "edge";

interface AnalyzeAggregates {
  totalMinutes: number;
  daysLogged: number;
  categoryBreakdown: { name: string; minutes: number; deltaPct: number | null }[];
  energyCounts: { high: number; medium: number; low: number; scattered: number };
  intentionStats: { created: number; completed: number; completionRate: number };
  moodStats: { avgMood: number | null; count: number };
  mostProductiveDayOfWeek: string | null;
  mostProductiveHourWindow: string | null;
  topActivities: { summary: string; count: number; minutes: number }[];
  growers: { name: string; deltaPct: number }[];
  shrinkers: { name: string; deltaPct: number }[];
}

/**
 * Trims and validates the client aggregates. Anything weird gets dropped
 * rather than 400-ing. Top activities strictly capped at 20 to bound both
 * token spend and the amount of per-entry-ish data that leaves the client.
 *
 * PRIVACY: `topActivities[].summary` is the AI-cleaned 12-word summary, NEVER
 * the raw user text. This invariant is maintained on the client side in
 * `lib/analysis.ts`; the route sanitizes length but does not inspect content.
 */
function sanitize(raw: unknown): AnalyzeAggregates | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const num = (v: unknown, d = 0): number => (typeof v === "number" && isFinite(v) ? v : d);
  const strOrNull = (v: unknown): string | null =>
    typeof v === "string" ? v.slice(0, 40) : null;

  const cats = Array.isArray(r.categoryBreakdown) ? r.categoryBreakdown : [];
  const categoryBreakdown = cats
    .slice(0, 12)
    .map((c: unknown) => {
      const row = (c ?? {}) as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name.slice(0, 40) : "";
      if (!name) return null;
      const minutes = num(row.minutes);
      const deltaPct = typeof row.deltaPct === "number" ? row.deltaPct : null;
      return { name, minutes, deltaPct };
    })
    .filter((x): x is { name: string; minutes: number; deltaPct: number | null } => !!x);

  const ec = (r.energyCounts ?? {}) as Record<string, unknown>;
  const energyCounts = {
    high: num(ec.high),
    medium: num(ec.medium),
    low: num(ec.low),
    scattered: num(ec.scattered),
  };

  const is = (r.intentionStats ?? {}) as Record<string, unknown>;
  const intentionStats = {
    created: num(is.created),
    completed: num(is.completed),
    completionRate: num(is.completionRate),
  };

  const ms = (r.moodStats ?? {}) as Record<string, unknown>;
  const moodStats = {
    avgMood: typeof ms.avgMood === "number" ? ms.avgMood : null,
    count: num(ms.count),
  };

  const topRaw = Array.isArray(r.topActivities) ? r.topActivities : [];
  const topActivities = topRaw
    .slice(0, 20)
    .map((a: unknown) => {
      const row = (a ?? {}) as Record<string, unknown>;
      const summary = typeof row.summary === "string" ? row.summary.slice(0, 140) : "";
      if (!summary) return null;
      return { summary, count: num(row.count), minutes: num(row.minutes) };
    })
    .filter((x): x is { summary: string; count: number; minutes: number } => !!x);

  const growersRaw = Array.isArray(r.growers) ? r.growers : [];
  const growers = growersRaw.slice(0, 5).map((g: unknown) => {
    const row = (g ?? {}) as Record<string, unknown>;
    return {
      name: typeof row.name === "string" ? row.name.slice(0, 40) : "",
      deltaPct: num(row.deltaPct),
    };
  }).filter((g) => g.name);

  const shrinkersRaw = Array.isArray(r.shrinkers) ? r.shrinkers : [];
  const shrinkers = shrinkersRaw.slice(0, 5).map((s: unknown) => {
    const row = (s ?? {}) as Record<string, unknown>;
    return {
      name: typeof row.name === "string" ? row.name.slice(0, 40) : "",
      deltaPct: num(row.deltaPct),
    };
  }).filter((s) => s.name);

  return {
    totalMinutes: num(r.totalMinutes),
    daysLogged: num(r.daysLogged),
    categoryBreakdown,
    energyCounts,
    intentionStats,
    moodStats,
    mostProductiveDayOfWeek: strOrNull(r.mostProductiveDayOfWeek),
    mostProductiveHourWindow: strOrNull(r.mostProductiveHourWindow),
    topActivities,
    growers,
    shrinkers,
  };
}

function formatMinutes(m: number): string {
  if (m <= 0) return "0h";
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  if (h === 0) return `${mm}m`;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

function buildPrompt(windowDays: number, agg: AnalyzeAggregates): string {
  const catLines = agg.categoryBreakdown
    .slice(0, 8)
    .map(
      (c) =>
        `- ${c.name}: ${formatMinutes(c.minutes)}${
          c.deltaPct != null
            ? ` (${c.deltaPct > 0 ? "+" : ""}${c.deltaPct}% vs prior period)`
            : ""
        }`
    )
    .join("\n");

  const topLines = agg.topActivities
    .slice(0, 12)
    .map((a) => `- "${a.summary}" — ${a.count}× · ${formatMinutes(a.minutes)}`)
    .join("\n");

  const moodLine =
    agg.moodStats.count >= 3 && agg.moodStats.avgMood != null
      ? `- Average mood: ${agg.moodStats.avgMood.toFixed(1)}/5 across ${agg.moodStats.count} reflections`
      : "- Mood: not enough reflections to summarize";

  const intentionsLine =
    agg.intentionStats.created > 0
      ? `- Intentions: ${agg.intentionStats.completed}/${agg.intentionStats.created} completed (${Math.round(
          agg.intentionStats.completionRate * 100
        )}%)`
      : "- Intentions: none planned in this period";

  const growersLine =
    agg.growers.length > 0
      ? `- Growing categories: ${agg.growers
          .map((g) => `${g.name} (+${g.deltaPct}%)`)
          .join(", ")}`
      : "";
  const shrinkersLine =
    agg.shrinkers.length > 0
      ? `- Shrinking categories: ${agg.shrinkers
          .map((s) => `${s.name} (${s.deltaPct}%)`)
          .join(", ")}`
      : "";

  return `You are a gentle, ADHD-aware coach. Given the aggregated data below, write 2–3 short paragraphs (~120 words total) about the user's last ${windowDays} days:

1. What stood out in their task makeup (pattern, rhythm, balance).
2. One specific surprise or pattern that might not be obvious at a glance.
3. One concrete, non-judgmental suggestion — practical, not aspirational.

Rules:
- No scolding or moralizing. Zero "you should have" energy.
- Don't just recite the numbers back — the user can already see them. Use specific, concrete language like "Thursdays look like your deep-work day" instead of "you spent X minutes on Thursday".
- No bullet points. Plain prose paragraphs only.
- Address the user as "you". Keep tone warm and observational.
- If data is thin (few days logged, few reflections), say so briefly and suggest what would sharpen the picture.

DATA (last ${windowDays} days):
- Total tracked: ${formatMinutes(agg.totalMinutes)} across ${agg.daysLogged} days
${catLines ? `- Category breakdown:\n${catLines}` : ""}
- Energy: ${agg.energyCounts.high} high, ${agg.energyCounts.medium} medium, ${agg.energyCounts.low} low, ${agg.energyCounts.scattered} scattered (by entry count)
${moodLine}
${intentionsLine}
${agg.mostProductiveDayOfWeek ? `- Best day of week: ${agg.mostProductiveDayOfWeek}` : ""}
${agg.mostProductiveHourWindow ? `- Peak hour window: ${agg.mostProductiveHourWindow}` : ""}
${growersLine}
${shrinkersLine}
${topLines ? `- Most frequent activities (summary · count · time):\n${topLines}` : ""}

Respond with plain prose only, no headers, no bullets.`;
}

export async function POST(req: NextRequest) {
  // Auth
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ summary: null }, { status: 401 });
  }

  // Global quota (includes burst guard)
  const globalQuota = await checkAndIncrementQuota(user.userId);
  if (!globalQuota.allowed) {
    console.error(
      `[analyze-period] 429 global user=${user.userId} reason=${globalQuota.reason}`
    );
    return NextResponse.json(
      { summary: null, _quota: globalQuota.reason },
      { status: 429 }
    );
  }

  // Feature cap (independent counter, tunable)
  const featureQuota = await checkAndIncrementFeatureCap(
    user.userId,
    "analyze",
    ANALYZE_DAILY_CAP
  );
  if (!featureQuota.allowed) {
    console.error(
      `[analyze-period] 429 feature user=${user.userId} reason=${featureQuota.reason}`
    );
    return NextResponse.json(
      { summary: null, _quota: "analysis_cap" },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ summary: null }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const windowDays =
    b.windowDays === 7 || b.windowDays === 30 || b.windowDays === 90 || b.windowDays === 400
      ? b.windowDays
      : 30;

  const aggregates = sanitize(b.aggregates);
  if (!aggregates) {
    return NextResponse.json({ summary: null }, { status: 400 });
  }

  const prompt = buildPrompt(windowDays, aggregates);

  try {
    const text = await callGemini(prompt, {
      temperature: 0.5,
      maxOutputTokens: 384,
    });
    const summary = text.trim();
    if (!summary) {
      return NextResponse.json({ summary: null, _quota: "error" }, { status: 502 });
    }
    return NextResponse.json({ summary });
  } catch (e) {
    console.error("analyze-period route error:", e);
    return NextResponse.json({ summary: null, _quota: "error" }, { status: 502 });
  }
}
