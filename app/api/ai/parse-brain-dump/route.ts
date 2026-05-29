import { NextRequest, NextResponse } from "next/server";
import {
  callAIChat,
  checkAndIncrementQuota,
  getLocalDateFromRequest,
  getUserFromRequest,
  isAIConfigurationError,
} from "../_shared";

export const runtime = "edge";

type ParsedTask = {
  rawText: string;
  text: string;
  priority: "high" | "medium" | "low" | null;
  timeRequired: "quick" | "medium" | "long" | null;
  confidence: number | null;
};

const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_TIME_REQUIRED = new Set(["quick", "medium", "long"]);

function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function normalizePriority(value: unknown): ParsedTask["priority"] {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  return VALID_PRIORITIES.has(raw) ? (raw as ParsedTask["priority"]) : null;
}

function normalizeTimeRequired(value: unknown): ParsedTask["timeRequired"] {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  return VALID_TIME_REQUIRED.has(raw) ? (raw as ParsedTask["timeRequired"]) : null;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ items: null }, { status: 401 });
  }

  const quota = await checkAndIncrementQuota(user.userId, getLocalDateFromRequest(req));
  if (!quota.allowed) {
    console.error(`[parse-brain-dump] 429 user=${user.userId} reason=${quota.reason} count=${quota.count}`);
    return NextResponse.json({ items: null, _quota: quota.reason }, { status: 429 });
  }

  const body = await req.json();
  const text: unknown = body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ items: null }, { status: 400 });
  }

  const system = `You parse messy notes into future task intentions for ADDit.
Return JSON only. Ignore completed/past activity logs, reflections, journaling, habits, categories, life areas, moods, and vague fragments.`;
  const userPrompt = `Parse this brain dump into future tasks only. Split distinct tasks even if punctuation is messy.

Rules:
- Make each text a short clear task title.
- priority means urgency: high, medium, low, or null.
- timeRequired means likely effort: quick for under 15 minutes, medium for 15-45 minutes, long for over 45 minutes, or null when unclear.

Return JSON in exactly this shape:
{"items":[{"rawText":"string","text":"string","priority":"high|medium|low|null","timeRequired":"quick|medium|long|null","confidence":0.8}]}

Transcript JSON string: ${JSON.stringify(text.trim())}`;

  try {
    const responseText = await callAIChat(
      [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.15, maxOutputTokens: 640, json: true }
    );
    const parsedRoot = JSON.parse(responseText);
    const parsed = Array.isArray(parsedRoot) ? parsedRoot : parsedRoot?.items;
    if (!Array.isArray(parsed)) return NextResponse.json({ items: [] });

    const items: ParsedTask[] = parsed
      .map((raw: unknown) => {
        const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const text = cleanString(item.text ?? item.title, 140);
        return {
          rawText: cleanString(item.rawText ?? item.raw_text ?? text, 240),
          text,
          priority: normalizePriority(item.priority ?? item.urgency),
          timeRequired: normalizeTimeRequired(item.timeRequired ?? item.time_required ?? item.effort),
          confidence: normalizeConfidence(item.confidence),
        };
      })
      .filter((item) => item.text.length > 0)
      .slice(0, 12);

    return NextResponse.json({ items, intentions: items });
  } catch (e) {
    console.error("parse-brain-dump route error:", e);
    if (isAIConfigurationError(e)) {
      return NextResponse.json({ items: null, _error: "config" }, { status: 503 });
    }
    return NextResponse.json({ items: null }, { status: 500 });
  }
}
