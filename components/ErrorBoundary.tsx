"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button, Panel } from "@/components/ui/primitives";

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
          <Panel className="max-w-sm text-center" as="div">
            <div
              aria-hidden="true"
              className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--color-accent-soft)" }}
            >
              <AlertCircle size={22} className="text-[var(--color-accent)]" />
            </div>
            <p className="text-base font-semibold mb-1">Something broke</p>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Your data is safe. Try reloading — if this keeps happening, check the console.
            </p>
            <Button
              onClick={this.reset}
              variant="primary"
            >
              Try again
            </Button>
          </Panel>
        </div>
      );
    }
    return this.props.children;
  }
}
