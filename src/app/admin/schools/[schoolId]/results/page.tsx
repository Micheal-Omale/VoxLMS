import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { NoCurrentTerm, NotFound } from "@/server/data";
import { getResultsOnline } from "@/server/data/result-pins";
import { getSchoolSetup } from "@/server/data/setup";

import { SetupHeader } from "../setup-header";
import { ReleaseControls } from "./release-controls";
import { SlipButton } from "./slip-button";

export const metadata: Metadata = { title: "Results online" };

type Params = Promise<{ schoolId: string }>;
type Search = Promise<{ term?: string | string[] }>;

export default function ResultsOnlinePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ResultsOnline params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Release a term to parents and print PIN slips (spec 0014, AC-1 to AC-3, AC-5). */
async function ResultsOnline({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { schoolId } = await params;
  const { term: termParam } = await searchParams;
  const termId = typeof termParam === "string" && UUID.test(termParam) ? termParam : undefined;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [{ school }, data] = await Promise.all([
    getSchoolSetup(ctx),
    getResultsOnline(ctx, { termId }).catch((error: unknown) => {
      if (error instanceof NoCurrentTerm) return null;
      if (error instanceof NotFound) notFound();
      throw error;
    }),
  ]);
  const base = `/admin/schools/${school.id}`;
  const header = (
    <SetupHeader
      schoolId={school.id}
      schoolName={school.name}
      title="Results online"
      intro="Parents check a term’s result with the PIN on their child’s slip, once you release it. Print a class’s slips here; replace a lost one on the class’s page."
    />
  );
  if (!data) {
    return (
      <>
        {header}
        <p className="rounded-xl border border-warning/30 bg-warning-wash p-4 text-warning">
          This school has no current term yet.{" "}
          <Link href={`${base}/terms`} className="font-semibold underline underline-offset-4">
            Set the current term
          </Link>{" "}
          first.
        </p>
      </>
    );
  }

  const { term, released, classes } = data;
  const termName = term.label.split(",")[0];
  const notReady = classes.flatMap((c) => (c.readiness.ready ? [] : [`${c.name}: ${c.readiness.reason}`]));
  const termQuery = `?term=${term.id}`;

  return (
    <>
      {header}

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="type-caption text-muted-foreground">Term</span>
          <select
            name="term"
            defaultValue={term.id}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
          >
            {data.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.isCurrent ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" size="sm" className="h-9">
          Show
        </Button>
      </form>

      <section aria-labelledby="release-heading" className="flex flex-col gap-3 rounded-xl border border-rule bg-card p-4">
        <h2 id="release-heading" className="type-heading">
          {term.label}
        </h2>
        <p className={cn(released ? "text-success" : "text-muted-foreground")}>
          {released ? `Released to parents on ${released.at} by ${released.by}.` : "Not released. Parents with slips see ‘results are not out yet’."}
        </p>
        <ReleaseControls schoolId={school.id} termId={term.id} termName={termName} released={released !== null} notReady={notReady} />
      </section>

      <section aria-labelledby="slips-heading" className="flex flex-col gap-3">
        <h2 id="slips-heading" className="type-title">
          PIN slips
        </h2>
        {classes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">No class has students this term.</p>
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
            {classes.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 border-b border-rule px-4 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link href={`${base}/results/${c.id}${termQuery}`} className="type-heading text-primary underline-offset-4 hover:underline">
                    {c.name}
                  </Link>
                  <p className="type-caption type-figure text-muted-foreground">
                    {c.students} {c.students === 1 ? "student" : "students"} · {c.live} slips live · {c.checked} checked · {c.withoutSlip} without a slip
                  </p>
                  {!c.readiness.ready && <p className="type-caption text-warning">Not ready: {c.readiness.reason}</p>}
                </div>
                <SlipButton
                  schoolId={school.id}
                  fields={{ do: "class", classId: c.id, termId: term.id }}
                  label={`Print slips for ${c.withoutSlip} ${c.withoutSlip === 1 ? "student" : "students"}`}
                  disabledNote={c.withoutSlip === 0 ? "Every student has a slip." : undefined}
                  after="If the file didn’t download, use Remake on the class page. Slips can’t be printed again."
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
