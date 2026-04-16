"use client";

import { useEffect, useState } from "react";
import { type MilestoneInfo } from "@/lib/streaks";

interface MilestoneCelebrationProps {
  milestone: MilestoneInfo;
  onDismiss: () => void;
}

const MESSAGES: Record<number, string> = {
  1: "Your journey begins!",
  7: "One week strong!",
  14: "Two weeks of consistency!",
  30: "A whole month — incredible!",
  60: "60 days. Unstoppable.",
  100: "Triple digits! You're a legend.",
  200: "200 days. This is who you are now.",
  365: "One full year. Extraordinary.",
};

function getMessage(milestone: MilestoneInfo): { title: string; subtitle: string } {
  if (milestone.isFirstEntry) {
    return { title: "First Entry!", subtitle: "Your journey begins. One step at a time." };
  }
  return {
    title: `${milestone.milestone} Days!`,
    subtitle: MESSAGES[milestone.milestone] || `${milestone.milestone} day streak!`,
  };
}

export default function MilestoneCelebration({ milestone, onDismiss }: MilestoneCelebrationProps) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string; delay: number; size: number }[]>([]);
  const { title, subtitle } = getMessage(milestone);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduceMotion) {
      const colors = ["#7c5cfc", "#22c55e", "#f59e0b", "#ec4899", "#3b82f6", "#f97316"];
      const newParticles = Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.6,
        size: 4 + Math.random() * 6,
      }));
      setParticles(newParticles);
    }

    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-center justify-center animate-sheet-fade"
      onClick={onDismiss}
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
    >
      {/* Aurora Background Overlay */}
      <div className="absolute inset-0 overflow-hidden mix-blend-screen pointer-events-none opacity-50">
        <div className="absolute top-[10%] left-[20%] w-[60%] h-[60%] bg-[var(--color-accent)] rounded-full blur-[100px] animate-pulse-soft" />
        <div className="absolute top-[30%] right-[10%] w-[50%] h-[50%] bg-[#ec4899] rounded-full blur-[100px] animate-pulse-soft" style={{ animationDelay: "1s" }} />
      </div>

      {/* Confetti */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-confetti flex items-center justify-center"
          style={{
            left: `${p.x}%`,
            top: `-5%`,
            width: p.size,
            height: p.size * 2.5,
            backgroundColor: p.color,
            boxShadow: `0 0 12px ${p.color}, 0 0 24px ${p.color}80`,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}

      {/* Center content */}
      <div className="flex flex-col items-center gap-4 animate-pop-in relative z-10 transition-transform hover:scale-105 duration-500">
        <div
          className="text-[5rem] font-black tabular-nums text-white"
          style={{ textShadow: "0 0 30px var(--color-accent), 0 0 60px rgba(139,92,246,0.6)" }}
        >
          {milestone.isFirstEntry ? (
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2L9 9l-7 1 5 5-1.5 7L12 18l6.5 4L17 15l5-5-7-1z" fill="white" fillOpacity="0.2" />
            </svg>
          ) : milestone.milestone}
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-[var(--color-on-accent)] mb-1">{title}</p>
          <p className="text-sm text-[var(--color-on-accent)]/70">{subtitle}</p>
        </div>
        <p className="text-xs text-[var(--color-on-accent)]/40 mt-4">Tap to dismiss</p>
      </div>
    </div>
  );
}
