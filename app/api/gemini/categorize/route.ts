import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, checkAndIncrementQuota, callGemini, runtime as _runtime } from "../_shared";

export const runtime = "edge";

const SAFE_DEFAULT = {
  tags: ["Other"],
  startOffsetMinutes: 0,
  endOffsetMinutes: 0,
  isOngoing: false,
  summary: null,
  energy: null,
};

export async function POST(req: NextRequest) {
  // Auth
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json(SAFE_DEFAULT, { status: 401 });
  }

  // Quota
  const allowed = await checkAndIncrementQuota(user.userId);
  if (!allowed) {
    return NextResponse.json(SAFE_DEFAULT, { status: 429 });
  }

  const { text, existingCategories, now: nowStr } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json(SAFE_DEFAULT, { status: 400 });
  }

  const now = nowStr ? new Date(nowStr) : new Date();
  const currentTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const currentDate = now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const categoryNames: string[] = Array.isArray(existingCategories) ? existingCategories : [];

  const prompt = `You are a categorization, time-parsing, and journaling assistant. Given a journal entry, do five things:

IMPORTANT: The current local time is ${currentTime} on ${currentDate}. Use this to calculate all time offsets accurately.

1. Assign one or more categories from: ${categoryNames.join(", ")}
2. Figure out when this activity started and ended, as minute offsets from NOW (0 = right now, negative = in the past, positive = in the future). Use the current time above to accurately convert:
   - Relative references like "3 hours ago" → startOffsetMinutes = -180
   - Absolute times like "between 7am and 9am" → calculate the difference between those times and ${currentTime}
   - Duration hints like "for 2 hours" → use to compute the gap between start and end
   - "yesterday" → offset by the appropriate number of hours/minutes from now
3. Determine if this is an ONGOING activity (something the user is currently doing or about to start, with no stated end time). Set "isOngoing": true if so.
4. Write a SHORT one-sentence summary (max 12 words) of what the user is/was doing. Focus on the activity, not feelings. Examples: "Working on dashboard UI components", "Took a 30-minute run", "Team standup meeting".
5. Detect the user's energy level from the entry text. Use one of: "high", "medium", "low", "scattered". Always make your best guess — only use null if the entry is a single word with zero context clues. Infer from tone, language, activity type, and time of day context.
   - "high": enthusiastic, productive, energized language, or activities like exercise/sports
   - "medium": neutral, steady, routine activities (meetings, errands, meals, admin)
   - "low": tired, drained, sluggish language, or passive activities like resting/watching TV
   - "scattered": distracted, unfocused, jumping between things, troubleshooting/debugging

Examples (assuming current time is ${currentTime}):
- "I've been eating for 20 minutes" → {"tags":["Food"],"startOffsetMinutes":-20,"endOffsetMinutes":0,"isOngoing":false,"summary":"Eating for 20 minutes","energy":"medium"}
- "Working on the dashboard, feeling really productive today!" → {"tags":["Deep Work"],"startOffsetMinutes":0,"endOffsetMinutes":0,"isOngoing":true,"summary":"Working on the dashboard","energy":"high"}
- "Tried to study but kept getting distracted by my phone" → {"tags":["Deep Work"],"startOffsetMinutes":0,"endOffsetMinutes":0,"isOngoing":true,"summary":"Attempting to study, getting distracted","energy":"scattered"}
- "So exhausted, just dragging through this report" → {"tags":["Deep Work"],"startOffsetMinutes":0,"endOffsetMinutes":0,"isOngoing":true,"summary":"Working on report","energy":"low"}
- "Coding" → {"tags":["Deep Work"],"startOffsetMinutes":0,"endOffsetMinutes":0,"isOngoing":true,"summary":"Coding","energy":null}
- "Went for a run between 7am and 9am" → calculate offsets: 7am is X minutes before ${currentTime}, 9am is Y minutes before ${currentTime}
- "Played football 3 hours ago for 2 hours" → startOffsetMinutes = -180, endOffsetMinutes = -60

Key rule for isOngoing: If the user uses present tense or "about to" WITHOUT specifying how long it will take, set isOngoing to true. If they state a specific duration or end time, set isOngoing to false.

Entry: "${text}"

Respond with ONLY the JSON object. No other text.`;

  try {
    const responseText = await callGemini(prompt, { temperature: 0.1, maxOutputTokens: 256 });

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[categorize] No JSON in Gemini response:", JSON.stringify(responseText));
      return NextResponse.json({ ...SAFE_DEFAULT, _debug: responseText.slice(0, 200) });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const tags: string[] = Array.isArray(parsed.tags) ? parsed.tags : ["Other"];
    const valid = categoryNames.length > 0 ? tags.filter((t) => categoryNames.includes(t)) : tags;
    const validEnergy = ["high", "medium", "low", "scattered"];

    return NextResponse.json({
      tags: valid.length > 0 ? valid : ["Other"],
      startOffsetMinutes: typeof parsed.startOffsetMinutes === "number" ? parsed.startOffsetMinutes : 0,
      endOffsetMinutes: typeof parsed.endOffsetMinutes === "number" ? parsed.endOffsetMinutes : 0,
      isOngoing: typeof parsed.isOngoing === "boolean" ? parsed.isOngoing : false,
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
      energy: validEnergy.includes(parsed.energy) ? parsed.energy : null,
      aiProcessed: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("categorize route error:", e);
    return NextResponse.json({ ...SAFE_DEFAULT, _error: msg }, { status: 500 });
  }
}
