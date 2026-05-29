import { NextRequest, NextResponse } from "next/server";
import { getDailyCap, getLocalDateFromRequest, getServiceSupabase, getUserFromRequest } from "../_shared";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const day = getLocalDateFromRequest(req);
  const cap = getDailyCap();

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("gemini_usage")
      .select("count")
      .eq("user_id", user.userId)
      .eq("day", day)
      .maybeSingle<{ count: number }>();

    if (error) {
      console.error("AI quota read error:", error);
      return NextResponse.json({ error: "read_failed" }, { status: 500 });
    }

    const count = data?.count ?? 0;
    return NextResponse.json({
      count,
      cap,
      remaining: Math.max(0, cap - count),
      day,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("AI quota route error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
