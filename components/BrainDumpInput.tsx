"use client";

import { useState, useRef, useEffect } from "react";
import type { ParsedIntention } from "@/lib/gemini";
import type { IntentionCategory } from "@/lib/categories";
import Toast from "./Toast";

interface BrainDumpInputProps {
  onIntentionsParsed: (intentions: ParsedIntention[]) => Promise<void>;
  onClose: () => void;
  /** Current intention buckets; forwarded to the Gemini prompt for dynamic classification. */
  intentionCategories?: IntentionCategory[];
}

export default function BrainDumpInput({ onIntentionsParsed, onClose, intentionCategories }: BrainDumpInputProps) {
  const [transcript, setTranscript] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Reset to auto first, then measure — batch both writes in one rAF
    // to avoid forced synchronous layout (layout thrash) on every keystroke.
    requestAnimationFrame(() => {
      ta.style.height = "auto";
      ta.style.height = Math.max(80, ta.scrollHeight) + "px";
    });
  };

  const handleDone = async () => {
    if (!transcript.trim()) return;
    setIsParsing(true);
    try {
      const { parseBrainDump } = await import("@/lib/gemini");
      const result = await parseBrainDump(
        transcript.trim(),
        intentionCategories?.map((c) => ({ id: c.id, name: c.name, description: c.description }))
      );
      if (!result.ok) {
        const messages = {
          auth: "Session expired — sign in again",
          cap: "Daily AI limit reached — try again tomorrow",
          burst: "Slow down a sec — try again in a moment",
          quota_error: "Quota check failed — see console / Supabase",
          network: "Couldn't reach AI — check connection and retry",
          server: "AI hiccup — please retry",
        } as const;
        showToast(messages[result.reason]);
        return;
      }
      if (result.intentions.length > 0) {
        await onIntentionsParsed(result.intentions);
      }
      onClose();
    } catch (e) {
      console.error("Brain dump parse failed:", e);
      showToast("Something went wrong. Try again.");
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Transcript area — always editable as textarea */}
      <div className="relative">
        <label htmlFor="brain-dump-textarea" className="sr-only">Brain dump — what do you need to do today?</label>
        <textarea
          id="brain-dump-textarea"
          ref={textareaRef}
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            autoResize();
          }}
          placeholder="Type your brain dump here..."
          className="w-full rounded-xl glass-panel px-4 py-3 text-sm resize-none focus:outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_12px_var(--color-accent-soft)] transition-all duration-200 placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/30"
          style={{ minHeight: 80, transition: "height 0.15s ease" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleDone();
            }
          }}
        />
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleDone}
          disabled={!transcript.trim() || isParsing}
          className="flex-1 h-12 rounded-xl text-[var(--color-on-accent)] font-medium text-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_var(--color-accent-soft)] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed active:scale-[0.95] bg-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/20 flex items-center justify-center gap-2"
        >
          {isParsing ? (
            <>
              <div className="w-4 h-4 border-2 border-[var(--color-on-accent)]/30 border-t-[var(--color-on-accent)] rounded-full animate-spin" />
              Parsing intentions...
            </>
          ) : (
            "Done"
          )}
        </button>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </div>
  );
}
