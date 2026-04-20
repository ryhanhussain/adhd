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
  const bucketRule = hasBuckets
    ? `
- Classify every task into one of the user's intention buckets (listed below). Match based on the bucket's name AND description — reason about which bucket the task belongs to, don't just keyword-match. Use null ONLY as a last resort when a task is genuinely unrelated to every bucket. Do not default to null for convenience. If a task is plausibly related to a bucket's theme (project, domain, life area), assign that bucket.`
    : "";

  const bucketList = hasBuckets
    ? `

User's intention buckets — classify each task into one of these:
${buckets.map((b) => `- id: "${b.id}" — ${b.name}${b.description ? ` — ${b.description}` : ""}`).join("\n")}

Only use the exact ids above. Do not invent new buckets or ids.`
    : "";

  const outputShape = hasBuckets
    ? `[{"text": "Task description", "categoryId": "<one of: ${buckets.map((b) => `\"${b.id}\"`).join(", ")}, or null>"}]`
    : `[{"text": "Task description"}]`;

  const prompt = `You are an ADHD-friendly task parser. Given a brain dump transcript, extract only real, actionable tasks or intentions.

Rules:
- Identify distinct, independent tasks. Two tasks are separate when they produce different deliverables or require independent effort — even if they share a topic, project, or phrase.
- Punctuation is unreliable: users separate tasks with commas, periods, newlines, "and", or nothing at all. Ignore delimiters and reason about meaning.
- DO split distinct deliverables that share a topic (e.g. "product design for the pivot, regulatory assessment for the pivot, research the go-to-market for the pivot" → three tasks; "finish the report, prep the slides, email the team" → three tasks)
- Do NOT split a single task whose verbs describe one action on one deliverable (e.g. "review and edit Cam's CV" → one task; "clean and organise the desk" → one task)
- Each item must be a concrete action the user needs to do — not a question, observation, or meta-comment about the app
- Filter out anything that isn't a real task: fragments, rhetorical questions, self-commentary, test phrases
- Rewrite each task as a short, scannable to-do label (ideally 3–8 words). Strip filler like "I need to", "I have to", "do some", "a full", "a bit of". Prefer an imperative verb or a clean noun phrase. Preserve specifics (names, deliverables, qualifiers like "draft" or "final") — don't over-compress or lose meaning.
- Example cleanup: "I need to work on the product design for the startup pivot" → "Product design for startup pivot"; "i need to do a full regulatory assessment for the new startup pivot" → "Regulatory assessment for pivot"; "do some research on the go to market for the pivot" → "Research go-to-market for pivot"; "I need to email Sarah about the Q3 numbers" → "Email Sarah about Q3 numbers"${bucketRule}
- Return at most 10 items
- If nothing actionable is found, return an empty array

Examples of what NOT to include:
- "If it summarises" → not a task, skip it
- "Categorizes the submissions" → not a user task, skip it
- "Let's see" / "So yeah" → filler, skip${bucketList}

Transcript: "${text}"

Respond with ONLY a JSON array of objects like ${outputShape}. No other text.`;

  try {
    const responseText = await callGemini(prompt, { temperature: 0.2, maxOutputTokens: 512 });

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ intentions: null });

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return NextResponse.json({ intentions: null });

    const validIds = new Set(buckets.map((b) => b.id));
    const idByName = new Map(buckets.map((b) => [b.name.toLowerCase(), b.id]));

    const intentions = parsed
      .filter((item: { text?: string }) => typeof item.text === "string" && item.text.trim().length > 0)
      .slice(0, 10)
      .map((item: { text: string; categoryId?: unknown }) => {
        const rawId = item.categoryId;
        let categoryId: string | null = null;
        if (hasBuckets && typeof rawId === "string") {
          if (validIds.has(rawId)) categoryId = rawId;
          else categoryId = idByName.get(rawId.toLowerCase()) ?? null;
        }
        return { text: item.text.trim(), categoryId };
      });

    return NextResponse.json({ intentions });
  } catch (e) {
    console.error("parse-brain-dump route error:", e);
    return NextResponse.json({ intentions: null });
  }
}
