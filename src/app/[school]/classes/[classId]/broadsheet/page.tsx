import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { BroadsheetSkeleton } from "@/components/broadsheet/broadsheet-skeleton";
import { BroadsheetView } from "@/components/broadsheet/broadsheet-view";
import { requireSchoolContext } from "@/server/auth/viewer";
import { getClassResults, NoCurrentTerm, NotFound } from "@/server/data";

export const metadata: Metadata = { title: "Broadsheet" };

type Params = Promise<{ school: string; classId: string }>;
type SearchParams = Promise<{ term?: string | string[] }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function notFoundOn(error: unknown): never {
  if (error instanceof NotFound || error instanceof NoCurrentTerm) notFound();
  throw error;
}

export default function ClassBroadsheetPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="w-full flex-1 px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<BroadsheetSkeleton />}>
        <BroadsheetLoader params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BroadsheetLoader({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ school: slug, classId }, { term: termParam }] = await Promise.all([params, searchParams]);
  const { ctx, school } = await requireSchoolContext(slug);
  const termId = typeof termParam === "string" ? termParam : undefined;
  if (!UUID.test(classId) || (termParam !== undefined && !(termId && UUID.test(termId)))) notFound();

  const results = await getClassResults(ctx, { classId, termId }).catch(notFoundOn);
  const termQuery = termId ? `?term=${termId}` : "";
  const backHref = `/${slug}/classes/${classId}${termQuery}`;

  return (
    <BroadsheetView
      results={results}
      schoolCode={school.code}
      backHref={backHref}
      backLabel={results.cls.name}
    />
  );
}
