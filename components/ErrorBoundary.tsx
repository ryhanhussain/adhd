"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="glass-panel rounded-2xl p-6 max-w-sm w-full text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--color-accent-soft)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-base font-semibold mb-1">Something broke</p>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Your data is safe. Try reloading — if this keeps happening, check the console.
            </p>
            <button
              onClick={this.reset}
              className="h-11 px-5 rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
