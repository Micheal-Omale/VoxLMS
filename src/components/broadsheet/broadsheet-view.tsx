"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatHundredths, formatTenths, missingLabel, ordinal, type StudentResult } from "@/lib/results";
import { displayStudentId } from "@/lib/student-number";
import { termLabel } from "@/lib/term-label";
import { cn } from "@/lib/utils";
import type { ClassResults } from "@/server/data";

type SortMode = "position" | "name";
type ViewMode = "full" | "compact";
type Split = ClassResults["split"];
type Line = StudentResult["subjects"][number];

// Every cell is opaque so pinned columns never show the scores scrolling under them.
const HEAD = "border-b border-rule bg-background px-2 py-2 type-caption font-semibold text-muted-foreground";
const CELL = "border-b border-rule px-2 py-2 type-figure";
// The right edge of a subject group and of the pinned name column.
const GROUP_EDGE = "border-r border-r-input";

/**
 * The class broadsheet (spec 0015): every student against every subject, all
 * figures straight from Results computation (spec 0010). A part not entered is
 * a red dash, never a 0; a subject the student doesn't take is a quiet dash.
 */
export function BroadsheetView({ results, schoolCode, backHref, backLabel = "Back to class" }: { results: ClassResults; schoolCode: string; backHref: string; backLabel?: string }) {
  const [sortMode, setSortMode] = useState<SortMode>("position");
  const [viewMode, setViewMode] = useState<ViewMode>("full");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [search, setSearch] = useState("");

  const { cls, term, session, split, subjects, students } = results;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = students.filter(
      (s) =>
        (!incompleteOnly || s.status === "incomplete") &&
        (!q || s.surname.toLowerCase().includes(q) || s.otherNames.toLowerCase().includes(q) || displayStudentId(schoolCode, s).toLowerCase().includes(q)),
    );
    const byName = (a: StudentResult, b: StudentResult) => a.surname.localeCompare(b.surname) || a.otherNames.localeCompare(b.otherNames);
    return list.sort(
      sortMode === "name"
        ? byName
        : (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || byName(a, b),
    );
  }, [students, sortMode, incompleteOnly, search, schoolCode]);

  const full = viewMode === "full";
  const perSubject = full ? split.length + 2 : 2;
  const columns = 2 + subjects.length * perSubject + 3;

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-col items-start gap-1">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={backHref} />} className="-ml-3 text-muted-foreground">
          <ArrowLeftIcon data-icon="inline-start" />
          {backLabel}
        </Button>
        <h1 className="type-display">{cls.name} broadsheet</h1>
        <p className="text-muted-foreground">
          {termLabel(term.number, session.name)} · {results.section.name} · <span className="type-figure">{students.length}</span> {students.length === 1 ? "student" : "students"}
          {results.classAverage !== null && (
            <>
              {" "}
              · class average <span className="type-figure font-semibold text-foreground">{formatHundredths(results.classAverage)}%</span>
            </>
          )}
        </p>
        {results.final ? (
          <Badge className="mt-1 bg-success-wash text-success">Every result is in</Badge>
        ) : (
          <Badge className="mt-1 bg-destructive-wash text-destructive">
            <span className="type-figure">{results.incompleteCount}</span> {results.incompleteCount === 1 ? "student has" : "students have"} missing scores
          </Badge>
        )}
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <ToggleGroup variant="outline" size="sm" value={[viewMode]} onValueChange={(v) => v[0] && setViewMode(v[0] as ViewMode)} aria-label="Columns">
          <ToggleGroupItem value="full">Every part</ToggleGroupItem>
          <ToggleGroupItem value="compact">Totals only</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup variant="outline" size="sm" value={[sortMode]} onValueChange={(v) => v[0] && setSortMode(v[0] as SortMode)} aria-label="Order">
          <ToggleGroupItem value="position">By position</ToggleGroupItem>
          <ToggleGroupItem value="name">By name</ToggleGroupItem>
        </ToggleGroup>
        <Toggle variant="outline" size="sm" pressed={incompleteOnly} onPressedChange={setIncompleteOnly} disabled={results.incompleteCount === 0} className="w-fit">
          Missing scores only
        </Toggle>
        <InputGroup className="sm:ml-auto sm:w-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a student" aria-label="Find a student" />
        </InputGroup>
      </div>

      <div className="max-h-[calc(100dvh-12rem)] overflow-auto rounded-xl border border-rule bg-card">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th rowSpan={2} scope="col" className={cn(HEAD, "sticky left-0 z-10 w-12 min-w-12 text-center")}>
                Pos
              </th>
              <th rowSpan={2} scope="col" className={cn(HEAD, GROUP_EDGE, "sticky left-12 z-10 w-40 min-w-40 text-left sm:w-56 sm:min-w-56")}>
                Student
              </th>
              {subjects.map((subj) => (
                <th key={subj.classSubjectId} colSpan={perSubject} scope="colgroup" className={cn(HEAD, GROUP_EDGE, "max-w-48 font-bold text-foreground")}>
                  <span className="block truncate" title={subj.name}>
                    {subj.name}
                  </span>
                  {subj.isElective && <span className="block font-normal text-muted-foreground">Elective</span>}
                </th>
              ))}
              <th colSpan={3} scope="colgroup" className={cn(HEAD, "font-bold text-foreground")}>
                Term
              </th>
            </tr>
            <tr>
              {subjects.map((subj) => (
                <PartHeaders key={subj.classSubjectId} split={split} full={full} />
              ))}
              <th scope="col" className={cn(HEAD, "text-right")}>
                Total
              </th>
              <th scope="col" className={cn(HEAD, "text-right")}>
                Average
              </th>
              <th scope="col" className={cn(HEAD, "text-right")}>
                Position
              </th>
            </tr>
          </thead>

          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={columns} className="p-10 text-center text-muted-foreground">
                  No student matches.
                </td>
              </tr>
            ) : (
              shown.map((s) => (
                <tr key={s.studentId}>
                  <td className={cn(CELL, "sticky left-0 z-10 bg-card text-center font-semibold")}>{s.position !== null ? s.position : <Dash />}</td>
                  <th scope="row" className={cn(CELL, GROUP_EDGE, "sticky left-12 z-10 bg-card text-left font-normal")}>
                    <span className="block truncate font-bold">
                      {s.surname.toUpperCase()} <span className="font-normal">{s.otherNames}</span>
                    </span>
                    <span className="block type-caption text-muted-foreground">{displayStudentId(schoolCode, s)}</span>
                    {s.status === "incomplete" && <span className="block type-caption text-destructive">Missing {missingLabel(s.missing)}</span>}
                  </th>
                  {subjects.map((subj) => (
                    <SubjectCells key={subj.classSubjectId} split={split} full={full} line={s.subjects.find((l) => l.classSubjectId === subj.classSubjectId)} />
                  ))}
                  <td className={cn(CELL, "text-right font-semibold")}>{s.total !== null ? formatTenths(s.total) : <Dash />}</td>
                  <td className={cn(CELL, "text-right font-bold")}>{s.average !== null ? `${formatHundredths(s.average)}%` : <Dash />}</td>
                  <td className={cn(CELL, "text-right whitespace-nowrap")}>{s.position !== null ? `${ordinal(s.position)} of ${results.numberInClass}` : <Dash />}</td>
                </tr>
              ))
            )}
          </tbody>

          <tfoot>
            <StatRow label="Class average" split={split} full={full} values={subjects.map((s) => (s.classAverage !== null ? formatHundredths(s.classAverage) : null))} overall={results.classAverage !== null ? `${formatHundredths(results.classAverage)}%` : null} />
            <StatRow label="Highest" split={split} full={full} values={subjects.map((s) => (s.highest !== null ? formatTenths(s.highest) : null))} />
            <StatRow label="Lowest" split={split} full={full} values={subjects.map((s) => (s.lowest !== null ? formatTenths(s.lowest) : null))} />
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Dash({ missing }: { missing?: boolean }) {
  return missing ? (
    <span className="text-destructive" aria-label="Not entered">
      –
    </span>
  ) : (
    <span className="text-muted-foreground" aria-label="None">
      –
    </span>
  );
}

function PartHeaders({ split, full }: { split: Split; full: boolean }) {
  return (
    <>
      {full &&
        split.map((part) => (
          <th key={part.key} scope="col" className={cn(HEAD, "min-w-12 text-right font-normal")}>
            <span className="block whitespace-nowrap">{part.label}</span>
            <span className="block type-figure">{part.max}</span>
          </th>
        ))}
      <th scope="col" className={cn(HEAD, "min-w-14 text-right text-foreground")}>
        Total
      </th>
      <th scope="col" className={cn(HEAD, GROUP_EDGE, "min-w-12 text-center text-foreground")}>
        Grade
      </th>
    </>
  );
}

function SubjectCells({ split, full, line }: { split: Split; full: boolean; line: Line | undefined }) {
  // Not taken (an elective the student isn't registered for).
  if (!line) {
    return (
      <td colSpan={full ? split.length + 2 : 2} className={cn(CELL, GROUP_EDGE, "text-center")}>
        <Dash />
      </td>
    );
  }
  return (
    <>
      {full &&
        split.map((part) => {
          const value = line.scores[part.key];
          return (
            <td key={part.key} className={cn(CELL, "text-right", value === undefined && "bg-destructive-wash")}>
              {value === undefined ? <Dash missing /> : value}
            </td>
          );
        })}
      <td className={cn(CELL, "text-right font-bold", line.total === null && "bg-destructive-wash")}>{line.total !== null ? formatTenths(line.total) : <Dash missing />}</td>
      <td className={cn(CELL, GROUP_EDGE, "text-center font-bold")}>{line.grade ?? <Dash />}</td>
    </>
  );
}

function StatRow({ label, split, full, values, overall }: { label: string; split: Split; full: boolean; values: (string | null)[]; overall?: string | null }) {
  return (
    <tr>
      <th colSpan={2} scope="row" className={cn(CELL, GROUP_EDGE, "sticky left-0 z-10 bg-background text-left font-semibold")}>
        {label}
      </th>
      {values.map((value, i) => (
        <StatCells key={i} split={split} full={full} value={value} />
      ))}
      <td className={cn(CELL, "bg-background")} />
      <td className={cn(CELL, "bg-background text-right font-bold")}>{overall ?? ""}</td>
      <td className={cn(CELL, "bg-background")} />
    </tr>
  );
}

function StatCells({ split, full, value }: { split: Split; full: boolean; value: string | null }) {
  return (
    <>
      {full && split.map((part) => <td key={part.key} className={cn(CELL, "bg-background")} />)}
      <td className={cn(CELL, "bg-background text-right font-semibold")}>{value ?? <Dash />}</td>
      <td className={cn(CELL, GROUP_EDGE, "bg-background")} />
    </>
  );
}
