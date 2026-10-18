import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckIcon, ChevronRightIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { termLabel } from "@/lib/term-label";
import { cn } from "@/lib/utils";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getScoreProgress, NoCurrentTerm } from "@/server/data";
import { getSchoolSetup } from "@/server/data/setup";

import { SetupHeader } from "../setup-header";

export const metadata: Metadata = { title: "Scores" };

type Params = Promise<{ schoolId: string }>;

export default function ScoresPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Scores params={params} />
    </Suspense>
  );
}

/** Which classes are behind with their scores this term (spec 0009, AC-12). */
async function Scores({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [{ school }, progress] = await Promise.all([
    getSchoolSetup(ctx),
    getScoreProgress(ctx).catch((error: unknown) => {
      if (error instanceof NoCurrentTerm) return null;
      throw error;
    }),
  ]);
  const base = `/admin/schools/${school.id}`;
  const classes = progress?.sections.flatMap((s) => s.classes) ?? [];
  const finished = classes.filter((c) => c.subjects > 0 && c.done === c.subjects).length;
  const subjectsLeft = classes.reduce((n, c) => n + c.unfinished.length, 0);

  return (
    <>
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title="Scores"
        intro="How far each class has got with this term’s scores. A subject counts as done when every student taking it has every part entered."
      />

      {!progress ? (
        <p className="rounded-xl border border-warning/30 bg-warning-wash p-4 text-warning">
          Scores are entered for the current term, and this school has none yet.{" "}
          <Link href={`${base}/terms`} className="font-semibold underline underline-offset-4">
            Set the current term
          </Link>{" "}
          first.
        </p>
      ) : classes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">
          No classes yet.{" "}
          <Link href={`${base}/classes`} className="font-semibold text-primary underline underline-offset-4">
            Add the school’s classes
          </Link>{" "}
          first.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3">
            <div className="col-span-2 flex flex-col gap-0.5 bg-card p-4 sm:col-span-1">
              <dt className="type-caption text-muted-foreground">Term</dt>
              <dd className="type-heading">{termLabel(progress.term.number, progress.session.name)}</dd>
            </div>
            <div className="flex flex-col gap-0.5 bg-card p-4">
              <dt className="type-caption text-muted-foreground">Classes finished</dt>
              <dd className="type-title type-figure">
                {finished} <span className="type-body font-normal text-muted-foreground">of {classes.length}</span>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 bg-card p-4">
              <dt className="type-caption text-muted-foreground">Subjects still open</dt>
              <dd className={cn("type-title type-figure", subjectsLeft > 0 && "text-warning")}>{subjectsLeft}</dd>
            </div>
          </dl>

          {progress.sections.map((section) => (
            <section key={section.id} aria-labelledby={`section-${section.id}`} className="flex flex-col gap-3">
              <h2 id={`section-${section.id}`} className="type-title">
                {section.name}
              </h2>
              <ul className="overflow-hidden rounded-xl border border-rule bg-card sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent lg:grid-cols-3">
                {section.classes.map((c) => {
                  const allDone = c.subjects > 0 && c.done === c.subjects;
                  return (
                    <li key={c.id} className="border-b border-rule last:border-b-0 sm:border-b-0">
                      <Link
                        href={`/${school.slug}/classes/${c.id}`}
                        className="flex h-full items-start gap-3 bg-card px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:rounded-xl sm:border sm:border-rule sm:py-4 sm:focus-visible:outline-offset-2"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="type-heading">{c.name}</span>
                            {allDone && (
                              <span className="flex items-center gap-1 type-caption font-semibold text-success">
                                <CheckIcon aria-hidden="true" className="size-3.5" />
                                Done
                              </span>
                            )}
                          </span>
                          {c.subjects === 0 ? (
                            <span className="type-caption text-muted-foreground">No subject has students yet</span>
                          ) : (
                            <>
                              <span className="flex items-center gap-3">
                                <span aria-hidden="true" className="relative h-1.5 w-full overflow-hidden rounded-full bg-rule">
                                  <span
                                    className={cn("absolute inset-y-0 left-0 rounded-full", allDone ? "bg-success" : "bg-primary")}
                                    style={{ width: `${(c.done / c.subjects) * 100}%` }}
                                  />
                                </span>
                                <span className="shrink-0 type-caption type-figure text-muted-foreground">
                                  subjects done {c.done} of {c.subjects}
                                </span>
                              </span>
                              {c.unfinished.length > 0 && (
                                <span className="type-caption text-warning">
                                  {c.unfinished
                                    .slice(0, 3)
                                    .map((u) => `${u.name} ${u.complete} of ${u.takers}`)
                                    .join(", ")}
                                  {c.unfinished.length > 3 && ` and ${c.unfinished.length - 3} more`}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                        <ChevronRightIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
