"use client";

import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { formatHundredths, formatTenths, missingLabel, ordinal, type StudentResult, type StudentSubjectResult } from "@/lib/results";
import { displayStudentId } from "@/lib/student-number";
import { termLabel } from "@/lib/term-label";
import type { ClassResults } from "@/server/data";

type PanelProps = {
  results: ClassResults;
  student: StudentResult | null;
  schoolCode: string;
  onClose: () => void;
};

const dash = "–";

/**
 * One student's breakdown (spec 0010, AC-8): every subject they take with its
 * parts and figures, then their overall total, average and position. A side
 * panel on a computer, full screen on a phone, like the score history.
 */
export function StudentResultPanel({ student, onClose, ...props }: PanelProps) {
  return (
    <Drawer open={student !== null} onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:[--drawer-content-width:100%] data-[swipe-axis=x]:sm:[--drawer-content-width:30rem] data-[swipe-direction=right]:rounded-l-none sm:data-[swipe-direction=right]:rounded-l-xl">
        {student && <PanelBody key={student.studentId} student={student} {...props} />}
      </DrawerContent>
    </Drawer>
  );
}

function PanelBody({ results, student, schoolCode }: Omit<PanelProps, "student" | "onClose"> & { student: StudentResult }) {
  const subjectFigures = new Map(results.subjects.map((s) => [s.classSubjectId, s]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 border-b border-rule px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DrawerTitle className="type-title text-foreground">
            <span className="font-extrabold">{student.surname}</span> <span className="font-normal">{student.otherNames}</span>
          </DrawerTitle>
          <DrawerDescription className="type-caption text-muted-foreground">
            Results · {termLabel(results.term.number, results.session.name)} · <span className="type-figure">{displayStudentId(schoolCode, student)}</span>
          </DrawerDescription>
        </div>
        <DrawerClose render={<Button variant="ghost" size="icon" aria-label="Close" />}>
          <XIcon />
        </DrawerClose>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
        {student.subjects.length === 0 ? (
          <p className="text-muted-foreground">{student.surname} takes no subjects yet. The VoxLMS team registers electives.</p>
        ) : (
          <ol aria-label="Subjects" className="flex flex-col gap-3">
            {student.subjects.map((line) => {
              const subject = subjectFigures.get(line.classSubjectId)!;
              return (
                <li key={line.classSubjectId} className="flex flex-col gap-3 rounded-xl border border-rule bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="type-heading">
                      {subject.name}
                      {subject.isElective && <span className="ml-2 type-caption font-normal text-muted-foreground">Elective</span>}
                    </h3>
                    {line.provisional && <ProvisionalMark />}
                  </div>
                  <Parts results={results} line={line} />
                  <dl className="grid grid-cols-3 gap-x-3 gap-y-3">
                    <Figure label="Total" value={line.total === null ? dash : formatTenths(line.total)} strong />
                    <Figure
                      label="Grade"
                      value={line.grade ?? dash}
                      note={line.remark ?? undefined}
                      strong
                    />
                    <Figure label="Position" value={line.position === null ? dash : ordinal(line.position)} />
                    <Figure label="Class average" value={subject.classAverage === null ? dash : formatHundredths(subject.classAverage)} />
                    <Figure label="Highest" value={subject.highest === null ? dash : formatTenths(subject.highest)} />
                    <Figure label="Lowest" value={subject.lowest === null ? dash : formatTenths(subject.lowest)} />
                  </dl>
                </li>
              );
            })}
          </ol>
        )}

        <section aria-labelledby="overall-title" className="flex flex-col gap-3 rounded-xl border border-foreground/20 bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 id="overall-title" className="type-heading">
              Overall
            </h3>
            {student.status === "ranked" && !results.final && <ProvisionalMark />}
          </div>
          {student.status === "ranked" ? (
            <dl className="grid grid-cols-3 gap-x-3">
              <Figure label="Total" value={formatTenths(student.total!)} strong />
              <Figure label="Average" value={formatHundredths(student.average!)} strong />
              <Figure label="Position" value={`${ordinal(student.position!)} of ${results.numberInClass}`} strong />
            </dl>
          ) : (
            <p>
              <span className="font-semibold">Incomplete:</span> {missingLabel(student.missing)}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/** The parts as typed, a dash for one not entered (never a 0). */
function Parts({ results, line }: { results: ClassResults; line: StudentSubjectResult }) {
  return (
    <div className="flex flex-col gap-1">
      <ul aria-label="Parts" className="flex flex-wrap gap-x-4 gap-y-1">
        {results.split.map((part) => {
          const value = line.scores[part.key];
          return (
            <li key={part.key} className="flex items-baseline gap-1.5">
              <span className="type-caption text-muted-foreground">{part.label}</span>
              <span className={value === undefined ? "type-figure text-muted-foreground" : "type-figure font-semibold"}>{value ?? dash}</span>
              <span className="type-caption text-muted-foreground">/{part.max}</span>
            </li>
          );
        })}
      </ul>
      {line.missing.length > 0 && (
        <p className="type-caption text-muted-foreground">
          {line.missing.join(", ")} not entered yet
        </p>
      )}
    </div>
  );
}

function Figure({ label, value, note, strong = false }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className={strong ? "type-score" : "type-figure font-semibold"}>{value}</dd>
      {note && <dd className="truncate type-caption text-muted-foreground">{note}</dd>}
    </div>
  );
}

function ProvisionalMark() {
  return <span className="shrink-0 rounded-full border border-rule px-2 py-0.5 type-caption text-muted-foreground">Provisional</span>;
}
