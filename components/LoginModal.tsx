"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button, Input } from "@/components/ui/primitives";

export default function LoginModal() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (mode === "signin") {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) setError(err.message);
    } else {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
      });
      if (err) {
        setError(err.message);
      } else {
        setConfirmationSent(true);
      }
    }

    setSubmitting(false);
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 modal-backdrop animate-sheet-fade"
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to ADDit"
        className="relative w-full max-w-sm rounded-2xl popup-panel p-6 animate-pop-in sm:p-8"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Sparkles size={22} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black text-[var(--color-text)]">
            ADDit
          </h1>
          <p className="mt-1 text-sm font-medium text-[var(--color-text-muted)]">
            Sign in to sync your data
          </p>
        </div>

        {confirmationSent ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-[var(--color-success)]/15 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="h-6 w-6 text-[var(--color-success)]" aria-hidden="true" />
            </div>
            <p className="text-[var(--color-text)] font-medium">
              Check your email
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              We sent a confirmation link to{" "}
              <span className="font-medium">{email}</span>
            </p>
            <button
              onClick={() => {
                setConfirmationSent(false);
                setMode("signin");
              }}
              className="mt-4 text-sm text-[var(--color-accent)] hover:underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <Input
                type="email"
                aria-label="Email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="min-h-12 px-4"
              />
              <Input
                type="password"
                aria-label="Password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="min-h-12 px-4"
              />

              {error && (
                <p className="text-sm text-[var(--color-danger)] px-1">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                variant="primary"
                size="lg"
                fullWidth
              >
                {submitting
                  ? "..."
                  : mode === "signin"
                    ? "Sign In"
                    : "Create Account"}
              </Button>
            </form>

            {/* Toggle mode */}
            <p className="text-center text-sm text-[var(--color-text-muted)] mt-5">
              {mode === "signin"
                ? "Don\u2019t have an account? "
                : "Already have an account? "}
              <button
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                className="text-[var(--color-accent)] font-medium hover:underline"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
