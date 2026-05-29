import { NextRequest, NextResponse } from "next/server";
import {
  callAIChat,
  checkAndIncrementQuota,
  getLocalDateFromRequest,
  getUserFromRequest,
  isAIConfigurationError,
} from "../_shared";

export const runtime = "edge";

type Priority = "high" | "medium" | "low";
type TimeRequired = "quick" | "medium" | "long";

type PlannerTaskContext = {
  id: string;
  text: string;
  priority: Priority | null;
  timeRequired: TimeRequired | null;
  plannedDate: string | null;
  plannedStartMinute: number | null;
  plannedDurationMinutes: number | null;
};

type PlannerAction =
  | {
      type: "create_task";
      text: string;
      priority?: Priority | null;
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = new Set(["high", "medium", "low"]);
const TIME_REQUIRED = new Set(["quick", "medium", "long"]);

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanPriority(value: unknown): Priority | null {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  return PRIORITIES.has(raw) ? (raw as Priority) : null;
}

function cleanTimeRequired(value: unknown): TimeRequired | null {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  return TIME_REQUIRED.has(raw) ? (raw as TimeRequired) : null;
}

function cleanMinute(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 0 && value <= 1439 ? value : null;
}

function cleanDuration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 5 && value <= 480 ? value : null;
}

function cleanDate(value: unknown, today: string, tomorrow: string): string | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  return value === today || value === tomorrow ? value : null;
}

function cleanTasks(value: unknown, today: string, tomorrow: string): PlannerTaskContext[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const id = cleanString(item.id, 80);
      const text = cleanString(item.text, 160);
      if (!id || !text) return null;
      return {
        id,
        text,
        priority: cleanPriority(item.priority),
        timeRequired: cleanTimeRequired(item.timeRequired),
        plannedDate: cleanDate(item.plannedDate, today, tomorrow),
        plannedStartMinute: cleanMinute(item.plannedStartMinute),
        plannedDurationMinutes: cleanDuration(item.plannedDurationMinutes),
      };
    })
    .filter((item): item is PlannerTaskContext => item !== null)
    .slice(0, 80);
}

function cleanMessages(value: unknown): Array<{ role: "user" | "assistant"; text: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const role = item.role === "user" || item.role === "assistant" ? item.role : null;
      const text = cleanString(item.text, 1200);
      if (!role || !text) return null;
      return { role, text };
    })
    .filter((item): item is { role: "user" | "assistant"; text: string } => item !== null)
    .slice(-8);
}

function cleanActions(value: unknown, knownIds: Set<string>, today: string, tomorrow: string): PlannerAction[] {
  if (!Array.isArray(value)) return [];
  const actions: PlannerAction[] = [];

  for (const raw of value) {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const type = item.type;

    if (type === "create_task") {
      const text = cleanString(item.text, 140);
      if (!text) continue;
      const plannedDate = cleanDate(item.plannedDate, today, tomorrow);
      const plannedStartMinute = plannedDate ? cleanMinute(item.plannedStartMinute) : null;
      actions.push({
        type,
        text,
        priority: cleanPriority(item.priority),
        timeRequired: cleanTimeRequired(item.timeRequired),
        plannedDate: plannedDate && plannedStartMinute !== null ? plannedDate : null,
        plannedStartMinute,
        plannedDurationMinutes: cleanDuration(item.plannedDurationMinutes),
      });
      continue;
    }

    if (type === "edit_task") {
      const id = cleanString(item.id, 80);
      const text = cleanString(item.text, 140);
      if (!knownIds.has(id) || !text) continue;
      actions.push({ type, id, text });
      continue;
    }

    if (type === "schedule_task") {
      const id = cleanString(item.id, 80);
      const plannedDate = cleanDate(item.plannedDate, today, tomorrow);
      const plannedStartMinute = cleanMinute(item.plannedStartMinute);
      if (!knownIds.has(id) || !plannedDate || plannedStartMinute === null) continue;
      actions.push({
        type,
        id,
        plannedDate,
        plannedStartMinute,
        plannedDurationMinutes: cleanDuration(item.plannedDurationMinutes),
      });
      continue;
    }

    if (type === "unschedule_task") {
      const id = cleanString(item.id, 80);
      if (!knownIds.has(id)) continue;
      actions.push({ type, id });
    }
  }

  return actions.slice(0, 12);
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ message: null, actions: null }, { status: 401 });
  }

  const today = getLocalDateFromRequest(req);
  const tomorrow = addDays(today, 1);
  const quota = await checkAndIncrementQuota(user.userId, today);
  if (!quota.allowed) {
    console.error(`[planner] 429 user=${user.userId} reason=${quota.reason} count=${quota.count}`);
    return NextResponse.json({ message: null, actions: null, _quota: quota.reason }, { status: 429 });
  }

  const body = await req.json();
  const tasks = cleanTasks(body?.tasks, today, tomorrow);
  const messages = cleanMessages(body?.messages);
  const knownIds = new Set(tasks.map((task) => task.id));

  if (messages.length === 0) {
    return NextResponse.json({ message: null, actions: null }, { status: 400 });
  }

  const system = `You are ADDit's gentle daily planning assistant.
Return JSON only. Keep language concrete, low-shame, and short.
You may propose actions, but the user must preview and apply them.
Allowed dates are today ${today} and tomorrow ${tomorrow}; never use any other date.
Use plannedStartMinute as minutes after local midnight. Prefer 15-minute increments.
Only schedule, edit, or unschedule task IDs present in the task context.

Return exactly this JSON shape:
{"message":"short assistant text","actions":[{"type":"schedule_task","id":"task id","plannedDate":"${today}","plannedStartMinute":540,"plannedDurationMinutes":30}]}

Allowed action types:
- create_task: text, optional priority high|medium|low|null, optional timeRequired quick|medium|long|null, optional plannedDate/plannedStartMinute/plannedDurationMinutes
- edit_task: id, text
- schedule_task: id, plannedDate, plannedStartMinute, optional plannedDurationMinutes
- unschedule_task: id`;

  const userPrompt = JSON.stringify({
    today,
    tomorrow,
    tasks,
    recentMessages: messages,
  });

  try {
    const responseText = await callAIChat(
      [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, maxOutputTokens: 900, json: true }
    );
    const parsed = JSON.parse(responseText) as { message?: unknown; actions?: unknown };
    const message = cleanString(parsed.message, 700) || "I sketched a small plan.";
    const actions = cleanActions(parsed.actions, knownIds, today, tomorrow);
    return NextResponse.json({ message, actions });
  } catch (e) {
    console.error("planner route error:", e);
    if (isAIConfigurationError(e)) {
      return NextResponse.json({ message: null, actions: null, _error: "config" }, { status: 503 });
    }
    return NextResponse.json({ message: null, actions: null }, { status: 500 });
  }
}
