import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeftIcon, UsersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { displayStudentId } from "@/lib/student-number";
import { termLabel } from "@/lib/term-label";
import { requireSchoolContext } from "@/server/auth/viewer";
import { getClassPage, getClassResults, listSubjectProgress, NoCurrentTerm, NotFound } from "@/server/data";

import { ResultsSection } from "./results-section";
import { ScoresSection } from "./scores-section";

export const metadata: Metadata = { title: "Class" };

type Params = Promise<{ school: string; classId: string }>;
type SearchParams = Promise<{ term?: string | string[] }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function notFoundOn(error: unknown): never {
  if (error instanceof NotFound || error instanceof NoCurrentTerm) notFound();
  throw error;
}

export default function ClassPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
      <Suspense fallback={<ClassSkeleton />}>
        <ClassList params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/**
 * A form class: its subjects with score progress first (spec 0009, AC-1,
 * AC-2), then the term's results (spec 0010, AC-8), then its students this
 * term, read only (spec 0008, AC-14). No photos or parents for teachers.
 */
async function ClassList({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ school: slug, classId }, { term: termParam }] = await Promise.all([params, searchParams]);
  const { ctx, school } = await requireSchoolContext(slug);
  const termId = typeof termParam === "string" ? termParam : undefined;
  if (!UUID.test(classId) || (termParam !== undefined && !(termId && UUID.test(termId)))) notFound();
  const [page, progress, results] = await Promise.all([
    getClassPage(ctx, { classId }).catch(notFoundOn),
    listSubjectProgress(ctx, { classId, termId }).catch(notFoundOn),
    getClassResults(ctx, { classId, termId }).catch(notFoundOn),
  ]);
  const { cls, term, session, students } = page;
  const boys = students.filter((s) => s.gender === "male").length;

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/${slug}`} />} className="-ml-3 text-muted-foreground">
          <ChevronLeftIcon data-icon="inline-start" />
          Your classes
        </Button>
        <h1 className="type-display">{cls.name}</h1>
        <p className="text-muted-foreground">
          {termLabel(term.number, session.name)} · <span className="type-figure">{students.length}</span> {students.length === 1 ? "student" : "students"}
          {students.length > 0 && (
            <>
              {" "}
              (<span className="type-figure">{boys}</span> {boys === 1 ? "boy" : "boys"}, <span className="type-figure">{students.length - boys}</span>{" "}
              {students.length - boys === 1 ? "girl" : "girls"})
            </>
          )}
        </p>
      </div>

      <ScoresSection slug={slug} classId={cls.id} progress={progress} />

      <ResultsSection results={results} schoolCode={school.code} />

      <section aria-labelledby="students-title" className="flex flex-col gap-4">
        <h2 id="students-title" className="type-title">
          Students
        </h2>
        {students.length === 0 ? (
          <Empty className="border border-dashed border-input bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle className="type-heading">No students in {cls.name} yet</EmptyTitle>
              <EmptyDescription>The VoxLMS team enrols your class. Message them if your students should already be here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="ruled-sheet border-y border-rule sm:rounded-xl sm:border-x">
            <div aria-hidden="true" className="grid grid-cols-[var(--margin-x)_minmax(0,1fr)_auto] gap-x-3 border-b border-rule py-2.5 pr-4 type-caption font-semibold text-muted-foreground sm:grid-cols-[var(--margin-x)_minmax(0,1fr)_9rem_4rem]">
              <span />
              <span className="pl-3">Student</span>
              <span className="hidden sm:block">Admission no.</span>
              <span className="text-right sm:text-left">Gender</span>
            </div>
            <ol aria-label={`${cls.name} students`}>
              {students.map((s, i) => (
                <li key={s.studentId} className="grid min-h-12 grid-cols-[var(--margin-x)_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-rule py-2.5 pr-4 last:border-b-0 sm:grid-cols-[var(--margin-x)_minmax(0,1fr)_9rem_4rem]">
                  <span aria-hidden="true" className="pr-2.5 text-right type-caption type-figure text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-col pl-3">
                    <span className="truncate">
                      <span className="font-bold">{s.surname}</span> {s.otherNames}
                    </span>
                    <span className="type-caption type-figure text-muted-foreground sm:hidden">{displayStudentId(school.code, s)}</span>
                  </span>
                  <span className="hidden type-figure text-muted-foreground sm:block">{displayStudentId(school.code, s)}</span>
                  <span className="text-right sm:text-left">{s.gender === "male" ? "Boy" : "Girl"}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <p className="type-caption text-muted-foreground">A name spelt wrong, or a student missing? Message the VoxLMS team, who keep your class list.</p>
      </section>
    </>
  );
}

function ClassSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <Skeleton className="h-16 w-64" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
