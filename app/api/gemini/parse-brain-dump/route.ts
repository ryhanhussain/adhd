import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, checkAndIncrementQuota, callGemini } from "../_shared";

export const runtime = "edge";

interface IncomingBucket {
  id: string;
  name: string;
  description: string;
}

/** Sanitizes client-supplied buckets; drops malformed rows rather than 400-ing. */
function sanitizeBuckets(raw: unknown): IncomingBucket[] {
  if (!Array.isArray(raw)) return [];
  const out: IncomingBucket[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.slice(0, 64) : null;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 20) : null;
    const description = typeof r.description === "string" ? r.description.trim().slice(0, 140) : "";
    if (!id || !name) continue;
    out.push({ id, name, description });
    if (out.length >= 3) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  // Auth
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ intentions: null }, { status: 401 });
  }

  // Quota
  const quota = await checkAndIncrementQuota(user.userId);
  if (!quota.allowed) {
    return NextResponse.json(
      { intentions: null, _quota: quota.reason },
      { status: 429 }
    );
  }

  const body = await req.json();
  const text: unknown = body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ intentions: null }, { status: 400 });
  }

  const buckets = sanitizeBuckets(body?.categories);
  const hasBuckets = buckets.length > 0;

  // Build prompt dynamically from the user's actual buckets — no hard-coded
  // taxonomies. If no buckets exist, the classification section is omitted
  // entirely and response items have categoryId: null.
  const bucketSection = hasBuckets
    ? `

The user has these intention buckets (use their own descriptions to decide fit):
${buckets.map((b) => `- id: "${b.id}" — ${b.name}${b.description ? `: "${b.description}"` : ""}`).join("\n")}

For each task, pick the id of the bucket whose description fits best, or null if none apply. Do not invent new buckets or ids. Use only the ids provided above.`
    : "";

  const outputShape = hasBuckets
    ? `[{"text": "Task description", "categoryId": "<one of: ${buckets.map((b) => `\"${b.id}\"`).join(", ")}, or null>"}]`
    : `[{"text": "Task description"}]`;

  const prompt = `You are an ADHD-friendly task parser. Given a brain dump transcript, extract only real, actionable tasks or intentions.

Rules:
- Split only when two genuinely independent tasks are listed together (e.g. "I need to call dentist, I need to buy groceries" → two tasks)
- Do NOT split when multiple verbs act on the same object (e.g. "review and edit Cam's CV" → one task, "clean and organise the desk" → one task)
- Each item must be a concrete action the user needs to do — not a question, observation, or meta-comment about the app
- Filter out anything that isn't a real task: fragments, rhetorical questions, self-commentary, test phrases
- Keep each task concise but preserve full meaning (don't truncate mid-thought)
- Return at most 10 items
- If nothing actionable is found, return an empty array

Examples of what NOT to include:
- "If it summarises" → not a task, skip it
- "Categorizes the submissions" → not a user task, skip it
- "Let's see" / "So yeah" → filler, skip${bucketSection}

Transcript: "${text}"

Respond with ONLY a JSON array of objects like ${outputShape}. No other text.`;

  try {
    const responseText = await callGemini(prompt, { temperature: 0.2, maxOutputTokens: 512 });

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ intentions: null });

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return NextResponse.json({ intentions: null });

    const validIds = new Set(buckets.map((b) => b.id));

    const intentions = parsed
      .filter((item: { text?: string }) => typeof item.text === "string" && item.text.trim().length > 0)
      .slice(0, 10)
      .map((item: { text: string; categoryId?: unknown }) => {
        const rawId = item.categoryId;
        const categoryId =
          hasBuckets && typeof rawId === "string" && validIds.has(rawId) ? rawId : null;
        return { text: item.text.trim(), categoryId };
      });

    return NextResponse.json({ intentions });
  } catch (e) {
    console.error("parse-brain-dump route error:", e);
    return NextResponse.json({ intentions: null });
  }
}
