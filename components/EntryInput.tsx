"use client";

import { useState, useRef, useEffect } from "react";
import { addEntry, toLocalDateStr, timeStringToTimestampOnDate, clampToLocalDate } from "@/lib/db";
import { categorizeEntry } from "@/lib/gemini";
import { useCategories } from "@/lib/useCategories";
import { getCategoryNames } from "@/lib/categories";
import DatePill from "./DatePill";
import Toast from "./Toast";


/* eslint-disable @typescript-eslint/no-explicit-any */

const PLACEHOLDERS = [
  "Working on...",
  "Just finished...",
  "About to...",
  "Had a meeting about...",
  "Taking a break to...",
];

interface EntryInputProps {
  onEntryAdded?: () => void;
  /** YYYY-MM-DD target date for the logged entry. Defaults to today. */
  initialDate?: string;
}

export default function EntryInput({ onEntryAdded, initialDate }: EntryInputProps) {
  const categories = useCategories();
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState<false | "logged" | "timer">(false);
  const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  const [toast, setToast] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState(() => initialDate ?? toLocalDateStr(Date.now()));
  const toastTimeout = useRef<NodeJS.Timeout>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const showToast = (msg: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(msg);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  };

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    requestAnimationFrame(() => {
      ta.style.height = "auto";
      ta.style.height = Math.max(80, ta.scrollHeight) + "px";
    });
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const now = Date.now();
      const today = toLocalDateStr(now);
      const isBackdated = targetDate !== today;

      const geminiResult = await categorizeEntry(
        trimmed,
        getCategoryNames(categories),
        isBackdated ? { referenceDate: targetDate } : undefined
      );

      let startTime: number;
      let endTime: number;
      let isOngoing = geminiResult.isOngoing;

      if (!isBackdated) {
        startTime = now + geminiResult.startOffsetMinutes * 60 * 1000;
        endTime = isOngoing ? 0 : now + geminiResult.endOffsetMinutes * 60 * 1000;
      } else {
        // Never create a live timer in the past — ActiveTimerBar only scans today.
        isOngoing = false;
        const ref = timeStringToTimestampOnDate("23:59", targetDate);
        startTime = clampToLocalDate(ref + geminiResult.startOffsetMinutes * 60 * 1000, targetDate);
        endTime = clampToLocalDate(ref + geminiResult.endOffsetMinutes * 60 * 1000, targetDate);
        if (endTime < startTime) [startTime, endTime] = [endTime, startTime];
      }

      await addEntry({
        id: crypto.randomUUID(),
        text: trimmed,
        timestamp: now,
        startTime,
        endTime: isOngoing ? 0 : endTime,
        date: targetDate,
        location: null,
        tags: geminiResult.tags,
        energy: geminiResult.energy,
        summary: geminiResult.summary,
        createdAt: now,
      });

      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "80px";
      setShowSuccess(isOngoing ? "timer" : "logged");
      setTimeout(() => setShowSuccess(false), 2000);
      onEntryAdded?.();
      window.dispatchEvent(new Event("entry-updated"));
      if (!geminiResult.aiProcessed) {
        showToast("Saved — AI offline, no tags or time parsed. Check browser console.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <DatePill value={targetDate} onChange={setTargetDate} />
      </div>
      <div className="relative">
        <label htmlFor="entry-input" className="sr-only">
          What are you doing?
        </label>
        <textarea
          id="entry-input"
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoResize();
          }}
          placeholder={placeholder}
          className="w-full rounded-xl glass-panel px-4 py-3 text-sm resize-none focus:outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_20px_var(--color-accent-soft)] transition-all duration-300 placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/30"
          style={{ minHeight: 80 }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
      </div>



      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isSubmitting}
          className={`flex-1 h-12 rounded-xl text-[var(--color-on-accent)] font-medium text-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_var(--color-accent-soft)] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed active:scale-[0.95] ${
            showSuccess ? "animate-success-flash" : ""
          } bg-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/20`}
        >
          {isSubmitting ? (
            <span className="animate-pulse-soft">Processing...</span>
          ) : showSuccess === "timer" ? (
            <span className="animate-pulse-soft">Timer started</span>
          ) : showSuccess === "logged" ? (
            "Logged"
          ) : (
            "Log it"
          )}
        </button>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
