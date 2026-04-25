"use client";

import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import ArchiveList from "@/components/ArchiveList";

export default function ArchivePage() {
  return (
    <PageLayout gap="5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Archive</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Intentions you skipped from carry-over. Restore to today, or delete for good.
          </p>
        </div>
        <Link
          href="/timeline"
          className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all px-2 py-1"
        >
          ← Timeline
        </Link>
      </div>
      <ArchiveList />
    </PageLayout>
  );
}
