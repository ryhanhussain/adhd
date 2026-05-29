import { supabase } from "@/lib/supabase";
import { toLocalDateStr, type PriorityLevel, type TimeRequired } from "@/lib/db";

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  if (!token) {
    console.warn("[ADDit] No Supabase session - AI request skipped. Check that you're logged in.");
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
  priority?: PriorityLevel | null;
  timeRequired?: TimeRequired | null;
  confidence?: number | null;
}

export type AiFailureReason = "auth" | "cap" | "burst" | "quota_error" | "network" | "server";

export type BrainDumpResult =
  | { ok: true; intentions: ParsedIntention[] }
  | { ok: false; reason: AiFailureReason };

async function authedPost(path: string, body: unknown): Promise<Response | { networkError: true }> {
  const token = await getAuthTokenWithRefresh();
  if (!token) return new Response(null, { status: 401 });

  try {
    return await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Local-Date": toLocalDateStr(new Date()),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`${path} fetch failed:`, e);
    return { networkError: true };
  }
}

async function failureReasonFromResponse(res: Response): Promise<AiFailureReason> {
  if (res.status === 401) return "auth";
  if (res.status === 429) {
    let quotaReason: string | undefined;
    try {
      const body = (await res.json()) as { _quota?: unknown };
      if (typeof body._quota === "string") quotaReason = body._quota;
    } catch {}
    if (quotaReason === "burst") return "burst";
    if (quotaReason === "error") return "quota_error";
    return "cap";
  }
  return "server";
}

export async function parseBrainDump(transcript: string): Promise<BrainDumpResult> {
  const res = await authedPost("/api/ai/parse-brain-dump/", { text: transcript });
  if ("networkError" in res) return { ok: false, reason: "network" };
  if (!res.ok) return { ok: false, reason: await failureReasonFromResponse(res) };

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

export type PlannerChatMessage = {
  role: "user" | "assistant";
  text: string;
  createdAt?: number;
};

export type PlannerTaskContext = {
  id: string;
  text: string;
  priority: PriorityLevel | null;
  timeRequired: TimeRequired | null;
  plannedDate: string | null;
  plannedStartMinute: number | null;
  plannedDurationMinutes: number | null;
};

export type PlannerAction =
  | {
      type: "create_task";
      text: string;
      priority?: PriorityLevel | null;
      timeRequired?: TimeRequired | null;
      plannedDate?: string | null;
      plannedStartMinute?: number | null;
      plannedDurationMinutes?: number | null;
    }
  | { type: "edit_task"; id: string; text: string }
  | {
      type: "schedule_task";
      id: string;
      plannedDate: string;
      plannedStartMinute: number;
      plannedDurationMinutes?: number | null;
    }
  | { type: "unschedule_task"; id: string };

export type PlannerChatResult =
  | { ok: true; message: string; actions: PlannerAction[] }
  | { ok: false; reason: AiFailureReason };

export async function requestPlannerPlan(input: {
  messages: PlannerChatMessage[];
  tasks: PlannerTaskContext[];
  todayDate: string;
  tomorrowDate: string;
}): Promise<PlannerChatResult> {
  const res = await authedPost("/api/ai/planner/", input);
  if ("networkError" in res) return { ok: false, reason: "network" };
  if (!res.ok) return { ok: false, reason: await failureReasonFromResponse(res) };

  try {
    const data = (await res.json()) as { message?: unknown; actions?: unknown };
    return {
      ok: true,
      message: typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : "I sketched a small plan.",
      actions: Array.isArray(data.actions) ? (data.actions as PlannerAction[]) : [],
    };
  } catch {
    return { ok: false, reason: "server" };
  }
}
