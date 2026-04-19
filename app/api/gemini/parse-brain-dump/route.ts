import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, checkAndIncrementQuota, callGemini } from "../_shared";

export const runtime = "edge";

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

  const { text } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ intentions: null }, { status: 400 });
  }

  const prompt = `You are an ADHD-friendly task parser. Given a brain dump transcript, extract only real, actionable tasks or intentions.

Rules:
- Split compound sentences into separate tasks (e.g. "I need to do X, I need to do Y" → two tasks)
- Each item must be a concrete action the user needs to do — not a question, observation, or meta-comment about the app
- Filter out anything that isn't a real task: fragments, rhetorical questions, self-commentary, test phrases
- Keep each task concise but preserve full meaning (don't truncate mid-thought)
- Return at most 10 items
- If nothing actionable is found, return an empty array

Examples of what NOT to include:
- "If it summarises" → not a task, skip it
- "Categorizes the submissions" → not a user task, skip it
- "Let's see" / "So yeah" → filler, skip

Transcript: "${text}"

Respond with ONLY a JSON array of objects like [{"text": "Task description"}]. No other text.`;

  try {
    const responseText = await callGemini(prompt, { temperature: 0.2, maxOutputTokens: 512 });

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ intentions: null });

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return NextResponse.json({ intentions: null });

    const intentions = parsed
      .filter((item: { text?: string }) => typeof item.text === "string" && item.text.trim().length > 0)
      .slice(0, 10)
      .map((item: { text: string }) => ({ text: item.text.trim() }));

    return NextResponse.json({ intentions });
  } catch (e) {
    console.error("parse-brain-dump route error:", e);
    return NextResponse.json({ intentions: null });
  }
}
