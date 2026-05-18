import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, checkAndIncrementQuota, callGemini, getLocalDateFromRequest } from "../_shared";

export const runtime = "edge";

interface IncomingBucket {
  id: string;
  name: string;
  description: string;
}

interface IncomingLifeArea {
  id: string;
  name: string;
  description: string;
}

interface IncomingActivityCategory {
  name: string;
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

function sanitizeLifeAreas(raw: unknown): IncomingLifeArea[] {
  if (!Array.isArray(raw)) return [];
  const out: IncomingLifeArea[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.slice(0, 64) : null;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 30) : null;
    const description = typeof r.description === "string" ? r.description.trim().slice(0, 140) : "";
    if (!id || !name) continue;
    out.push({ id, name, description });
    if (out.length >= 5) break;
  }
  return out;
}

function sanitizeActivityCategories(raw: unknown): IncomingActivityCategory[] {
  if (!Array.isArray(raw)) return [];
  const out: IncomingActivityCategory[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 40) : null;
    if (!name) continue;
    out.push({ name });
    if (out.length >= 12) break;
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
  const quota = await checkAndIncrementQuota(user.userId, getLocalDateFromRequest(req));
  if (!quota.allowed) {
    console.error(
      `[parse-brain-dump] 429 user=${user.userId} reason=${quota.reason} count=${quota.count}`
    );
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
  const lifeAreas = sanitizeLifeAreas(body?.lifeAreas);
  const activityCategories = sanitizeActivityCategories(body?.activityCategories);

  const bucketList = buckets.length
    ? buckets.map((b) => `- ${b.id}: ${b.name}${b.description ? ` — ${b.description}` : ""}`).join("\n")
    : "- none";
  const lifeAreaList = lifeAreas.length
    ? lifeAreas.map((a) => `- ${a.id}: ${a.name}${a.description ? ` — ${a.description}` : ""}`).join("\n")
    : "- none";
  const categoryList = activityCategories.length
    ? activityCategories.map((c) => `- ${c.name}`).join("\n")
    : "- Other";

  const prompt = `Parse this ADHD brain dump into real items. Split distinct tasks/activities even when punctuation is messy. Skip filler, questions, app tests, and vague fragments.

For each item detect:
- tense: "past" if already happened ("spent", "did", "finished", "took me", "from 2-3pm", "this morning"); "future" for tasks ("call", "write", "need to", checklist phrasing).
- text: short clean title.
- categoryName: one existing activity category or null.
- categoryId: future-only bucket id or null.
- lifeAreaId: best matching life area id or null. Never force a fit.
- priority: future-only high/medium/low/null.
- durationMinutes and loggedAt: past-only. Use ISO loggedAt near the activity end; current time if unclear.
- energy: high/medium/low/scattered/null if obvious.

Life areas:
${lifeAreaList}

Activity categories:
${categoryList}

Future buckets:
${bucketList}

Current time: ${new Date().toISOString()}

Return JSON only:
{"items":[{"rawText":"string","tense":"past|future","text":"string","categoryName":"string|null","categoryId":"uuid|null","lifeAreaId":"uuid|null","priority":"high|medium|low|null","durationMinutes":30,"loggedAt":"ISO|null","energy":"high|medium|low|scattered|null","confidence":0.8}]}

Transcript: ${JSON.stringify(text.trim())}`;

  try {
    const responseText = await callGemini(prompt, { temperature: 0.2, maxOutputTokens: 512 });

    const jsonMatch = responseText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ intentions: null });

    const parsedRoot = JSON.parse(jsonMatch[0]);
    const parsed = Array.isArray(parsedRoot) ? parsedRoot : parsedRoot?.items;
    if (!Array.isArray(parsed)) return NextResponse.json({ intentions: null });

    const validIds = new Set(buckets.map((b) => b.id));
    const idByName = new Map(buckets.map((b) => [b.name.toLowerCase(), b.id]));
    const validLifeAreaIds = new Set(lifeAreas.map((a) => a.id));
    const lifeAreaIdByName = new Map(lifeAreas.map((a) => [a.name.toLowerCase(), a.id]));
    const validCategoryNames = new Set(activityCategories.map((c) => c.name.toLowerCase()));
    const categoryNameByLower = new Map(activityCategories.map((c) => [c.name.toLowerCase(), c.name]));
    const validEnergies = new Set(["high", "medium", "low", "scattered"]);
    const validPriorities = new Set(["high", "medium", "low"]);

    const items = parsed
      .filter((item: { text?: string; title?: string }) => {
        const title = typeof item.text === "string" ? item.text : item.title;
        return typeof title === "string" && title.trim().length > 0;
      })
      .slice(0, 10)
      .map((item: {
        rawText?: unknown;
        tense?: unknown;
        text?: string;
        title?: string;
        categoryName?: unknown;
        category_name?: unknown;
        categoryId?: unknown;
        category_id?: unknown;
        bucketId?: unknown;
        bucket_id?: unknown;
        lifeAreaId?: unknown;
        life_area_id?: unknown;
        priority?: unknown;
        durationMinutes?: unknown;
        duration_minutes?: unknown;
        loggedAt?: unknown;
        logged_at?: unknown;
        energy?: unknown;
        confidence?: unknown;
      }) => {
        const rawBucketId = item.categoryId ?? item.category_id ?? item.bucketId ?? item.bucket_id;
        let categoryId: string | null = null;
        if (typeof rawBucketId === "string") {
          if (validIds.has(rawBucketId)) categoryId = rawBucketId;
          else categoryId = idByName.get(rawBucketId.toLowerCase()) ?? null;
        }

        const rawLifeAreaId = item.lifeAreaId ?? item.life_area_id;
        let lifeAreaId: string | null = null;
        if (typeof rawLifeAreaId === "string") {
          if (validLifeAreaIds.has(rawLifeAreaId)) lifeAreaId = rawLifeAreaId;
          else lifeAreaId = lifeAreaIdByName.get(rawLifeAreaId.toLowerCase()) ?? null;
        }

        const rawCategoryName = item.categoryName ?? item.category_name;
        const categoryName =
          typeof rawCategoryName === "string" && validCategoryNames.has(rawCategoryName.toLowerCase())
            ? categoryNameByLower.get(rawCategoryName.toLowerCase()) ?? null
            : null;

        const rawTense = typeof item.tense === "string" ? item.tense.toLowerCase() : "";
        const tense = rawTense === "past" ? "past" : "future";

        const rawPriority = typeof item.priority === "string" ? item.priority.toLowerCase() : "";
        const priority =
          tense === "future" && validPriorities.has(rawPriority)
            ? (rawPriority as "high" | "medium" | "low")
            : null;

        const rawDuration = item.durationMinutes ?? item.duration_minutes;
        const durationMinutes =
          tense === "past" && typeof rawDuration === "number" && Number.isFinite(rawDuration)
            ? Math.max(1, Math.min(24 * 60, Math.round(rawDuration)))
            : null;

        const rawLoggedAt = item.loggedAt ?? item.logged_at;
        const loggedAt =
          tense === "past" && typeof rawLoggedAt === "string" && !Number.isNaN(Date.parse(rawLoggedAt))
            ? new Date(rawLoggedAt).toISOString()
            : null;

        const rawEnergy = item.energy;
        const energy =
          typeof rawEnergy === "string" && validEnergies.has(rawEnergy.toLowerCase())
            ? (rawEnergy.toLowerCase() as "high" | "medium" | "low" | "scattered")
            : null;
        const confidence =
          typeof item.confidence === "number" && Number.isFinite(item.confidence)
            ? Math.max(0, Math.min(1, item.confidence))
            : null;

        return {
          rawText: typeof item.rawText === "string" ? item.rawText.slice(0, 240) : "",
          tense,
          text: (item.text ?? item.title ?? "").trim().slice(0, 120),
          categoryName,
          categoryId: tense === "future" ? categoryId : null,
          lifeAreaId,
          priority,
          durationMinutes,
          loggedAt,
          energy,
          confidence,
        };
      });

    return NextResponse.json({ items, intentions: items });
  } catch (e) {
    console.error("parse-brain-dump route error:", e);
    return NextResponse.json({ intentions: null });
  }
}
