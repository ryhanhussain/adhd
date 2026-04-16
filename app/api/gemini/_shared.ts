import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export const GEMINI_MODEL = "gemini-2.5-flash-lite";

const DAILY_CAP = 50;

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
export async function checkAndIncrementQuota(userId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD UTC

  // Upsert: insert or increment atomically via RPC isn't available without a
  // custom function, so we read-then-write with service role (no TOCTOU risk
  // at our traffic scale).
  const { data, error } = await supabase
    .from("gemini_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();

  if (error) {
    console.error("quota read error:", error);
    // Fail open — don't block the user on a DB error
    return true;
  }

  const currentCount = data?.count ?? 0;
  if (currentCount >= DAILY_CAP) return false;

  if (data) {
    await supabase
      .from("gemini_usage")
      .update({ count: currentCount + 1 })
      .eq("user_id", userId)
      .eq("day", today);
  } else {
    await supabase
      .from("gemini_usage")
      .insert({ user_id: userId, day: today, count: 1 });
  }

  return true;
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
