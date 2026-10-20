import Link from "next/link";
import { CheckIcon, CircleDashedIcon, TablePropertiesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatHundredths } from "@/lib/results";
import type { ClassResults } from "@/server/data";

import { ResultsList } from "./results-list";

/**
 * The class page's Results section (spec 0010, AC-8, AC-9): the class's
 * figures for the term the Scores picker chose, worked out on every read.
 * Ranked students in position order, then the incomplete ones with what is
 * missing; a row opens the student's breakdown. Includes direct link to
 * the full-class master compilation sheet (broadsheet).
 */
export function ResultsSection({
  results,
  schoolCode,
  slug,
  termQuery = "",
}: {
  results: ClassResults;
  schoolCode: string;
  slug?: string;
  termQuery?: string;
}) {
  const { cls, split, section, session, students, subjects } = results;

  return (
    <section aria-labelledby="results-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="results-title" className="type-title">
            Results
          </h2>
          {split.length > 0 && students.length > 0 && subjects.length > 0 && <Summary results={results} />}
        </div>

        {slug && split.length > 0 && students.length > 0 && subjects.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/${slug}/classes/${cls.id}/broadsheet${termQuery}`} />}
            className="gap-1.5"
          >
            <TablePropertiesIcon data-icon="inline-start" className="size-4" />
            Broadsheet
          </Button>
        )}
      </div>

      {split.length === 0 ? (
        <Note>
          Results need the score split for {section.name}, {session.name}. The VoxLMS team sets it.
        </Note>
      ) : students.length === 0 ? (
        <Note>No students in {cls.name} yet, so there are no results to work out.</Note>
      ) : subjects.length === 0 ? (
        <Note>No subjects are set for {cls.name} yet, so there are no results to work out.</Note>
      ) : (
        <>
          {!results.final && (
            <p className="flex items-start gap-2 rounded-xl border border-rule bg-card px-4 py-3 type-caption sm:text-[0.9375rem]">
              <CircleDashedIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-semibold">
                  Provisional: <span className="type-figure">{results.incompleteCount}</span> {results.incompleteCount === 1 ? "student" : "students"} incomplete.
                </span>{" "}
                Positions and averages can still change until every score is in.
              </span>
            </p>
          )}
          <ResultsList results={results} schoolCode={schoolCode} />
        </>
      )}
    </section>
  );
}

function Summary({ results }: { results: ClassResults }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
      <span>
        <span className="type-figure">{results.numberInClass}</span> in class
      </span>
      <span aria-hidden="true">·</span>
      <span>
        Class average <span className="type-figure font-semibold text-foreground">{results.classAverage === null ? "–" : formatHundredths(results.classAverage)}</span>
      </span>
      {results.final && (
        <>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1 font-semibold text-success">
            <CheckIcon aria-hidden="true" className="size-4" />
            Final
          </span>
        </>
      )}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">{children}</p>;
}
