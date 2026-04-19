import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export const GEMINI_MODEL = "gemini-2.5-flash-lite";

const DAILY_CAP = 50;
/** Minimum ms between two allowed calls from the same user. Blocks scripted
 *  bursts that would otherwise drain the daily cap in a single second. 1500ms
 *  is short enough that normal human-paced usage (brain-dump, reflection,
 *  categorize-activity) is unaffected even when they fire back-to-back. */
const BURST_MIN_MS = 1500;

// ---------------------------------------------------------------------------
// Supabase server client (service role — bypasses RLS for quota writes)
// ---------------------------------------------------------------------------
function getEnv() {
  try {
    return getRequestContext().env as Record<string, string>;
  } catch {
    return process.env as Record<string, string>;
  }
}

function getServiceSupabase() {
  const env = getEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase env vars");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function getUserFromRequest(req: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id };
}

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------
export type QuotaResult =
  | { allowed: true; count: number }
  | { allowed: false; reason: "cap" | "burst" | "error"; count: number };

/**
 * Atomically checks and increments the per-user daily Gemini quota.
 *
 * Backed by the `increment_and_check_quota` Postgres RPC (see
 * supabase/gemini-quota-rpc.sql). The RPC takes a row lock on the user's
 * (user_id, day) row, so concurrent requests from the same user serialize —
 * no TOCTOU window where two requests both see `count < cap` and bypass.
 *
 * Fails CLOSED on DB errors (returns `allowed: false`) so a DB outage can't
 * silently grant unlimited calls. Callers should surface this as 429.
 */
export async function checkAndIncrementQuota(userId: string): Promise<QuotaResult> {
  const supabase = getServiceSupabase();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD UTC

  const { data, error } = await supabase
    .rpc("increment_and_check_quota", {
      p_user_id: userId,
      p_day: today,
      p_cap: DAILY_CAP,
      p_burst_ms: BURST_MIN_MS,
    })
    .single<{ allowed: boolean; reason: string | null; count: number }>();

  if (error || !data) {
    console.error("quota RPC error:", error);
    return { allowed: false, reason: "error", count: 0 };
  }

  if (data.allowed) {
    return { allowed: true, count: data.count };
  }
  const reason: "cap" | "burst" = data.reason === "burst" ? "burst" : "cap";
  return { allowed: false, reason, count: data.count };
}

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------
export async function callGemini(
  prompt: string,
  config: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<string> {
  const apiKey = getEnv().GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: config.temperature ?? 0.1,
          maxOutputTokens: config.maxOutputTokens ?? 256,
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
