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
import { getClassPage, NoCurrentTerm, NotFound } from "@/server/data";

export const metadata: Metadata = { title: "Class list" };

type Params = Promise<{ school: string; classId: string }>;

export default function ClassPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <Suspense fallback={<ClassSkeleton />}>
        <ClassList params={params} />
      </Suspense>
    </main>
  );
}

/** A form class's students this term, read only (spec 0008, AC-14). No photos or parents for teachers. */
async function ClassList({ params }: { params: Params }) {
  const { school: slug, classId } = await params;
  const { ctx, school } = await requireSchoolContext(slug);
  if (!/^[0-9a-f-]{36}$/.test(classId)) notFound();
  const page = await getClassPage(ctx, { classId }).catch((error: unknown) => {
    if (error instanceof NotFound || error instanceof NoCurrentTerm) notFound();
    throw error;
  });
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
