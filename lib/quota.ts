import { supabase } from "@/lib/supabase";
import { toLocalDateStr } from "@/lib/db";

export interface QuotaSnapshot {
  count: number;
  cap: number;
  remaining: number;
  day: string;
}

export async function fetchQuota(): Promise<QuotaSnapshot | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  try {
    const res = await fetch("/api/gemini/quota", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Local-Date": toLocalDateStr(new Date()),
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as QuotaSnapshot;
    if (typeof json.count !== "number" || typeof json.cap !== "number") return null;
    return json;
  } catch {
    return null;
  }
}
