import { supabase } from "@/lib/supabase";

export type GeminiEnergyLevel = "high" | "medium" | "low" | "scattered";

export interface GeminiResult {
  tags: string[];
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  isOngoing: boolean;
  summary: string | null;
  energy: GeminiEnergyLevel | null;
  aiProcessed: boolean;
}

const SAFE_DEFAULT: GeminiResult = {
  tags: ["Other"],
  startOffsetMinutes: 0,
  endOffsetMinutes: 0,
  isOngoing: false,
  summary: null,
  energy: null,
  aiProcessed: false,
};

async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  if (!token) {
    console.warn("[ADDit] No Supabase session — AI categorization skipped. Check that you're logged in.");
  }
  return token;
}

export async function categorizeEntry(text: string, categoryNames: string[]): Promise<GeminiResult> {
  const token = await getAuthToken();
  if (!token) return SAFE_DEFAULT;

  try {
    const res = await fetch("/api/gemini/categorize/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        existingCategories: categoryNames,
        now: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const statusLabel = res.status === 401 ? "not authenticated" : res.status === 429 ? "daily quota exceeded (50/day)" : `server error ${res.status}`;
      console.error(`[ADDit] AI categorization failed: ${statusLabel}`);
      return SAFE_DEFAULT;
    }

    const data = await res.json();
    return { ...data, aiProcessed: true };
  } catch (e) {
    console.error("categorize fetch failed:", e);
    return SAFE_DEFAULT;
  }
}

export interface ParsedIntention {
  text: string;
}

function splitTranscriptLocally(transcript: string): ParsedIntention[] {
  return transcript
    .split(/[.\n]|(?:,\s*and\s+)|(?:\s+and\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 10)
    .map((text) => ({ text: text.charAt(0).toUpperCase() + text.slice(1) }));
}

export async function parseBrainDump(transcript: string): Promise<ParsedIntention[]> {
  const token = await getAuthToken();
  if (!token) return splitTranscriptLocally(transcript);

  try {
    const res = await fetch("/api/gemini/parse-brain-dump/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: transcript }),
    });

    if (!res.ok) {
      console.error("parse-brain-dump API error:", res.status);
      return splitTranscriptLocally(transcript);
    }

    const data = await res.json();
    if (!Array.isArray(data.intentions)) return splitTranscriptLocally(transcript);
    return data.intentions;
  } catch (e) {
    console.error("parse-brain-dump fetch failed:", e);
    return splitTranscriptLocally(transcript);
  }
}
