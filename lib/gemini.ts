import { supabase } from "@/lib/supabase";

export type GeminiEnergyLevel = "high" | "medium" | "low" | "scattered";

export interface GeminiResult {
  tags: string[];
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  isOngoing: boolean;
  summary: string | null;
  energy: GeminiEnergyLevel | null;
  aiProcessed: boolean;
}

const SAFE_DEFAULT: GeminiResult = {
  tags: ["Other"],
  startOffsetMinutes: 0,
  endOffsetMinutes: 0,
  isOngoing: false,
  summary: null,
  energy: null,
  aiProcessed: false,
};

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  if (!token) {
    console.warn("[ADDit] No Supabase session — AI categorization skipped. Check that you're logged in.");
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

export interface CategorizeOptions {
  /**
   * When set, the server's "now" context is anchored to end-of-day on this
   * local YYYY-MM-DD. Time offsets returned by Gemini are therefore relative
   * to 23:59 on the reference date — suitable for backdated logging.
   */
  referenceDate?: string;
}

export async function categorizeEntry(
  text: string,
  categoryNames: string[],
  opts?: CategorizeOptions
): Promise<GeminiResult> {
  const token = await getAuthToken();
  if (!token) return SAFE_DEFAULT;

  try {
    let refDate: Date;
    if (opts?.referenceDate) {
      const [y, mo, d] = opts.referenceDate.split("-").map(Number);
      refDate = new Date(y, mo - 1, d, 23, 59, 0, 0);
    } else {
      refDate = new Date();
    }
    const res = await fetch("/api/gemini/categorize/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        existingCategories: categoryNames,
        currentTime: refDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
        currentDate: refDate.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      }),
    });

    if (!res.ok) {
      const statusLabel = res.status === 401 ? "not authenticated" : res.status === 429 ? "daily quota exceeded (50/day)" : `server error ${res.status}`;
      console.error(`[ADDit] AI categorization failed: ${statusLabel}`);
      return SAFE_DEFAULT;
    }

    const data = await res.json();
    return { ...data, aiProcessed: true };
  } catch (e) {
    console.error("categorize fetch failed:", e);
    return SAFE_DEFAULT;
  }
}

export interface ParsedIntention {
  text: string;
  categoryId?: string | null;
}

/** Minimal shape the route needs; callers pass their full IntentionCategory list. */
export interface BrainDumpCategory {
  id: string;
  name: string;
  description: string;
}

export type BrainDumpResult =
  | { ok: true; intentions: ParsedIntention[] }
  | { ok: false; reason: "auth" | "cap" | "burst" | "quota_error" | "network" | "server" };

export async function parseBrainDump(
  transcript: string,
  categories?: BrainDumpCategory[]
): Promise<BrainDumpResult> {
  const token = await getAuthTokenWithRefresh();
  if (!token) return { ok: false, reason: "auth" };

  let res: Response;
  try {
    res = await fetch("/api/gemini/parse-brain-dump/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text: transcript,
        categories: categories ?? [],
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

  let data: { intentions?: unknown };
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "server" };
  }
  if (!Array.isArray(data.intentions)) return { ok: false, reason: "server" };
  return { ok: true, intentions: data.intentions as ParsedIntention[] };
}
