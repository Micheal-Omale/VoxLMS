import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeftIcon } from "lucide-react";

import type { ReadOnlyReason } from "@/components/remarks-sheet/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { termLabel, termName } from "@/lib/term-label";
import { requireSchoolContext } from "@/server/auth/viewer";
import { getClassRemarks, NoCurrentTerm, NotFound } from "@/server/data";

import { toRemarksSnapshot } from "../../remarks-snapshot";
import { RemarksEntry } from "./remarks-entry";

export const metadata: Metadata = { title: "Remarks" };

type Params = Promise<{ school: string; classId: string }>;
type SearchParams = Promise<{ term?: string | string[] }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function notFoundOn(error: unknown): never {
  if (error instanceof NotFound || error instanceof NoCurrentTerm) notFound();
  throw error;
}

export default function RemarksPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col pt-3 sm:px-6 sm:pt-5">
      <Suspense fallback={<SheetSkeleton />}>
        <Sheet params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** One class's Remarks sheet for a term (spec 0011, AC-2 to AC-9, AC-12). */
async function Sheet({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ school: slug, classId }, { term: termParam }] = await Promise.all([params, searchParams]);
  const { ctx, school, viewer } = await requireSchoolContext(slug);
  const termId = typeof termParam === "string" ? termParam : undefined;
  if (!UUID.test(classId) || (termParam !== undefined && !(termId && UUID.test(termId)))) notFound();

  const read = await getClassRemarks(ctx, { classId, termId }).catch(notFoundOn);
  const { results, remarks } = read;
  const viewingAs = ctx.actor.kind !== "system" && ctx.actor.readOnly;
  const readOnly: ReadOnlyReason | null = viewingAs ? "viewingAs" : results.term.isCurrent ? null : "closed";
  const classHref = `/${slug}/classes/${classId}${results.term.isCurrent ? "" : `?term=${results.term.id}`}`;

  return (
    <>
      <div className="flex flex-col items-start gap-1 px-4 pb-5 sm:px-0">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={classHref} />} className="-ml-3 text-muted-foreground">
          <ChevronLeftIcon data-icon="inline-start" />
          {results.cls.name}
        </Button>
        <h1 className="type-display">Remarks</h1>
        <p className="text-muted-foreground">
          {results.cls.name} · {termLabel(results.term.number, results.session.name)}
          {readOnly === null && ` · Write each student’s comment. The ${remarks.signerTitle.toLowerCase()}’s comment fills itself in from the average, and you can type over it.`}
        </p>
      </div>

      <RemarksEntry
        slug={slug}
        termId={results.term.id}
        classId={classId}
        draftKey={`remark-draft:${viewer.userId}:${results.term.id}:${classId}`}
        termName={termName(results.term.number)}
        signerTitle={remarks.signerTitle}
        sheet={toRemarksSnapshot(read, school.code)}
        readOnly={readOnly}
      />
    </>
  );
}

function SheetSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 px-4 sm:px-0">
      <Skeleton className="h-20 w-72" />
      <Skeleton className="h-6" />
      <Skeleton className="h-[28rem] rounded-xl" />
    </div>
  );
}
