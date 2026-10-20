import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { BroadsheetSkeleton } from "@/components/broadsheet/broadsheet-skeleton";
import { BroadsheetView } from "@/components/broadsheet/broadsheet-view";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getClassResults, NoCurrentTerm, NotFound } from "@/server/data";
import { getSchoolSetup } from "@/server/data/setup";

export const metadata: Metadata = { title: "Master Compilation Sheet" };

type Params = Promise<{ schoolId: string; classId: string }>;
type SearchParams = Promise<{ term?: string | string[] }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function notFoundOn(error: unknown): never {
  if (error instanceof NotFound || error instanceof NoCurrentTerm) notFound();
  throw error;
}

export default function AdminClassBroadsheetPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="w-full flex-1 px-4 py-6 sm:px-8 sm:py-8">
      <Suspense fallback={<BroadsheetSkeleton />}>
        <AdminBroadsheetLoader params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AdminBroadsheetLoader({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ schoolId, classId }, { term: termParam }] = await Promise.all([params, searchParams]);
  if (!UUID.test(schoolId) || !UUID.test(classId)) notFound();
  const termId = typeof termParam === "string" && UUID.test(termParam) ? termParam : undefined;

  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [{ school }, results] = await Promise.all([
    getSchoolSetup(ctx),
    getClassResults(ctx, { classId, termId }).catch(notFoundOn),
  ]);

  const termQuery = termId ? `?term=${termId}` : "";
  const backHref = `/admin/schools/${schoolId}/results/${classId}${termQuery}`;

  return (
    <BroadsheetView
      results={results}
      schoolCode={school.code}
      backHref={backHref}
      backLabel="Class results & slips"
    />
  );
}
