import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRightIcon, FileSpreadsheetIcon, UsersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { termLabel } from "@/lib/term-label";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSchoolSetup } from "@/server/data/setup";
import { getStudentsOverview } from "@/server/data/students";

import { SetupHeader } from "../setup-header";

export const metadata: Metadata = { title: "Students" };

type Params = Promise<{ schoolId: string }>;

export default function StudentsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Students params={params} />
    </Suspense>
  );
}

async function Students({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [{ school }, overview] = await Promise.all([getSchoolSetup(ctx), getStudentsOverview(ctx)]);
  const { currentTerm, sections } = overview;
  const base = `/admin/schools/${school.id}`;
  const classes = sections.flatMap((s) => s.classes);
  const total = classes.reduce((n, c) => n + c.students, 0);
  const noHead = classes.filter((c) => !c.formTeacher).length;

  return (
    <>
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title="Students"
        intro="Type each class register in, or import the whole school from Excel, and give each class its form master. Lists carry forward on their own when the next term of the session becomes current."
        actions={
          classes.length > 0 && (
            <Button variant="outline" nativeButton={false} render={<Link href={`${base}/students/import`} />}>
              <FileSpreadsheetIcon data-icon="inline-start" />
              Import from Excel
            </Button>
          )
        }
      />

      {!currentTerm && (
        <p className="rounded-xl border border-warning/30 bg-warning-wash p-4 text-warning">
          Students are enrolled into the current term, and this school has none yet.{" "}
          <Link href={`${base}/terms`} className="font-semibold underline underline-offset-4">
            Set the current term
          </Link>{" "}
          first.
        </p>
      )}

      {classes.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-input bg-card p-5 sm:p-8">
          <h2 className="type-title">Add the school’s classes first</h2>
          <p className="max-w-xl text-muted-foreground">Students are enrolled class by class, so the classes and arms come first.</p>
          <Button nativeButton={false} render={<Link href={`${base}/classes`} />}>
            Go to classes
          </Button>
        </div>
      ) : (
        <>
          {currentTerm && (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3">
              <div className="flex flex-col gap-0.5 bg-card p-4">
                <dt className="type-caption text-muted-foreground">Students in {termLabel(currentTerm.number, currentTerm.sessionName)}</dt>
                <dd className="type-title type-figure">{total}</dd>
              </div>
              <div className="flex flex-col gap-0.5 bg-card p-4">
                <dt className="type-caption text-muted-foreground">Classes</dt>
                <dd className="type-title type-figure">{classes.length}</dd>
              </div>
              <div className="col-span-2 flex flex-col gap-0.5 bg-card p-4 sm:col-span-1">
                <dt className="type-caption text-muted-foreground">Without a form master</dt>
                <dd className={`type-title type-figure ${noHead > 0 ? "text-warning" : ""}`}>{noHead}</dd>
              </div>
            </dl>
          )}

          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`section-${section.id}`} className="flex flex-col gap-3">
              <h2 id={`section-${section.id}`} className="type-title">
                {section.name}
              </h2>
              {/* One ruled list on a phone, cards from sm up. */}
              <ul className="overflow-hidden rounded-xl border border-rule bg-card sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent lg:grid-cols-3">
                {section.classes.map((c) => (
                  <li key={c.id} className="border-b border-rule last:border-b-0 sm:border-b-0">
                    <Link
                      href={`${base}/students/${c.id}`}
                      className="group flex h-full items-center gap-3 bg-card px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:rounded-xl sm:border sm:border-rule sm:py-4 sm:focus-visible:outline-offset-2"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="type-heading">{c.name}</span>
                          <span className="flex items-center gap-1.5 type-caption text-muted-foreground">
                            <UsersIcon aria-hidden="true" className="size-3.5" />
                            <span className="type-figure">{c.students}</span>
                            <span className="sr-only">students</span>
                          </span>
                        </span>
                        <span className={`type-caption ${c.formTeacher ? "text-muted-foreground" : "font-semibold text-warning"}`}>
                          {c.formTeacher ? `${section.teacherTitle}: ${c.formTeacher}` : `No ${section.teacherTitle.toLowerCase()} yet`}
                        </span>                      </span>
                      <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
