"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, CheckCircle2Icon, AlertCircleIcon, ArrowUpDownIcon, FilterIcon, SlidersHorizontalIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { displayStudentId } from "@/lib/student-number";
import { formatHundredths, formatTenths, ordinal, type StudentResult } from "@/lib/results";
import { termLabel } from "@/lib/term-label";
import { cn } from "@/lib/utils";
import type { ClassResults } from "@/server/data";

type SortMode = "position" | "name";
type ViewMode = "full" | "compact";

interface BroadsheetViewProps {
  results: ClassResults;
  schoolCode: string;
  backHref: string;
  backLabel?: string;
}

export function BroadsheetView({ results, schoolCode, backHref, backLabel = "Back to class" }: BroadsheetViewProps) {
  const [sortMode, setSortMode] = useState<SortMode>("position");
  const [viewMode, setViewMode] = useState<ViewMode>("full");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [search, setSearch] = useState("");

  const { cls, term, session, split, subjects, students } = results;

  // Filter & sort students
  const displayedStudents = useMemo(() => {
    let list = [...students];

    if (incompleteOnly) {
      list = list.filter((s) => s.status === "incomplete");
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.surname.toLowerCase().includes(q) ||
          s.otherNames.toLowerCase().includes(q) ||
          (s.admissionNo && s.admissionNo.toLowerCase().includes(q)) ||
          String(s.studentNo).includes(q),
      );
    }

    if (sortMode === "name") {
      list.sort((a, b) => {
        const s = a.surname.localeCompare(b.surname);
        if (s !== 0) return s;
        return a.otherNames.localeCompare(b.otherNames);
      });
    } else {
      // Position order: ranked first by position, then incomplete by surname
      list.sort((a, b) => {
        if (a.status === "ranked" && b.status === "ranked") {
          return (a.position ?? 0) - (b.position ?? 0);
        }
        if (a.status === "ranked") return -1;
        if (b.status === "ranked") return 1;
        return a.surname.localeCompare(b.surname);
      });
    }

    return list;
  }, [students, sortMode, incompleteOnly, search]);

  const subColSpan = viewMode === "full" ? split.length + 2 : 2;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Top Header / Meta Bar */}
      <header className="flex flex-col gap-4 border-b border-rule pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={backHref} />} className="-ml-3 text-muted-foreground">
            <ArrowLeftIcon data-icon="inline-start" />
            {backLabel}
          </Button>

          <div className="flex items-center gap-2">
            {results.final ? (
              <Badge variant="outline" className="gap-1 border-success/40 bg-success-wash text-success font-medium">
                <CheckCircle2Icon className="size-3.5" />
                Final Results
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-warning/40 bg-warning-wash text-warning font-medium">
                <AlertCircleIcon className="size-3.5" />
                Provisional ({results.incompleteCount} incomplete)
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="type-title text-2xl font-bold tracking-tight sm:text-3xl">
              {cls.name} Master Compilation Sheet
            </h1>
            <p className="text-sm text-muted-foreground">
              {termLabel(term.number, session.name)} · {results.section.name} · {students.length} students enrolled
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div>
              Class Average:{" "}
              <span className="type-figure font-bold text-foreground">
                {results.classAverage === null ? "–" : `${formatHundredths(results.classAverage)}%`}
              </span>
            </div>
            <div>
              Ranked:{" "}
              <span className="type-figure font-bold text-foreground">
                {students.length - results.incompleteCount} / {students.length}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Toolbar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border border-rule">
        <div className="flex flex-wrap items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center rounded-lg border border-input bg-card p-0.5 text-xs shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode("full")}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                viewMode === "full" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Full Breakdown
            </button>
            <button
              type="button"
              onClick={() => setViewMode("compact")}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                viewMode === "compact" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Totals Only
            </button>
          </div>

          {/* Sort Switcher */}
          <div className="flex items-center rounded-lg border border-input bg-card p-0.5 text-xs shadow-xs">
            <button
              type="button"
              onClick={() => setSortMode("position")}
              className={cn(
                "rounded-md px-2.5 py-1.5 font-medium transition-colors flex items-center gap-1.5",
                sortMode === "position" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowUpDownIcon className="size-3" />
              By Rank
            </button>
            <button
              type="button"
              onClick={() => setSortMode("name")}
              className={cn(
                "rounded-md px-2.5 py-1.5 font-medium transition-colors flex items-center gap-1.5",
                sortMode === "name" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Alphabetical
            </button>
          </div>

          {/* Incomplete Filter */}
          <button
            type="button"
            onClick={() => setIncompleteOnly((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors shadow-xs",
              incompleteOnly
                ? "border-warning bg-warning-wash text-warning font-semibold"
                : "border-input bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <FilterIcon className="size-3" />
            Incomplete Only ({results.incompleteCount})
          </button>
        </div>

        {/* Quick Search */}
        <div className="w-full sm:w-64">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student or ID..."
            className="h-8 w-full rounded-lg border border-input bg-card px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Main Matrix Table */}
      <div className="relative max-h-[calc(100vh-16rem)] min-h-[480px] w-full overflow-auto rounded-xl border border-rule bg-card shadow-sm">
        <table className="w-full border-separate border-spacing-0 text-left text-xs sm:text-sm">
          {/* Header Rows */}
          <thead>
            {/* Top Tier: Subject Names & Groups */}
            <tr className="bg-muted/95 backdrop-blur-md">
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-30 w-12 min-w-12 border-b-2 border-r border-rule bg-muted/95 px-2 py-2 text-center font-bold"
              >
                Pos
              </th>
              <th
                rowSpan={2}
                className="sticky left-12 top-0 z-30 w-44 min-w-44 border-b-2 border-r border-rule bg-muted/95 px-3 py-2 font-bold sm:w-56 sm:min-w-56"
              >
                Student Name
              </th>
              <th
                rowSpan={2}
                className="sticky left-[14rem] top-0 z-30 w-24 min-w-24 border-b-2 border-r-2 border-rule bg-muted/95 px-2 py-2 font-bold sm:left-[17rem]"
              >
                ID / No.
              </th>

              {/* Subject Groups */}
              {subjects.map((subj) => (
                <th
                  key={subj.classSubjectId}
                  colSpan={subColSpan}
                  className="sticky top-0 z-20 border-b border-r-2 border-rule bg-muted/95 px-2 py-2 text-center font-bold"
                >
                  <div className="flex flex-col items-center justify-center">
                    <span className="truncate max-w-[200px]" title={subj.name}>
                      {subj.name}
                    </span>
                    {subj.isElective && (
                      <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">
                        Elective
                      </span>
                    )}
                  </div>
                </th>
              ))}

              {/* Summary Group */}
              <th
                colSpan={4}
                className="sticky top-0 z-20 border-b border-rule bg-muted/95 px-3 py-2 text-center font-bold"
              >
                Term Summary
              </th>
            </tr>

            {/* Sub Tier: Components (CA, Exam, Total, Grade) */}
            <tr className="bg-muted/90 backdrop-blur-md">
              {subjects.map((subj) => (
                <ComponentSubHeaders
                  key={subj.classSubjectId}
                  split={split}
                  viewMode={viewMode}
                />
              ))}

              {/* Summary Sub-headers */}
              <th className="sticky top-[38px] z-20 border-b-2 border-r border-rule bg-muted/90 px-2.5 py-1.5 text-right font-semibold text-muted-foreground">
                Total
              </th>
              <th className="sticky top-[38px] z-20 border-b-2 border-r border-rule bg-muted/90 px-2.5 py-1.5 text-right font-semibold text-muted-foreground">
                Avg %
              </th>
              <th className="sticky top-[38px] z-20 border-b-2 border-r border-rule bg-muted/90 px-2 py-1.5 text-center font-semibold text-muted-foreground">
                Rank
              </th>
              <th className="sticky top-[38px] z-20 border-b-2 border-rule bg-muted/90 px-2.5 py-1.5 text-center font-semibold text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>

          {/* Student Rows */}
          <tbody>
            {displayedStudents.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + subjects.length * subColSpan + 4}
                  className="p-12 text-center text-muted-foreground"
                >
                  No students found matching current filters.
                </td>
              </tr>
            ) : (
              displayedStudents.map((s, index) => {
                const isRanked = s.status === "ranked";
                const isEven = index % 2 === 0;

                return (
                  <tr
                    key={s.studentId}
                    className={cn(
                      "group transition-colors hover:bg-muted/50",
                      isEven ? "bg-card" : "bg-muted/15",
                    )}
                  >
                    {/* Position */}
                    <td className="sticky left-0 z-10 border-b border-r border-rule bg-inherit px-2 py-2 text-center font-semibold type-figure">
                      {isRanked ? (
                        <RankBadge position={s.position!} />
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>

                    {/* Student Name */}
                    <td className="sticky left-12 z-10 border-b border-r border-rule bg-inherit px-3 py-2 font-medium">
                      <span className="font-bold text-foreground">
                        {s.surname.toUpperCase()}
                      </span>
                      {", "}
                      <span className="text-muted-foreground">{s.otherNames}</span>
                    </td>

                    {/* ID */}
                    <td className="sticky left-[14rem] z-10 border-b border-r-2 border-rule bg-inherit px-2 py-2 type-figure text-xs text-muted-foreground sm:left-[17rem]">
                      {displayStudentId(schoolCode, s)}
                    </td>

                    {/* Subject Cells */}
                    {subjects.map((subj) => {
                      const line = s.subjects.find((l) => l.classSubjectId === subj.classSubjectId);
                      return (
                        <SubjectScoreCells
                          key={subj.classSubjectId}
                          split={split}
                          line={line}
                          viewMode={viewMode}
                        />
                      );
                    })}

                    {/* Summary Columns */}
                    <td className="border-b border-r border-rule px-2.5 py-2 text-right type-figure font-semibold">
                      {s.total !== null ? formatTenths(s.total) : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="border-b border-r border-rule px-2.5 py-2 text-right type-figure font-bold">
                      {s.average !== null ? (
                        `${formatHundredths(s.average)}%`
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="border-b border-r border-rule px-2 py-2 text-center type-figure font-medium">
                      {s.position !== null ? ordinal(s.position) : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="border-b border-rule px-2.5 py-2 text-center">
                      {isRanked ? (
                        <span className="inline-flex items-center text-xs font-medium text-success">
                          Ranked
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-semibold text-warning" title={s.missing.map(m => `${m.subjectName}: ${m.partLabels.join(", ")}`).join(" · ")}>
                          Incomplete
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Footer / Summary Rows */}
          <tfoot>
            {/* Subject Average Row */}
            <tr className="bg-muted/80 font-semibold border-t-2 border-rule">
              <td
                colSpan={3}
                className="sticky left-0 z-20 border-b border-r-2 border-rule bg-muted/95 px-3 py-2 font-bold text-foreground"
              >
                Class Average
              </td>
              {subjects.map((subj) => (
                <SubjectStatCell
                  key={subj.classSubjectId}
                  splitLength={split.length}
                  viewMode={viewMode}
                  value={subj.classAverage !== null ? formatHundredths(subj.classAverage) : "–"}
                />
              ))}
              <td className="border-b border-r border-rule px-2.5 py-2 text-right type-figure font-bold">
                –
              </td>
              <td className="border-b border-r border-rule px-2.5 py-2 text-right type-figure font-bold text-foreground">
                {results.classAverage !== null ? `${formatHundredths(results.classAverage)}%` : "–"}
              </td>
              <td colSpan={2} className="border-b border-rule bg-muted/80" />
            </tr>

            {/* Subject Highest Row */}
            <tr className="bg-muted/60 font-medium">
              <td
                colSpan={3}
                className="sticky left-0 z-20 border-b border-r-2 border-rule bg-muted/95 px-3 py-1.5 text-xs font-semibold text-success"
              >
                Highest
              </td>
              {subjects.map((subj) => (
                <SubjectStatCell
                  key={subj.classSubjectId}
                  splitLength={split.length}
                  viewMode={viewMode}
                  value={subj.highest !== null ? formatTenths(subj.highest) : "–"}
                  className="text-success font-semibold"
                />
              ))}
              <td colSpan={4} className="border-b border-rule bg-muted/60" />
            </tr>

            {/* Subject Lowest Row */}
            <tr className="bg-muted/40 font-medium">
              <td
                colSpan={3}
                className="sticky left-0 z-20 border-r-2 border-rule bg-muted/95 px-3 py-1.5 text-xs font-semibold text-muted-foreground"
              >
                Lowest
              </td>
              {subjects.map((subj) => (
                <SubjectStatCell
                  key={subj.classSubjectId}
                  splitLength={split.length}
                  viewMode={viewMode}
                  value={subj.lowest !== null ? formatTenths(subj.lowest) : "–"}
                  className="text-muted-foreground"
                />
              ))}
              <td colSpan={4} className="bg-muted/40" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ComponentSubHeaders({
  split,
  viewMode,
}: {
  split: ClassResults["split"];
  viewMode: ViewMode;
}) {
  if (viewMode === "compact") {
    return (
      <>
        <th className="sticky top-[38px] z-20 w-16 min-w-16 border-b-2 border-r border-rule/50 bg-muted/90 px-1.5 py-1 text-center font-bold text-muted-foreground">
          Total
        </th>
        <th className="sticky top-[38px] z-20 w-12 min-w-12 border-b-2 border-r-2 border-rule bg-muted/90 px-1 py-1 text-center font-bold text-muted-foreground">
          Grd
        </th>
      </>
    );
  }

  return (
    <>
      {split.map((part) => (
        <th
          key={part.key}
          className="sticky top-[38px] z-20 w-14 min-w-14 border-b-2 border-r border-rule/50 bg-muted/90 px-1 py-1 text-center font-semibold text-muted-foreground text-[11px]"
          title={`${part.label} (Max: ${part.max})`}
        >
          {part.label}
          <span className="block text-[10px] font-normal opacity-70">
            /{part.max}
          </span>
        </th>
      ))}
      <th className="sticky top-[38px] z-20 w-14 min-w-14 border-b-2 border-r border-rule/50 bg-muted/90 px-1 py-1 text-center font-bold text-foreground text-[11px]">
        Tot
      </th>
      <th className="sticky top-[38px] z-20 w-11 min-w-11 border-b-2 border-r-2 border-rule bg-muted/90 px-1 py-1 text-center font-bold text-muted-foreground text-[11px]">
        Grd
      </th>
    </>
  );
}

function SubjectScoreCells({
  split,
  line,
  viewMode,
}: {
  split: ClassResults["split"];
  line: StudentResult["subjects"][number] | undefined;
  viewMode: ViewMode;
}) {
  // If student doesn't take this subject (not registered elective)
  if (!line) {
    const colCount = viewMode === "full" ? split.length + 2 : 2;
    return (
      <td
        colSpan={colCount}
        className="border-b border-r-2 border-rule bg-muted/10 text-center text-muted-foreground/30 font-mono text-xs select-none"
      >
        —
      </td>
    );
  }

  if (viewMode === "compact") {
    return (
      <>
        <td className="border-b border-r border-rule/50 px-1.5 py-1.5 text-center font-bold type-figure">
          {line.total !== null ? formatTenths(line.total) : <span className="text-destructive font-bold">!</span>}
        </td>
        <td className="border-b border-r-2 border-rule px-1 py-1.5 text-center font-bold text-xs">
          {line.grade ?? "–"}
        </td>
      </>
    );
  }

  return (
    <>
      {split.map((part) => {
        const val = line.scores[part.key];
        const isMissing = val === undefined;

        return (
          <td
            key={part.key}
            className={cn(
              "border-b border-r border-rule/50 px-1 py-1.5 text-center type-figure text-xs font-mono",
              isMissing ? "bg-destructive/10 text-destructive font-bold" : "text-foreground",
            )}
          >
            {isMissing ? "—" : val}
          </td>
        );
      })}

      {/* Subject Total */}
      <td
        className={cn(
          "border-b border-r border-rule/50 px-1 py-1.5 text-center font-bold type-figure text-xs",
          line.total === null ? "bg-destructive/10 text-destructive" : "text-foreground",
        )}
      >
        {line.total !== null ? formatTenths(line.total) : "—"}
      </td>

      {/* Subject Grade */}
      <td className="border-b border-r-2 border-rule px-1 py-1.5 text-center font-bold text-xs">
        <GradeText grade={line.grade} />
      </td>
    </>
  );
}

function SubjectStatCell({
  splitLength,
  viewMode,
  value,
  className,
}: {
  splitLength: number;
  viewMode: ViewMode;
  value: string;
  className?: string;
}) {
  if (viewMode === "compact") {
    return (
      <>
        <td className={cn("border-b border-r border-rule/50 px-1.5 py-1 text-center font-mono type-figure text-xs", className)}>
          {value}
        </td>
        <td className="border-b border-r-2 border-rule px-1 py-1" />
      </>
    );
  }

  return (
    <>
      {Array.from({ length: splitLength }).map((_, i) => (
        <td key={i} className="border-b border-r border-rule/50 bg-inherit" />
      ))}
      <td className={cn("border-b border-r border-rule/50 px-1 py-1 text-center font-mono type-figure text-xs", className)}>
        {value}
      </td>
      <td className="border-b border-r-2 border-rule bg-inherit" />
    </>
  );
}

function GradeText({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-muted-foreground">–</span>;
  const isTop = grade === "A" || grade === "A1";
  const isFail = grade === "F" || grade === "F9";
  return (
    <span
      className={cn(
        isTop && "text-success font-black",
        isFail && "text-destructive font-black",
        !isTop && !isFail && "text-foreground font-semibold",
      )}
    >
      {grade}
    </span>
  );
}

function RankBadge({ position }: { position: number }) {
  if (position === 1) {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-500/20 text-xs font-black text-amber-700 dark:text-amber-400">
        1st
      </span>
    );
  }
  if (position === 2) {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-400/25 text-xs font-bold text-slate-700 dark:text-slate-300">
        2nd
      </span>
    );
  }
  if (position === 3) {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-700/15 text-xs font-bold text-amber-800 dark:text-amber-500">
        3rd
      </span>
    );
  }
  return <span className="text-muted-foreground text-xs">{ordinal(position)}</span>;
}
