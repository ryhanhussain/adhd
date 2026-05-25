import { supabase } from "@/lib/supabase";
import { toLocalDateStr } from "@/lib/db";

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  if (!token) {
    console.warn("[ADDit] No Supabase session - AI parsing skipped. Check that you're logged in.");
  }
  return token;
}

/** Tries to get a token; on miss, attempts a session refresh once before giving up. */
async function getAuthTokenWithRefresh(): Promise<string | null> {
  const first = await getAuthToken();
  if (first) return first;
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    console.warn("[ADDit] refreshSession failed:", error.message);
    return null;
  }
  return data.session?.access_token ?? null;
}

export interface ParsedIntention {
  rawText?: string;
  tense?: "past" | "future";
  text: string;
  priority?: "high" | "medium" | "low" | null;
  timeRequired?: "quick" | "medium" | "long" | null;
  confidence?: number | null;
}

export type BrainDumpResult =
  | { ok: true; intentions: ParsedIntention[] }
  | { ok: false; reason: "auth" | "cap" | "burst" | "quota_error" | "network" | "server" };

export async function parseBrainDump(transcript: string): Promise<BrainDumpResult> {
  const token = await getAuthTokenWithRefresh();
  if (!token) return { ok: false, reason: "auth" };

  let res: Response;
  try {
    res = await fetch("/api/gemini/parse-brain-dump/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Local-Date": toLocalDateStr(new Date()),
      },
      body: JSON.stringify({
        text: transcript,
      }),
    });
  } catch (e) {
    console.error("parse-brain-dump fetch failed:", e);
    return { ok: false, reason: "network" };
  }

  if (!res.ok) {
    if (res.status === 401) return { ok: false, reason: "auth" };
    if (res.status === 429) {
      // Server returns `_quota: "cap" | "burst" | "error"` so we can give a
      // specific toast instead of "Daily AI limit reached" for everything.
      let quotaReason: string | undefined;
      try {
        const body = (await res.json()) as { _quota?: unknown };
        if (typeof body._quota === "string") quotaReason = body._quota;
      } catch {}
      console.error("parse-brain-dump 429:", quotaReason ?? "unknown");
      if (quotaReason === "burst") return { ok: false, reason: "burst" };
      if (quotaReason === "error") return { ok: false, reason: "quota_error" };
      return { ok: false, reason: "cap" };
    }
    console.error("parse-brain-dump API error:", res.status);
    return { ok: false, reason: "server" };
  }

  let data: { intentions?: unknown; items?: unknown };
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "server" };
  }
  const items = Array.isArray(data.items) ? data.items : data.intentions;
  if (!Array.isArray(items)) return { ok: false, reason: "server" };
  return { ok: true, intentions: items as ParsedIntention[] };
}
