import { Suspense } from "react";
import type { Metadata } from "next";

import { BroadsheetSkeleton } from "@/components/broadsheet/broadsheet-skeleton";
import { BroadsheetView } from "@/components/broadsheet/broadsheet-view";
import { demoResults } from "@/app/design/demo-results";

export const metadata: Metadata = { title: "Broadsheet" };

type SearchParams = Promise<{ parts?: string; subjects?: string; state?: string }>;

export default function BroadsheetDesignPreview({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="w-full flex-1 px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<BroadsheetSkeleton />}>
        <BroadsheetDemo searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BroadsheetDemo({ searchParams }: { searchParams: SearchParams }) {
  const { parts, subjects, state } = await searchParams;
  const count = subjects === "20" ? 20 : 10;
  const results = demoResults({
    five: parts === "5",
    count,
    state,
  });

  return (
    <BroadsheetView
      results={results}
      schoolCode="GHS"
      backHref="/design/results"
      backLabel="Results preview"
    />
  );
}
