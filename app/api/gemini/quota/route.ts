import { NextRequest, NextResponse } from "next/server";
import { DAILY_CAP, getUserFromRequest, getServiceSupabase } from "../_shared";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const day = new Date().toISOString().split("T")[0];

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("gemini_usage")
      .select("count")
      .eq("user_id", user.userId)
      .eq("day", day)
      .maybeSingle<{ count: number }>();

    if (error) {
      console.error("quota read error:", error);
      return NextResponse.json({ error: "read_failed" }, { status: 500 });
    }

    const count = data?.count ?? 0;
    return NextResponse.json({
      count,
      cap: DAILY_CAP,
      remaining: Math.max(0, DAILY_CAP - count),
      day,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("quota route error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
