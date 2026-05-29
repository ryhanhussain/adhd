import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export const AI_MODEL = "deepseek-chat";
export const GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_DAILY_CAP = 100;
/** Minimum ms between two allowed calls from the same user. Blocks scripted
 * bursts that would otherwise drain the daily cap in a single second. */
const BURST_MIN_MS = 1500;

type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export function isAIConfigurationError(error: unknown): error is AIConfigurationError {
  return error instanceof AIConfigurationError || (error instanceof Error && error.name === "AIConfigurationError");
}

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
  const env = getEnv();
  if (env.DEEPSEEK_API_KEY) {
    return callDeepSeekChat(env.DEEPSEEK_API_KEY, messages, config);
  }
  if (env.GEMINI_API_KEY) {
    return callGeminiChat(env.GEMINI_API_KEY, messages, config);
  }
  throw new AIConfigurationError("Set DEEPSEEK_API_KEY or GEMINI_API_KEY to use AI features");
}

async function callDeepSeekChat(
  apiKey: string,
  messages: AiMessage[],
  config: {
    temperature?: number;
    maxOutputTokens?: number;
    json?: boolean;
  }
): Promise<string> {
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

async function callGeminiChat(
  apiKey: string,
  messages: AiMessage[],
  config: {
    temperature?: number;
    maxOutputTokens?: number;
    json?: boolean;
  }
): Promise<string> {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          temperature: config.temperature ?? 0.2,
          maxOutputTokens: config.maxOutputTokens ?? 640,
          ...(config.json ? { responseMimeType: "application/json" } : {}),
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
