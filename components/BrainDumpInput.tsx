"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ParsedIntention } from "@/lib/gemini";

interface BrainDumpInputProps {
  onIntentionsParsed: (intentions: ParsedIntention[]) => Promise<void>;
  onClose: () => void;
}

export default function BrainDumpInput({ onIntentionsParsed, onClose }: BrainDumpInputProps) {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const silenceTimeout = useRef<NodeJS.Timeout>(undefined);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    if (silenceTimeout.current) clearTimeout(silenceTimeout.current);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const autoResize = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.max(80, ta.scrollHeight) + "px";
    }
  };

  const resetSilenceTimer = () => {
    if (silenceTimeout.current) clearTimeout(silenceTimeout.current);
    silenceTimeout.current = setTimeout(() => {
      stopListening();
    }, 60000);
  };

  const toggleVoice = () => {
    if (isListening) {
      stopListening();
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Speech recognition is not supported in this browser. Try Chrome or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";

    recognition.onresult = (e: any) => {
      resetSilenceTimer();
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript((finalTranscript + interim).trim());
      setTimeout(autoResize, 0);
    };

    recognition.onerror = (e: any) => {
      console.error("Speech recognition error:", e.error);
      if (e.error === "network") {
        showToast("Voice input requires HTTPS. Try localhost:3000.");
      } else if (e.error === "not-allowed") {
        showToast("Microphone access was denied. Please allow it in browser settings.");
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    resetSilenceTimer();
  };

  const handleDone = async () => {
    if (!transcript.trim()) return;
    stopListening();
    setIsParsing(true);
    try {
      const { parseBrainDump } = await import("@/lib/gemini");
      const parsed = await parseBrainDump(transcript.trim());
      if (parsed.length > 0) {
        await onIntentionsParsed(parsed);
      }
      onClose();
    } catch (e) {
      console.error("Brain dump parse failed:", e);
      showToast("Something went wrong. Try again.");
    } finally {
      setIsParsing(false);
    }
  };

  const hasSpeechSupport = typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return (
    <div className="flex flex-col gap-3">
      {isListening && (
        <p className="text-center text-xs text-[var(--color-accent)] font-medium animate-pulse-soft">
          Listening...
        </p>
      )}

      {/* Transcript area — always editable as textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={transcript}
          autoFocus
          onChange={(e) => {
            setTranscript(e.target.value);
            autoResize();
          }}
          placeholder={hasSpeechSupport ? "Tap the mic and start talking, or type here..." : "Type your brain dump here..."}
          className="w-full rounded-xl glass-panel px-4 py-3 text-sm resize-none focus:outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_20px_var(--color-accent-soft)] transition-all duration-300 placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/30"
          style={{ minHeight: 80 }}
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
          onClick={toggleVoice}
          disabled={isParsing}
          className={`flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 hover:scale-[1.05] active:scale-[0.95] ${
            isListening
              ? "bg-[var(--color-danger)]/20 border border-[var(--color-danger)]/50 text-[var(--color-danger)] animate-pulse-soft shadow-[0_0_15px_var(--color-danger)]"
              : "glass-panel text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/30"
          } disabled:opacity-50`}
          aria-label={isListening ? "Stop listening" : "Start voice input"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </button>

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
      {toast && (
        <div className="fixed above-dock left-1/2 -translate-x-1/2 z-[70] px-5 py-2.5 rounded-full bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium shadow-lg animate-toast-in">
          {toast}
        </div>
      )}
    </div>
  );
}
