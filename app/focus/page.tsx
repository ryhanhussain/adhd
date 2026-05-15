import type { Metadata } from "next";
import { Suspense } from "react";
import FocusPageClient from "./FocusPageClient";

export const metadata: Metadata = {
  title: "Focus",
  description: "A Pomodoro focus room for one task, with a quiet queue for what comes next.",
};

export default function FocusPage() {
  return (
    <Suspense fallback={null}>
      <FocusPageClient />
    </Suspense>
  );
}
