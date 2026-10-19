"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheckIcon, FileSpreadsheetIcon, InfoIcon, LinkIcon, RotateCcwIcon, UploadIcon, UsersIcon } from "lucide-react";

import { RedPenCircle } from "@/components/red-pen";
import { lagosTime } from "@/components/score-sheet/saving";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatNigerianPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { CommitResult, PlannedStudent, StudentOutcome, StudentPlan } from "@/server/data/imports";

// The student import screen (spec 0013, AC-2, AC-8, AC-9): upload, check the
// preview, tick any "probably here" rows to add anyway, confirm, see what was
// added and what was skipped. Nothing is saved before Confirm.

type Refusal = { code: string; error: string };

type Phase =
  | { kind: "idle"; refusal: Refusal | null }
  | { kind: "reading"; fileName: string }
  | { kind: "preview"; file: File; fileHash: string; plan: StudentPlan; notice: string | null }
  | { kind: "done"; fileName: string; result: CommitResult; at: Date };

type Filter = "all" | StudentOutcome;

const OUTCOME: Record<StudentOutcome, { label: string; className: string }> = {
  add: { label: "Will add", className: "bg-success-wash text-success" },
  here: { label: "Already here", className: "bg-muted text-muted-foreground" },
  probably: { label: "Probably here", className: "bg-warning-wash text-warning" },
  problem: { label: "Problem", className: "bg-destructive-wash text-destructive" },
};

const ACCEPT = ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

const students = (n: number) => `${n} ${n === 1 ? "student" : "students"}`;
const rowsWord = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

export function StudentImport({ schoolId, termLabel, studentsHref, guide }: { schoolId: string; termLabel: string; studentsHref: string; guide: React.ReactNode }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle", refusal: null });
  const [ticks, setTicks] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  async function post(file: File, fields: Record<string, string | string[]>) {
    const body = new FormData();
    body.set("file", file);
    for (const [key, value] of Object.entries(fields)) for (const v of [value].flat()) body.append(key, v);
    try {
      const response = await fetch(`/admin/schools/${schoolId}/import/students`, { method: "POST", body });
      return (await response.json()) as
        | { ok: true; mode: "preview"; fileHash: string; plan: StudentPlan }
        | ({ ok: true; mode: "commit" } & CommitResult)
        | { ok: false; code: string; error: string; fileHash?: string; plan?: StudentPlan };
    } catch {
      return { ok: false as const, code: "offline", error: "The upload didn’t reach VoxLMS. Check the connection and try again." };
    }
  }

  async function preview(file: File) {
    setPhase({ kind: "reading", fileName: file.name });
    setTicks(new Set());
    setFilter("all");
    const result = await post(file, { mode: "preview" });
    if (result.ok && result.mode === "preview") setPhase({ kind: "preview", file, fileHash: result.fileHash, plan: result.plan, notice: null });
    else if (!result.ok) setPhase({ kind: "idle", refusal: result });
  }

  async function confirm(current: Extract<Phase, { kind: "preview" }>) {
    setSaving(true);
    const result = await post(current.file, {
      mode: "commit",
      termId: current.plan.termId,
      fileHash: current.fileHash,
      planHash: current.plan.planHash,
      addAnyway: [...ticks].map(String),
    });
    setSaving(false);
    if (result.ok && result.mode === "commit") {
      setPhase({ kind: "done", fileName: current.file.name, result, at: new Date() });
      router.refresh();
      return;
    }
    if (result.ok) return;
    if (result.code === "plan_changed" && result.plan && result.fileHash) {
      // Keep the ticks that still apply to the fresh preview.
      const stillProbably = new Set(result.plan.rows.filter((r) => r.outcome === "probably").map((r) => r.row));
      setTicks((t) => new Set([...t].filter((row) => stillProbably.has(row))));
      setPhase({ kind: "preview", file: current.file, fileHash: result.fileHash, plan: result.plan, notice: result.error });
      return;
    }
    if (result.code === "term_changed") router.refresh();
    setPhase({ kind: "idle", refusal: result });
  }

  const reset = () => setPhase({ kind: "idle", refusal: null });

  if (phase.kind === "idle" || phase.kind === "reading") {
    // The guide sits beside the upload box only; the preview needs the full width.
    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <UploadBox termLabel={termLabel} reading={phase.kind === "reading" ? phase.fileName : null} refusal={phase.kind === "idle" ? phase.refusal : null} onFile={preview} />
        {guide}
      </div>
    );
  }
  if (phase.kind === "done") return <Result result={phase.result} fileName={phase.fileName} at={phase.at} studentsHref={studentsHref} onAgain={reset} />;

  const { plan, file, notice } = phase;
  const adding = plan.counts.add + plan.rows.filter((r) => r.outcome === "probably" && ticks.has(r.row)).length;
  const skippedCount = plan.rows.length - adding;
  const problems = plan.rows.filter((r) => r.outcome === "problem");
  const unknownClass = problems.some((r) => r.classText && !r.className);
  const shown = filter === "all" ? plan.rows : plan.rows.filter((r) => r.outcome === filter);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-card px-4 py-3">
        <p className="flex min-w-0 items-center gap-3">
          <FileSpreadsheetIcon aria-hidden="true" className="size-5 shrink-0 text-primary" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate type-label">{file.name}</span>
            <span className="type-caption text-muted-foreground">
              Sheet “{plan.sheet}”, headings on row <span className="type-figure">{plan.headerRow}</span> · into {plan.termLabel}
            </span>
          </span>
        </p>
        <Button variant="outline" size="sm" onClick={reset} disabled={saving}>
          <RotateCcwIcon data-icon="inline-start" />
          Choose another file
        </Button>
      </div>

      {notice && (
        <p role="alert" className="rounded-xl border border-warning/30 bg-warning-wash p-4 font-semibold text-warning">
          {notice}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-4" aria-label="Preview counts">
        <Count label="Will add" value={plan.counts.add} tone={plan.counts.add > 0 ? "text-success" : undefined} />
        <Count label="Already here" value={plan.counts.here} />
        <Count label="Probably here" value={plan.counts.probably} tone={plan.counts.probably > 0 ? "text-warning" : undefined} />
        <Count label="Problems" value={plan.counts.problems} tone={plan.counts.problems > 0 ? "text-destructive" : undefined} circled={plan.counts.problems > 0} />
      </dl>

      <ColumnsRead plan={plan} />

      {problems.length > 0 && (
        <section aria-labelledby="problems-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="problems-heading" className="type-heading">
              {rowsWord(problems.length)} to fix in Excel
            </h2>
            <p className="text-muted-foreground">These rows are skipped. Fix them in the file and upload it again: rows already added are skipped then, so only the fixed ones go in.</p>
          </div>
          <ol className="ruled-sheet border-y border-rule sm:rounded-xl sm:border-x">
            {problems.map((r) => (
              <li key={r.row} className="grid grid-cols-[var(--margin-x)_minmax(0,1fr)] gap-x-3 border-b border-rule py-2.5 pr-4 last:border-b-0">
                <span className="pr-2.5 text-right type-caption font-semibold type-figure text-destructive">
                  <span className="sr-only">Row </span>
                  {r.row}
                </span>
                <span className="flex min-w-0 flex-col pl-3">
                  <StudentName row={r} />
                  <span className="text-destructive">{r.reasons.join(" ")}</span>
                </span>
              </li>
            ))}
          </ol>
          {unknownClass && (
            <p className="type-caption text-muted-foreground">
              <span className="font-semibold text-foreground">Classes at this school:</span> {plan.classNames.join(", ")}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="rows-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="rows-heading" className="type-heading">
              Every row, as it will be saved
            </h2>
            <p className="type-caption text-muted-foreground">Row numbers are the rows in Excel.</p>
          </div>
          <ToggleGroup value={[filter]} onValueChange={(v) => v[0] && setFilter(v[0] as Filter)} variant="outline" size="sm" aria-label="Show rows" className="flex-wrap">
            <ToggleGroupItem value="all">All {plan.rows.length}</ToggleGroupItem>
            {(["add", "here", "probably", "problem"] as const).map((o) => {
              const n = plan.rows.filter((r) => r.outcome === o).length;
              return n === 0 ? null : (
                <ToggleGroupItem key={o} value={o}>
                  {OUTCOME[o].label} {n}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>

        <div className="ruled-sheet border-y border-rule sm:rounded-xl sm:border-x">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[var(--margin-x)_minmax(0,1.2fr)_9rem_minmax(0,1.4fr)_8.5rem] items-end gap-x-3 border-b border-rule py-2.5 pr-4 type-caption font-semibold text-muted-foreground lg:grid"
          >
            <span className="pr-2.5 text-right">Row</span>
            <span className="pl-3">Student</span>
            <span>Class</span>
            <span>Parents</span>
            <span>Outcome</span>
          </div>
          <ol aria-label="Rows of the file">
            {shown.map((r) => (
              <PreviewRow
                key={r.row}
                row={r}
                ticked={ticks.has(r.row)}
                onTick={(on) =>
                  setTicks((t) => {
                    const next = new Set(t);
                    if (on) next.add(r.row);
                    else next.delete(r.row);
                    return next;
                  })
                }
                disabled={saving}
              />
            ))}
          </ol>
        </div>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-rule bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:mx-0 sm:rounded-t-xl sm:border-x sm:bg-card/95">
        <div className="flex items-center gap-3">
          <p aria-live="polite" className="min-w-0 flex-1 type-caption sm:text-[0.9375rem]">
            {adding > 0 ? (
              <>
                <span className="font-semibold">{students(adding)}</span> will be added to {plan.termLabel}.
                {skippedCount > 0 && <span className="text-muted-foreground"> {rowsWord(skippedCount)} skipped.</span>}
              </>
            ) : (
              <span className="text-muted-foreground">Nothing to add: every row is already here, probably here, or has a problem.</span>
            )}
          </p>
          {adding > 0 && (
            <Button size="lg" onClick={() => confirm(phase)} disabled={saving} className="shrink-0">
              {saving ? <Spinner data-icon="inline-start" /> : <UsersIcon data-icon="inline-start" />}
              {saving ? "Adding" : `Add ${students(adding)}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Count({ label, value, tone, circled }: { label: string; value: number; tone?: string; circled?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card p-4">
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className={cn("type-title type-figure", tone)}>
        <span className="relative inline-block px-1">
          {value}
          {circled && <RedPenCircle />}
        </span>
      </dd>
    </div>
  );
}

/** Which column became which field, and the headings left out (AC-3). */
function ColumnsRead({ plan }: { plan: StudentPlan }) {
  return (
    <details className="rounded-xl border border-rule bg-card">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 type-label">
        Columns read <span className="font-normal text-muted-foreground">({plan.columns.length}{plan.ignored.length > 0 ? `, ${plan.ignored.length} not used` : ""})</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-rule px-4 py-3">
        <ul className="flex flex-wrap gap-2">
          {plan.columns.map((c) => (
            <li key={c.column} className="flex items-baseline gap-1.5 rounded-md border border-rule px-2 py-1 type-caption">
              <span className="font-semibold type-figure text-muted-foreground">{c.column}</span>
              <span>{c.header}</span>
              {c.header.toLowerCase() !== c.field.toLowerCase() && <span className="text-muted-foreground">→ {c.field}</span>}
            </li>
          ))}
        </ul>
        {plan.ignored.length > 0 && (
          <p className="type-caption text-muted-foreground">
            <span className="font-semibold">Not used:</span> {plan.ignored.join(", ")}
          </p>
        )}
      </div>
    </details>
  );
}

function StudentName({ row }: { row: PlannedStudent }) {
  if (!row.surname && !row.otherNames) return <span className="text-muted-foreground">No name</span>;
  return (
    <span className="break-words">
      <span className="font-bold">{row.surname}</span> {row.otherNames}
    </span>
  );
}

function PreviewRow({ row, ticked, onTick, disabled }: { row: PlannedStudent; ticked: boolean; onTick: (on: boolean) => void; disabled: boolean }) {
  const outcome = OUTCOME[row.outcome];
  const facts = [row.gender === "male" ? "Boy" : row.gender === "female" ? "Girl" : null, row.admissionNo, row.house ? `${row.house} house` : null].filter(Boolean);
  const tickId = `add-anyway-${row.row}`;
  return (
    <li className={cn("border-b border-rule last:border-b-0", row.outcome === "here" && "text-muted-foreground")}>
      <div className="grid grid-cols-[var(--margin-x)_minmax(0,1fr)] gap-x-3 py-2.5 pr-4 lg:grid-cols-[var(--margin-x)_minmax(0,1.2fr)_9rem_minmax(0,1.4fr)_8.5rem] lg:items-start">
        <span className={cn("row-span-4 pr-2.5 text-right type-caption type-figure text-muted-foreground lg:row-span-1 lg:pt-0.5", row.outcome === "problem" && "font-semibold text-destructive")}>
          <span className="sr-only">Row </span>
          {row.row}
        </span>

        <span className="flex min-w-0 flex-col pl-3">
          <span className="flex items-start justify-between gap-2">
            <StudentName row={row} />
            <Badge className={cn("lg:hidden", outcome.className)}>{outcome.label}</Badge>
          </span>
          {facts.length > 0 && <span className="type-caption type-figure text-muted-foreground">{facts.join(" · ")}</span>}
        </span>

        <span className="col-start-2 pl-3 type-caption lg:col-start-auto lg:pl-0 lg:type-body">
          {row.className ?? <span className={row.classText ? "text-destructive" : "text-muted-foreground"}>{row.classText || "No class"}</span>}
        </span>

        <span className="col-start-2 flex min-w-0 flex-col gap-1 pl-3 lg:col-start-auto lg:pl-0">
          {row.parents.length === 0 ? (
            <span className="type-caption text-muted-foreground">No parent</span>
          ) : (
            row.parents.map((p) => (
              <span key={p.block} className="flex min-w-0 flex-col type-caption">
                <span className="break-words">
                  <span className="font-semibold text-foreground">{p.fullName}</span> · {p.relationship}
                  {p.isPrimary && row.parents.length > 1 ? " · primary" : ""}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                  <span className="type-figure">{formatNigerianPhone(p.phone)}</span>
                  {row.outcome !== "here" && row.outcome !== "problem" && <ParentMatch match={p.match} />}
                </span>
                {p.note && <span className="text-warning">{p.note}</span>}
              </span>
            ))
          )}
        </span>

        <span className="hidden lg:block">
          <Badge className={outcome.className}>{outcome.label}</Badge>
        </span>

        {/* col-[2/-1], not col-span: a span alone would reset the start back over the margin. */}
        {(row.reasons.length > 0 || row.notes.length > 0 || row.outcome === "probably") && (
          <span className="col-[2/-1] mt-1.5 flex flex-col gap-1 pl-3">
            {row.outcome !== "problem" && row.reasons.length > 0 && <span className={cn("type-caption", row.outcome === "probably" && "font-semibold text-warning")}>{row.reasons.join(" ")}</span>}
            {row.outcome === "problem" && <span className="type-caption text-destructive">{row.reasons.join(" ")}</span>}
            {row.notes.map((note) => (
              <span key={note} className="flex items-start gap-1.5 type-caption text-muted-foreground">
                <InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {note}
              </span>
            ))}
            {row.outcome === "probably" && (
              <span className="flex min-h-11 items-center gap-2.5">
                <Checkbox id={tickId} checked={ticked} onCheckedChange={(on) => onTick(on === true)} disabled={disabled} />
                <label htmlFor={tickId} className="type-label">
                  Add anyway
                </label>
              </span>
            )}
          </span>
        )}
      </div>
    </li>
  );
}

function ParentMatch({ match }: { match: PlannedStudent["parents"][number]["match"] }) {
  if (match.kind === "existing") {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <LinkIcon aria-hidden="true" className="size-3" />
        Linked to the parent already here
      </span>
    );
  }
  if (match.sharedWithRow !== null) return <span>Same parent as row {match.sharedWithRow}</span>;
  return <span>New parent</span>;
}

function UploadBox({ termLabel, reading, refusal, onFile }: { termLabel: string; reading: string | null; refusal: Refusal | null; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="flex flex-col gap-4">
      {refusal && (
        <div role="alert" className="flex flex-col gap-1 rounded-xl border border-destructive/30 bg-destructive-wash p-4">
          <p className="type-label text-destructive">This file wasn’t imported</p>
          <p>{refusal.error}</p>
        </div>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!reading) take(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-input bg-card px-5 py-10 text-center transition-colors sm:py-14",
          dragging && "border-primary bg-accent",
        )}
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
          {reading ? <Spinner className="size-6" /> : <FileSpreadsheetIcon aria-hidden="true" className="size-7" />}
        </span>
        {reading ? (
          <div className="flex flex-col gap-1" aria-live="polite">
            <p className="type-heading">Reading {reading}</p>
            <p className="text-muted-foreground">Checking every row. Nothing is saved yet.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="type-heading">Upload the register</p>
              <p className="max-w-md text-muted-foreground">
                An Excel (.xlsx) or CSV file. Students are enrolled into {termLabel}. You’ll see every row before anything is saved.
              </p>
            </div>
            <Button size="lg" onClick={() => input.current?.click()}>
              <UploadIcon data-icon="inline-start" />
              Choose file
            </Button>
            <p className="hidden type-caption text-muted-foreground sm:block">or drop it here</p>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label="Register file"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function Result({ result, fileName, at, studentsHref, onAgain }: { result: CommitResult; fileName: string; at: Date; studentsHref: string; onAgain: () => void }) {
  const { counts, skipped } = result;
  const parents = [
    counts.parentsCreated > 0 ? `${counts.parentsCreated} new ${counts.parentsCreated === 1 ? "parent" : "parents"}` : null,
    counts.parentsLinked > 0 ? `${counts.parentsLinked} linked to ${counts.parentsLinked === 1 ? "a parent" : "parents"} already here` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-6">
      <div role="status" className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success-wash p-5">
        <p className="flex items-center gap-2 type-title text-success">
          <CircleCheckIcon aria-hidden="true" className="size-6 shrink-0" />
          {counts.added > 0 ? `${students(counts.added)} added` : "Nothing was added"}
        </p>
        <p>
          From {fileName}, at {lagosTime.format(at)}.{parents.length > 0 && ` With ${parents.join(" and ")}.`}
          {counts.added === 0 && " Every row was already here, probably here, or had a problem."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href={studentsHref} />}>
            <UsersIcon data-icon="inline-start" />
            Go to students
          </Button>
          <Button variant="outline" onClick={onAgain}>
            <UploadIcon data-icon="inline-start" />
            Import another file
          </Button>
        </div>
      </div>

      {skipped.length > 0 && (
        <section aria-labelledby="skipped-heading" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="skipped-heading" className="type-heading">
              {rowsWord(skipped.length)} skipped
            </h2>
            <p className="text-muted-foreground">Fix the problems in Excel and upload the same file again; only the fixed rows go in.</p>
          </div>
          <ol className="ruled-sheet border-y border-rule sm:rounded-xl sm:border-x">
            {skipped.map((r) => (
              <li key={r.row} className="grid grid-cols-[var(--margin-x)_minmax(0,1fr)] gap-x-3 border-b border-rule py-2.5 pr-4 last:border-b-0">
                <span className={cn("pr-2.5 text-right type-caption type-figure text-muted-foreground", r.outcome === "problem" && "font-semibold text-destructive")}>
                  <span className="sr-only">Row </span>
                  {r.row}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5 pl-3">
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate font-semibold">{r.name || "No name"}</span>
                    <Badge className={OUTCOME[r.outcome].className}>{OUTCOME[r.outcome].label}</Badge>
                  </span>
                  <span className={cn("type-caption", r.outcome === "problem" ? "text-destructive" : "text-muted-foreground")}>{r.reason}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
