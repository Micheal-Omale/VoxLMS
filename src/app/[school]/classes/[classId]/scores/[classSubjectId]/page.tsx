import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeftIcon, Settings2Icon } from "lucide-react";

import type { ReadOnlyReason } from "@/components/score-sheet/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { termLabel, termName } from "@/lib/term-label";
import { requireSchoolContext } from "@/server/auth/viewer";
import { getScoreSheet, listSubjectProgress, NoCurrentTerm, NotFound } from "@/server/data";

import { NavSelect } from "../../../nav-select";
import { toSnapshot } from "../../../sheet-snapshot";
import { ScoreEntry } from "./score-entry";

export const metadata: Metadata = { title: "Score sheet" };

type Params = Promise<{ school: string; classId: string; classSubjectId: string }>;
type SearchParams = Promise<{ term?: string | string[] }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function notFoundOn(error: unknown): never {
  if (error instanceof NotFound || error instanceof NoCurrentTerm) notFound();
  throw error;
}

export default function ScoreSheetPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col pt-3 sm:px-6 sm:pt-5">
      <Suspense fallback={<SheetSkeleton />}>
        <Sheet params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** One subject's score sheet for a class and term (spec 0009, AC-3 to AC-14). */
async function Sheet({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ school: slug, classId, classSubjectId }, { term: termParam }] = await Promise.all([params, searchParams]);
  const { ctx, school, viewer } = await requireSchoolContext(slug);
  const termId = typeof termParam === "string" ? termParam : undefined;
  if (!UUID.test(classId) || !UUID.test(classSubjectId) || (termParam !== undefined && !(termId && UUID.test(termId)))) notFound();

  const progress = await listSubjectProgress(ctx, { classId, termId }).catch(notFoundOn);
  const sheet = await getScoreSheet(ctx, { termId: progress.term.id, classSubjectId }).catch(notFoundOn);
  if (sheet.subject.classId !== classId) notFound();

  const viewingAs = ctx.actor.kind !== "system" && ctx.actor.readOnly;
  const readOnly: ReadOnlyReason | null = viewingAs ? "viewingAs" : sheet.term.isCurrent ? null : "closed";
  const query = progress.term.isCurrent ? "" : `?term=${progress.term.id}`;
  const classHref = `/${slug}/classes/${classId}${query}`;
  const subjectOptions = progress.subjects.map((s) => ({
    value: s.classSubjectId,
    label: s.isElective ? `${s.name} (elective)` : s.name,
    href: `/${slug}/classes/${classId}/scores/${s.classSubjectId}${query}`,
  }));

  return (
    <>
      <div className="flex flex-col gap-4 px-4 pb-5 sm:px-0 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={classHref} />} className="-ml-3 text-muted-foreground">
            <ChevronLeftIcon data-icon="inline-start" />
            {sheet.subject.className}
          </Button>
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 type-display">
            {sheet.subject.name}
            {sheet.subject.isElective && (
              <Badge variant="outline" className="type-caption font-semibold">
                Elective
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            {termLabel(sheet.term.number, sheet.session.name)}
            {readOnly === null && " · Type each score as it appears in your mark book. Missing scores stay blank, never 0."}
          </p>
        </div>
        {subjectOptions.length > 1 && <NavSelect id="subject" label="Subject" value={classSubjectId} options={subjectOptions} />}
      </div>

      {sheet.components.length === 0 ? (
        <div className="mx-4 flex flex-col items-start gap-2 rounded-xl border border-dashed border-input bg-card p-5 sm:mx-0 sm:p-8">
          <Settings2Icon aria-hidden="true" className="size-6 text-muted-foreground" />
          <h2 className="type-heading">
            The score split for {sheet.section.name}, {sheet.session.name} is not set yet.
          </h2>
          <p className="text-muted-foreground">The VoxLMS team sets it.</p>
        </div>
      ) : (
        <ScoreEntry
          slug={slug}
          termId={sheet.term.id}
          classSubjectId={classSubjectId}
          draftKey={`score-draft:${viewer.userId}:${sheet.term.id}:${classSubjectId}`}
          termName={termName(sheet.term.number)}
          subjectName={sheet.subject.name}
          sheet={toSnapshot(sheet, school.code)}
          lastSavedAt={sheet.lastSavedAt?.toISOString() ?? null}
          readOnly={readOnly}
        />
      )}
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
