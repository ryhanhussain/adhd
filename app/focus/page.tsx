import type { Metadata } from "next";
import { Suspense } from "react";
import FocusPageClient from "./FocusPageClient";

export const metadata: Metadata = {
  title: "Focus",
  description: "A simple Pomodoro timer for one task.",
};

export default function FocusPage() {
  return (
    <Suspense fallback={null}>
      <FocusPageClient />
    </Suspense>
  );
}
