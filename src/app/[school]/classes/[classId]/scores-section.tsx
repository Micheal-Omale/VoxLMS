import Link from "next/link";
import { CheckIcon, ChevronRightIcon, LockIcon } from "lucide-react";

import { termLabel, termName } from "@/lib/term-label";
import { cn } from "@/lib/utils";
import type { listSubjectProgress } from "@/server/data";

import { NavSelect } from "../nav-select";

type Progress = Awaited<ReturnType<typeof listSubjectProgress>>;
type Subject = Progress["subjects"][number];

/**
 * The class page's Scores section (spec 0009, AC-1, AC-2): every subject the
 * class offers with how many of its students are fully scored, and a term
 * picker for this session's terms up to the current one.
 */
export function ScoresSection({ slug, classId, progress }: { slug: string; classId: string; progress: Progress }) {
  const { term, terms, session, subjects } = progress;
  const query = term.isCurrent ? "" : `?term=${term.id}`;
  const taken = subjects.filter((s) => s.takers > 0);
  const done = taken.filter((s) => s.complete === s.takers).length;
  const compulsory = subjects.filter((s) => !s.isElective);
  const electives = subjects.filter((s) => s.isElective);

  return (
    <section aria-labelledby="scores-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 id="scores-title" className="type-title">
            Scores
          </h2>
          <p className="text-muted-foreground">
            {taken.length === 0 ? (
              "No subject has students yet."
            ) : (
              <>
                <span className="type-figure">{done}</span> of <span className="type-figure">{taken.length}</span> {taken.length === 1 ? "subject" : "subjects"} done
                {!term.isCurrent && ` in ${termName(term.number)}`}
              </>
            )}
          </p>
        </div>
        {terms.length > 1 && (
          <NavSelect
            id="term"
            label="Term"
            value={term.id}
            className="sm:w-56"
            options={terms.map((t) => ({
              value: t.id,
              label: t.isCurrent ? `${termLabel(t.number, session.name)} (current)` : termLabel(t.number, session.name),
              href: t.isCurrent ? `/${slug}/classes/${classId}` : `/${slug}/classes/${classId}?term=${t.id}`,
            }))}
          />
        )}
      </div>

      {!term.isCurrent && (
        <p className="flex items-start gap-2 rounded-xl border border-rule bg-card px-4 py-3 type-caption sm:text-[0.9375rem]">
          <LockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {termName(term.number)} is closed. Scores can only be changed in the current term.
        </p>
      )}

      {subjects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">
          No subjects are set for this class yet. The VoxLMS team sets each class’s subjects.
        </p>
      ) : (
        <div className="ruled-sheet overflow-hidden rounded-xl border border-rule">
          <SubjectList subjects={compulsory} hrefFor={(s) => `/${slug}/classes/${classId}/scores/${s.classSubjectId}${query}`} />
          {electives.length > 0 && (
            <>
              <p className="border-y border-rule bg-background/60 py-2 pr-4 pl-[calc(var(--margin-x)+0.75rem)] type-caption font-semibold text-muted-foreground first:border-t-0">
                Electives
              </p>
              <SubjectList subjects={electives} hrefFor={(s) => `/${slug}/classes/${classId}/scores/${s.classSubjectId}${query}`} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function SubjectList({ subjects, hrefFor }: { subjects: Subject[]; hrefFor: (s: Subject) => string }) {
  if (subjects.length === 0) return null;
  return (
    <ul>
      {subjects.map((s) => {
        const isDone = s.takers > 0 && s.complete === s.takers;
        return (
          <li key={s.classSubjectId} className="border-b border-rule last:border-b-0">
            <Link
              href={hrefFor(s)}
              className="grid min-h-14 grid-cols-[var(--margin-x)_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 pr-3 outline-none transition-colors hover:bg-background/60 focus-visible:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:pr-4"
            >
              <span aria-hidden="true" />
              <span className="flex min-w-0 flex-col gap-1.5 pl-1">
                <span className="truncate font-semibold">{s.name}</span>
                {s.takers === 0 ? (
                  <span className="type-caption text-muted-foreground">No students take this yet</span>
                ) : (
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="relative h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-rule"
                    >
                      <span
                        className={cn("absolute inset-y-0 left-0 rounded-full", isDone ? "bg-success" : "bg-primary")}
                        style={{ width: `${(s.complete / s.takers) * 100}%` }}
                      />
                    </span>
                    <span className="shrink-0 type-caption type-figure text-muted-foreground">
                      {s.complete} of {s.takers} complete
                    </span>
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                {isDone && (
                  <span className="flex items-center gap-1 type-caption font-semibold text-success">
                    <CheckIcon aria-hidden="true" className="size-4" />
                    Done
                  </span>
                )}
                <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
