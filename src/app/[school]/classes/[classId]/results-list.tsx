"use client";

import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";

import { formatHundredths, formatTenths, missingLabel, ordinal, type StudentResult } from "@/lib/results";
import type { ClassResults } from "@/server/data";

import { StudentResultPanel } from "./student-result-panel";

const ROW =
  "grid min-h-14 w-full grid-cols-[var(--margin-x)_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 pr-3 text-left outline-none transition-colors hover:bg-background/60 focus-visible:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[var(--margin-x)_minmax(0,1fr)_5rem_5.5rem_1rem] sm:pr-4";

/** The ranked students, then the incomplete group; a row opens the student's breakdown (spec 0010, AC-8). */
export function ResultsList({ results, schoolCode }: { results: ClassResults; schoolCode: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const ranked = results.students.filter((s) => s.status === "ranked");
  const incomplete = results.students.filter((s) => s.status === "incomplete");
  const open = results.students.find((s) => s.studentId === openId) ?? null;

  return (
    <>
      <div className="ruled-sheet overflow-hidden rounded-xl border border-rule">
        {ranked.length > 0 && (
          <>
            <div aria-hidden="true" className="grid grid-cols-[var(--margin-x)_minmax(0,1fr)_auto] gap-x-3 border-b border-rule py-2.5 pr-3 type-caption font-semibold text-muted-foreground sm:grid-cols-[var(--margin-x)_minmax(0,1fr)_5rem_5.5rem_1rem] sm:pr-4">
              <span className="pr-1.5 text-right">Pos.</span>
              <span className="pl-1">Student</span>
              <span className="hidden text-right sm:block">Total</span>
              <span className="text-right">Average</span>
              <span className="hidden sm:block" />
            </div>
            <ol aria-label={`${results.cls.name} positions`}>
              {ranked.map((s) => (
                <li key={s.studentId} className="border-b border-rule last:border-b-0">
                  <button type="button" className={ROW} onClick={() => setOpenId(s.studentId)}>
                    <span className="pr-1.5 text-right type-figure font-semibold">{ordinal(s.position!)}</span>
                    <span className="flex min-w-0 flex-col pl-1">
                      <Name student={s} />
                      <span className="type-caption type-figure text-muted-foreground sm:hidden">Total {formatTenths(s.total!)}</span>
                    </span>
                    <span className="hidden text-right type-figure text-muted-foreground sm:block">{formatTenths(s.total!)}</span>
                    <span className="flex items-center justify-end gap-1.5">
                      <span className="type-score">{formatHundredths(s.average!)}</span>
                      <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground sm:hidden" />
                    </span>
                    <ChevronRightIcon aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}

        {incomplete.length > 0 && (
          <>
            <p className="border-y border-rule bg-background/60 py-2 pr-4 pl-[calc(var(--margin-x)+0.25rem)] type-caption font-semibold text-muted-foreground first:border-t-0">
              Incomplete
            </p>
            <ul aria-label={`${results.cls.name} incomplete`}>
              {incomplete.map((s) => (
                <li key={s.studentId} className="border-b border-rule last:border-b-0">
                  <button
                    type="button"
                    className="grid min-h-14 w-full grid-cols-[var(--margin-x)_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 pr-3 text-left outline-none transition-colors hover:bg-background/60 focus-visible:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:pr-4"
                    onClick={() => setOpenId(s.studentId)}
                  >
                    <span aria-hidden="true" className="pr-1.5 text-right text-muted-foreground">
                      –
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5 pl-1">
                      <Name student={s} />
                      <span className="type-caption text-muted-foreground">
                        {s.subjects.length === 0 ? "Takes no subjects yet" : <>Missing {missingLabel(s.missing)}</>}
                      </span>
                    </span>
                    <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <StudentResultPanel results={results} student={open} schoolCode={schoolCode} onClose={() => setOpenId(null)} />
    </>
  );
}

function Name({ student }: { student: StudentResult }) {
  return (
    <span className="truncate">
      <span className="font-bold">{student.surname}</span> {student.otherNames}
    </span>
  );
}
