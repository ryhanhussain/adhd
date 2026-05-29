import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export const AI_MODEL = "deepseek-v4-flash";
const DEFAULT_DAILY_CAP = 100;
/** Minimum ms between two allowed calls from the same user. Blocks scripted
 * bursts that would otherwise drain the daily cap in a single second. */
const BURST_MIN_MS = 1500;

type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function getEnv() {
  try {
    return getRequestContext().env as Record<string, string>;
  } catch {
    return process.env as Record<string, string>;
  }
}

export function getDailyCap(): number {
  const raw = Number.parseInt(getEnv().AI_DAILY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_CAP;
}

export function getServiceSupabase() {
  const env = getEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase env vars");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function getUserFromRequest(req: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

export type QuotaResult =
  | { allowed: true; count: number }
  | { allowed: false; reason: "cap" | "burst" | "error"; count: number };

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getLocalDateFromRequest(req: NextRequest): string {
  const header = req.headers.get("X-Local-Date");
  if (header && LOCAL_DATE_RE.test(header)) return header;
  return new Date().toISOString().split("T")[0];
}

/**
 * Atomically checks and increments the per-user daily AI quota.
 *
 * Backed by the existing `increment_and_check_quota` RPC/table. The database
 * name still says Gemini for compatibility; the app treats it as generic AI
 * usage from here on.
 */
export async function checkAndIncrementQuota(userId: string, day: string): Promise<QuotaResult> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .rpc("increment_and_check_quota", {
      p_user_id: userId,
      p_day: day,
      p_cap: getDailyCap(),
      p_burst_ms: BURST_MIN_MS,
    })
    .single<{ allowed: boolean; reason: string | null; count: number }>();

  if (error || !data) {
    console.error("AI quota RPC error:", error);
    return { allowed: false, reason: "error", count: 0 };
  }

  if (data.allowed) {
    return { allowed: true, count: data.count };
  }
  const reason: "cap" | "burst" = data.reason === "burst" ? "burst" : "cap";
  return { allowed: false, reason, count: data.count };
}

export async function callAIChat(
  messages: AiMessage[],
  config: {
    temperature?: number;
    maxOutputTokens?: number;
    json?: boolean;
  } = {}
): Promise<string> {
  const apiKey = getEnv().DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      thinking: { type: "disabled" },
      stream: false,
      temperature: config.temperature ?? 0.2,
      max_tokens: config.maxOutputTokens ?? 640,
      ...(config.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
