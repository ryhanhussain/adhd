"use client";

import ArchiveList from "@/components/ArchiveList";
import PageLayout from "@/components/PageLayout";

export default function ArchivePage() {
  return (
    <PageLayout>
      <div className="glass-panel rounded-2xl p-4">
        <h1 className="text-2xl font-bold tracking-tight">Archive</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          Past intentions you didn&apos;t carry forward. Restore any that still matter.
        </p>
      </div>
      <ArchiveList />
    </PageLayout>
  );
}
