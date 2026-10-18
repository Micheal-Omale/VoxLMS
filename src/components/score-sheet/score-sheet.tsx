"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClipboardPasteIcon,
  CloudOffIcon,
  EyeIcon,
  HistoryIcon,
  LockIcon,
  RefreshCwIcon,
  UserXIcon,
} from "lucide-react";

import { RedPenCircle } from "@/components/red-pen";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import {
  applySaved,
  conflictedStudents,
  countEntries,
  type Draft,
  type Dropped,
  keepMine,
  readDraft,
  reconcile,
  same,
  shown,
  shownRows,
  toChanges,
  typeValue,
  takeSaved,
  writeDraft,
} from "./draft";
import {
  cellProblem,
  formatScore,
  readCell,
  readRow,
  SCORE_PATTERN,
  type RowState,
  type ScoreColumn,
  tidyPasted,
} from "./score-math";
import type { ReadOnlyReason, SaveOutcome, SaveRequest, SheetSnapshot, SheetStudent } from "./types";

export type { SheetScores, SheetStudent } from "./types";

type ScoreSheetProps = {
  /** Keys the draft kept on this device: `score-draft:{userId}:{termId}:{classSubjectId}`. */
  draftKey: string;
  /** "First Term", for the closed term messages. */
  termName: string;
  sheet: SheetSnapshot;
  lastSavedAt?: string | null;
  /** Set when the sheet opens read only: an earlier term, or viewing as someone. */
  readOnly?: ReadOnlyReason | null;
  /** Sends one frozen change set. Throwing counts as a failed request. */
  onSave: (request: SaveRequest) => Promise<SaveOutcome>;
  /** Opens a student's score history; without it the name is plain text. */
  onOpenHistory?: (student: SheetStudent) => void;
};

/** A request with no reply after this long counts as failed, so Save can be tried again (AC-5). */
const SAVE_TIMEOUT_MS = 20_000;

type Status = "idle" | "saving" | "saved" | "failed" | "updated" | "signedOut" | "invalid";
type SheetState = { sheet: SheetSnapshot; draft: Draft };

const lagosTime = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });
const lagosDay = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

const READ_ONLY_TEXT: Record<ReadOnlyReason, (termName: string) => string> = {
  closed: (termName) => `${termName} is closed. Scores can only be changed in the current term.`,
  viewingAs: () => "You are viewing as this person. Nothing can be saved.",
  lostAccess: () => "You no longer have this class. Your typed scores are kept on this phone.",
};

/** "OKON Emem": the register's surname first, in capitals for notices. */
export const noticeName = (student: Pick<SheetStudent, "surname" | "otherNames">) => `${student.surname.toUpperCase()} ${student.otherNames}`;

export function ScoreSheet({ draftKey, termName, sheet: initialSheet, lastSavedAt, readOnly: initialReadOnly = null, onSave, onOpenHistory }: ScoreSheetProps) {
  const [data, setData] = useState<SheetState>({ sheet: initialSheet, draft: {} });
  const [readOnly, setReadOnly] = useState<ReadOnlyReason | null>(initialReadOnly);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(lastSavedAt ?? null);
  const [restoredCount, setRestoredCount] = useState(0);
  const [notices, setNotices] = useState<string[]>([]);
  const [paste, setPaste] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const online = useOnline();
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  /** The frozen change set of the last Save tap, resent as is until it lands or is refused (AC-5). */
  const [retry, setRetry] = useState<SaveRequest | null>(null);
  const seqRef = useRef(0);
  // The sheet as last rendered, for handling a save's reply after the await.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  const { sheet, draft } = data;
  const { students, columns, scale, scores: saved } = sheet;
  const editable = readOnly === null;

  // Bring back anything typed on this device but never confirmed, checked against the fresh sheet.
  useEffect(() => {
    const restored = restoreDraft(draftKey, initialReadOnly, dataRef.current.sheet);
    setData((d) => ({ ...d, draft: restored.draft }));
    setRestoredCount(restored.restoredCount);
    setNotices(restored.notices);
    setLoaded(true);
  }, [draftKey, initialReadOnly]);

  // Keep the draft in step with every keystroke until the server confirms it. A read
  // only sheet never writes, so a draft left behind stays until Discard.
  useEffect(() => {
    if (loaded && editable) writeDraft(draftKey, draft);
  }, [draft, loaded, editable, draftKey]);

  const values = shownRows(editable ? draft : {}, saved, students, columns);
  const conflicts = editable ? conflictedStudents(draft, saved) : new Set<string>();
  const rows = students.map((student) => ({
    student,
    state: readRow(values[student.id], columns, scale),
    dirty: editable && student.id in draft,
    conflict: conflicts.has(student.id),
  }));
  const complete = rows.filter((row) => row.state.kind === "complete").length;
  const unfinished = rows.filter((row) => row.state.kind === "partial").length;
  // Only typed changes block a save; a saved score never does (AC-4).
  const toFix = editable
    ? Object.entries(draft).reduce(
        (n, [, row]) =>
          n +
          Object.entries(row).filter(([key, entry]) => {
            const column = columns.find((c) => c.key === key);
            return column ? cellProblem(readCell(entry.value, column), column) !== null : false;
          }).length,
        0,
      )
    : 0;
  const changedCount = editable ? Object.keys(draft).length : 0;

  function setCell(studentId: string, key: string, raw: string) {
    if (!editable) return;
    const current = shown(draft, saved, studentId, key);
    // Typing is filtered to scores; deleting is always allowed, so a bad pasted value can be cleared.
    if (!SCORE_PATTERN.test(raw) && raw.length >= current.length) return;
    if (status === "saved") setStatus("idle");
    setData((d) => ({ ...d, draft: typeValue(d.draft, d.sheet.scores, studentId, key, raw) }));
  }

  function focusCell(row: number, col: number) {
    sheetRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      const last = col === columns.length - 1;
      focusCell(last ? row + 1 : row, last ? 0 : col + 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(row + 1, col);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(row - 1, col);
    }
  }

  /** Several lines pasted into one field fill that column downwards (AC-10). */
  function onPaste(event: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, col: number) {
    if (!editable) return;
    const text = event.clipboardData.getData("text/plain");
    if (!/[\n\t]/.test(text)) return; // one value: the field handles it like typing
    event.preventDefault();
    if (text.includes("\t")) {
      setPaste({ tone: "error", text: "Paste one column at a time." });
      return;
    }
    const lines = text.split("\n");
    if (lines.length > 1 && lines.at(-1)!.replace(/\r/g, "").trim() === "") lines.pop();
    const column = columns[col];
    const targets = students.slice(rowIndex);
    let next = draft;
    let count = 0;
    lines.slice(0, targets.length).forEach((line, i) => {
      const value = tidyPasted(line);
      if (value === "") return; // a blank line leaves that student unchanged
      next = typeValue(next, saved, targets[i].id, column.key, value);
      count++;
    });
    const leftover = Math.max(0, lines.length - targets.length);
    setData((d) => ({ ...d, draft: next }));
    if (status === "saved") setStatus("idle");
    setPaste({
      tone: "info",
      text:
        `Pasted ${count} ${count === 1 ? "score" : "scores"} into ${column.label}, from ${noticeName(targets[0])} down. Check the names line up before saving.` +
        (leftover > 0 ? ` ${leftover} ${leftover === 1 ? "line was" : "lines were"} left over.` : ""),
    });
  }

  async function save() {
    if (!editable || status === "saving") return;
    if (toFix > 0) {
      sheetRef.current?.querySelector<HTMLInputElement>("[aria-invalid=true]")?.focus();
      return;
    }
    if (conflicts.size > 0) {
      sheetRef.current?.querySelector<HTMLButtonElement>("[data-conflict-choice]")?.focus();
      return;
    }
    const request = retry ?? { saveId: crypto.randomUUID(), changes: toChanges(draft) };
    if (request.changes.length === 0) return;
    setRetry(request);
    const seq = ++seqRef.current;
    setStatus("saving");
    const outcome = await settle(onSave(request));
    if (seq !== seqRef.current) return; // a newer attempt owns the sheet now
    handle(outcome, request);
  }

  function handle(outcome: SaveOutcome, request: SaveRequest) {
    const current = dataRef.current;
    switch (outcome.kind) {
      case "saved": {
        setRetry(null);
        const applied = applySaved(current.draft, current.sheet.scores, request.changes);
        setData({ sheet: { ...current.sheet, scores: applied.saved }, draft: applied.draft });
        setSavedAt(outcome.updatedAt);
        setStatus("saved");
        setRestoredCount(0);
        setNotices([]);
        return;
      }
      case "conflict": {
        // Nothing was written. Rows typed over a value someone changed become conflict rows (AC-7).
        setRetry(null);
        const { draft: next } = reconcile(current.draft, outcome.sheet.scores, outcome.sheet.students, outcome.sheet.columns);
        setData({ sheet: outcome.sheet, draft: next });
        setStatus("idle");
        return;
      }
      case "stale": {
        // The sheet changed under the teacher: reload it, say what changed, keep everything else (AC-8).
        setRetry(null);
        const { draft: next, dropped } = reconcile(current.draft, outcome.sheet.scores, outcome.sheet.students, outcome.sheet.columns);
        const removed = [...new Set([...outcome.removedStudentIds, ...dropped.studentIds])];
        const named = removed.map((id) => current.sheet.students.find((s) => s.id === id)).filter((s): s is SheetStudent => Boolean(s));
        const tooHigh = Object.entries(next).some(([, row]) =>
          Object.entries(row).some(([key, entry]) => {
            const column = outcome.sheet.columns.find((c) => c.key === key);
            return column ? readCell(entry.value, column).kind === "over" : false;
          }),
        );
        setData({ sheet: outcome.sheet, draft: next });
        setNotices([
          ...droppedNotices({ studentIds: removed.filter((id) => !named.some((s) => s.id === id)), columnKeys: dropped.columnKeys }, named, current.sheet.columns),
          ...(tooHigh ? ["A maximum was lowered, so some typed scores are now too high. Fix the circled scores."] : []),
          "Everything else you typed is still here. Save once more to finish.",
        ]);
        setStatus("idle");
        return;
      }
      case "closed":
        setRetry(null);
        setReadOnly("closed");
        setStatus("idle");
        return;
      case "readOnly":
        setRetry(null);
        setReadOnly("viewingAs");
        setStatus("idle");
        return;
      case "notFound":
        setRetry(null);
        setReadOnly("lostAccess");
        setStatus("idle");
        return;
      case "invalid":
        setRetry(null);
        setStatus("invalid");
        return;
      case "signedOut":
      case "failed":
      case "updated":
        // The frozen change set stays, so the retry sends exactly the same save.
        setStatus(outcome.kind);
        return;
    }
  }

  function discardRestored() {
    setData((d) => ({ ...d, draft: {} }));
    setRestoredCount(0);
  }

  function discardNeverSaved() {
    writeDraft(draftKey, {});
    setData((d) => ({ ...d, draft: {} }));
  }

  const neverSaved = readOnly === "closed" ? draft : {};
  const neverSavedCount = countEntries(neverSaved);

  return (
    <section aria-labelledby={titleId} className="flex flex-col">
      <h2 id={titleId} className="sr-only">
        Scores
      </h2>

      <div className="flex flex-col gap-2.5 px-4 pb-4 sm:px-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="type-label">
            <span className="type-figure">{complete}</span> of <span className="type-figure">{students.length}</span> complete
          </p>
          <p className="type-caption text-muted-foreground">
            {[unfinished > 0 && `${unfinished} still missing a score`, toFix > 0 && `${toFix} to fix`].filter(Boolean).join(", ") ||
              (students.length > 0 && complete === students.length ? "Every score entered" : "")}
          </p>
        </div>
        <Progress value={(complete / Math.max(students.length, 1)) * 100} aria-label="Students complete" />
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4 empty:hidden sm:px-0">
        {readOnly && (
          <Alert role="status" variant={readOnly === "lostAccess" ? "destructive" : "default"} className="border-rule">
            {readOnly === "closed" ? <LockIcon /> : readOnly === "viewingAs" ? <EyeIcon /> : <UserXIcon />}
            <AlertTitle className="font-semibold">{READ_ONLY_TEXT[readOnly](termName)}</AlertTitle>
          </Alert>
        )}

        {neverSavedCount > 0 && (
          <Alert className="border-warning/30 bg-warning-wash">
            <HistoryIcon />
            <AlertTitle className="font-semibold text-warning">
              {neverSavedCount} {neverSavedCount === 1 ? "score" : "scores"} typed on this phone {neverSavedCount === 1 ? "was" : "were"} never saved before {termName}{" "}
              closed
            </AlertTitle>
            <AlertDescription className="text-foreground/80">
              <p>Pass them to the VoxLMS team, who can enter them for you.</p>
              <ul className="mt-2 flex flex-col gap-1">
                {Object.entries(neverSaved).flatMap(([studentId, row]) => {
                  const student = students.find((s) => s.id === studentId);
                  return Object.entries(row).map(([key, entry]) => (
                    <li key={`${studentId}:${key}`} className="flex flex-wrap gap-x-2">
                      <span>{student ? noticeName(student) : "A student no longer on this sheet"}</span>
                      <span className="text-muted-foreground">{columns.find((c) => c.key === key)?.label ?? key}</span>
                      <span className="font-bold type-figure">{entry.value}</span>
                    </li>
                  ));
                })}
              </ul>
              <Button variant="outline" size="sm" className="mt-3" onClick={discardNeverSaved}>
                Discard these scores
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {editable && restoredCount > 0 && (
          <Alert role="status" className="border-warning/30 bg-warning-wash">
            <HistoryIcon />
            <AlertTitle className="font-semibold">
              Unsaved scores for {restoredCount} {restoredCount === 1 ? "student" : "students"} were kept on this phone
            </AlertTitle>
            <AlertDescription className="text-foreground/80">They are back in the sheet. Save to keep them, or discard to go back to the saved scores.</AlertDescription>
            <AlertAction>
              <Button variant="ghost" size="sm" onClick={discardRestored}>
                Discard
              </Button>
            </AlertAction>
          </Alert>
        )}

        {editable && notices.length > 0 && (
          <Alert className="border-warning/30 bg-warning-wash">
            <RefreshCwIcon />
            <AlertTitle className="font-semibold">The sheet changed, so it was reloaded</AlertTitle>
            <AlertDescription className="text-foreground/80">
              {notices.map((notice) => (
                <p key={notice} className="mb-1!">
                  {notice}
                </p>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {editable && paste && (
          <Alert role={paste.tone === "error" ? "alert" : "status"} variant={paste.tone === "error" ? "destructive" : "default"} className="border-rule">
            <ClipboardPasteIcon />
            <AlertTitle className="font-semibold">{paste.text}</AlertTitle>
            <AlertAction>
              <Button variant="ghost" size="sm" onClick={() => setPaste(null)}>
                Close
              </Button>
            </AlertAction>
          </Alert>
        )}
      </div>

      {students.length === 0 ? (
        <p className="mx-4 rounded-xl border border-dashed border-input bg-card p-6 text-muted-foreground sm:mx-0">No students take this yet.</p>
      ) : (
        <div
          ref={sheetRef}
          style={{ "--parts": columns.length } as React.CSSProperties}
          data-wide={columns.length >= 4 ? "" : undefined}
          className="group/sheet ruled-sheet border-y border-rule sm:rounded-xl sm:border-x"
        >
          <SheetHeader columns={columns} />
          <ol>
            {rows.map(({ student, state, dirty, conflict }, rowIndex) => (
              <StudentRow
                key={student.id}
                number={rowIndex + 1}
                rowIndex={rowIndex}
                student={student}
                columns={columns}
                values={values[student.id]}
                draft={editable ? draft[student.id] : undefined}
                saved={saved[student.id]}
                state={state}
                dirty={dirty}
                conflict={conflict}
                readOnly={!editable}
                isLast={rowIndex === rows.length - 1}
                onChange={(key, raw) => setCell(student.id, key, raw)}
                onKeyDown={(event, col) => onKeyDown(event, rowIndex, col)}
                onPaste={(event, col) => onPaste(event, rowIndex, col)}
                onKeepMine={() => setData((d) => ({ ...d, draft: keepMine(d.draft, d.sheet.scores, student.id) }))}
                onUseSaved={() => setData((d) => ({ ...d, draft: takeSaved(d.draft, student.id) }))}
                onOpenHistory={onOpenHistory && (() => onOpenHistory(student))}
              />
            ))}
          </ol>
        </div>
      )}

      {editable && (
        <SaveBar
          changedCount={changedCount}
          conflictCount={conflicts.size}
          toFix={toFix}
          status={status}
          online={online}
          savedAt={savedAt}
          canRetry={retry !== null}
          onSave={save}
        />
      )}
    </section>
  );
}

/** What this device kept for the sheet, checked against the sheet as it opened (AC-5, AC-9, AC-13). */
function restoreDraft(draftKey: string, readOnly: ReadOnlyReason | null, opening: SheetSnapshot): { draft: Draft; restoredCount: number; notices: string[] } {
  // Viewing as can't type, so it never reads or makes a draft.
  if (readOnly === "viewingAs") return { draft: {}, restoredCount: 0, notices: [] };
  const stored = readDraft(draftKey);
  if (readOnly === "closed") {
    // Read only: list what was never saved, never merge it into the sheet.
    const unsaved: Draft = {};
    for (const [studentId, row] of Object.entries(stored)) {
      for (const [key, entry] of Object.entries(row)) {
        if (!same(entry.value, opening.scores[studentId]?.[key])) (unsaved[studentId] ??= {})[key] = entry;
      }
    }
    return { draft: unsaved, restoredCount: 0, notices: [] };
  }
  const { draft, dropped } = reconcile(stored, opening.scores, opening.students, opening.columns);
  return { draft, restoredCount: Object.keys(draft).length, notices: droppedNotices(dropped, [], opening.columns) };
}

/** Waits for a save, but no longer than the timeout; a request that breaks is "failed" or "updated". */
async function settle(request: Promise<SaveOutcome>): Promise<SaveOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SaveOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "failed" }), SAVE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    // Next answers "Server Action unavailable." when the app was deployed since the page loaded.
    const message = error instanceof Error ? error.message : "";
    return /server action/i.test(message) ? { kind: "updated" } : { kind: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

function droppedNotices(dropped: Dropped, named: SheetStudent[], columns: ScoreColumn[]): string[] {
  const notices = named.map((s) => `${noticeName(s)} is no longer in this subject, so their scores were not saved.`);
  const unnamed = dropped.studentIds.length;
  if (unnamed > 0) {
    notices.push(
      unnamed === 1
        ? "A student with scores kept on this phone is no longer in this subject, so their scores were not saved."
        : `${unnamed} students with scores kept on this phone are no longer in this subject, so their scores were not saved.`,
    );
  }
  for (const key of dropped.columnKeys) {
    const label = columns.find((c) => c.key === key)?.label ?? "A part";
    notices.push(`${label} is no longer part of the score split, so those scores were not saved.`);
  }
  return notices;
}

// The grid follows the number of parts (1 to 5). On a phone, four or five
// parts take the full row and the total wraps underneath (spec 0009).
const sheetGrid = cn(
  "grid gap-x-2 pr-3 md:gap-x-3 md:pr-4",
  "grid-cols-[var(--margin-x)_repeat(var(--parts),minmax(0,4rem))_minmax(4.5rem,1fr)]",
  "group-data-wide/sheet:grid-cols-[var(--margin-x)_repeat(var(--parts),minmax(0,1fr))]",
  "md:grid-cols-[var(--margin-x)_minmax(0,22rem)_repeat(var(--parts),4.5rem)_minmax(7.5rem,1fr)] md:group-data-wide/sheet:grid-cols-[var(--margin-x)_minmax(0,22rem)_repeat(var(--parts),4.5rem)_minmax(7.5rem,1fr)]",
);
/** The total column: its own row on a phone with four or five parts. */
const resultCell = "group-data-wide/sheet:col-[2/-1] md:group-data-wide/sheet:col-auto";
/** Lines under a row's fields. */
const underFields = "col-[2/-1] pl-1 md:col-[3/-1] md:pl-0";

function SheetHeader({ columns }: { columns: ScoreColumn[] }) {
  return (
    <div aria-hidden="true" className={cn(sheetGrid, "sticky top-0 z-10 items-end border-b border-rule bg-card/95 py-2.5 backdrop-blur-sm sm:rounded-t-xl")}>
      <span className="hidden pl-4 type-caption font-semibold text-muted-foreground md:col-start-2 md:block">Student</span>
      {columns.map((column, i) => (
        <span key={column.key} className={cn("flex min-w-0 flex-col items-center leading-tight", i === 0 && "col-start-2 md:col-start-3")}>
          <span className="max-w-full truncate type-caption font-semibold">{column.label}</span>
          <span className="type-caption type-figure text-muted-foreground">of {column.max}</span>
        </span>
      ))}
      <span className={cn("flex flex-col items-end leading-tight md:items-start md:pl-2", "group-data-wide/sheet:hidden md:group-data-wide/sheet:flex")}>
        <span className="type-caption font-semibold">Total</span>
        <span className="type-caption type-figure text-muted-foreground">of {columns.reduce((sum, column) => sum + column.max, 0)}</span>
      </span>
    </div>
  );
}

type StudentRowProps = {
  number: number;
  rowIndex: number;
  student: SheetStudent;
  columns: ScoreColumn[];
  values: Record<string, string> | undefined;
  draft: Draft[string] | undefined;
  saved: Record<string, string> | undefined;
  state: RowState;
  dirty: boolean;
  conflict: boolean;
  readOnly: boolean;
  isLast: boolean;
  onChange: (key: string, raw: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, col: number) => void;
  onPaste: (event: React.ClipboardEvent<HTMLInputElement>, col: number) => void;
  onKeepMine: () => void;
  onUseSaved: () => void;
  onOpenHistory?: () => void;
};

function StudentRow({
  number,
  rowIndex,
  student,
  columns,
  values,
  draft,
  saved,
  state,
  dirty,
  conflict,
  readOnly,
  isLast,
  onChange,
  onKeyDown,
  onPaste,
  onKeepMine,
  onUseSaved,
  onOpenHistory,
}: StudentRowProps) {
  const nameId = useId();
  const messageId = useId();
  const conflictId = useId();
  const cells = columns.map((column) => readCell(values?.[column.key], column));
  // Only typed values are circled; a saved score never blocks (AC-4).
  const problems = columns
    .map((column, i) => (draft?.[column.key] ? cellProblem(cells[i], column) : null))
    .filter((p): p is string => p !== null);
  const changedParts = columns.filter((column) => draft?.[column.key] && !same(draft[column.key].base, saved?.[column.key]));

  const name = (
    <>
      <span className="font-bold">{student.surname}</span> {student.otherNames}
    </>
  );

  return (
    <li
      role="group"
      aria-labelledby={nameId}
      aria-describedby={conflict ? conflictId : undefined}
      className={cn(
        sheetGrid,
        "relative items-center gap-y-2.5 border-b border-rule py-3 last:border-b-0 md:py-2.5",
        dirty && "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-warning-mark sm:last:before:rounded-bl-xl",
        conflict && "bg-warning-wash/70",
      )}
    >
      <span aria-hidden="true" className="row-span-2 self-start pt-0.5 pr-2.5 text-right type-caption type-figure text-muted-foreground md:row-span-1 md:self-center md:pt-0">
        {number}
      </span>

      <div className="col-[2/-1] flex min-w-0 items-baseline gap-x-2 pl-1 md:col-[2/3] md:flex-col md:gap-0 md:pl-4">
        {onOpenHistory ? (
          <button
            type="button"
            id={nameId}
            onClick={onOpenHistory}
            aria-haspopup="dialog"
            className="-my-2.5 min-w-0 truncate rounded-sm py-2.5 text-left underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring md:my-0 md:py-0"
          >
            {name}
            <span className="sr-only">, see score history</span>
          </button>
        ) : (
          <p id={nameId} className="min-w-0 truncate">
            {name}
          </p>
        )}
        {student.number && <span className="shrink-0 type-caption type-figure text-muted-foreground">{student.number}</span>}
      </div>

      {columns.map((column, col) => {
        const cell = cells[col];
        const typed = Boolean(draft?.[column.key]);
        const wrong = typed && (cell.kind === "over" || cell.kind === "bad");
        const clashing = changedParts.includes(column);
        return (
          <div key={column.key} className={cn("relative min-w-0", col === 0 && "col-start-2 md:col-start-3")}>
            <input
              data-cell={`${rowIndex}:${col}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              readOnly={readOnly}
              enterKeyHint={isLast && col === columns.length - 1 ? "done" : "next"}
              aria-label={`${column.label}, out of ${column.max}`}
              aria-invalid={wrong}
              aria-describedby={wrong ? messageId : undefined}
              placeholder="–"
              value={values?.[column.key] ?? ""}
              onChange={(event) => onChange(column.key, event.target.value)}
              onKeyDown={(event) => onKeyDown(event, col)}
              onPaste={(event) => onPaste(event, col)}
              onFocus={(event) => event.currentTarget.select()}
              className={cn(
                "relative h-12 w-full min-w-0 rounded-md border border-input bg-card px-0.5 text-center type-score transition-colors outline-none placeholder:font-normal placeholder:text-muted-foreground/60",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25",
                "aria-invalid:border-destructive/60 aria-invalid:text-destructive aria-invalid:focus-visible:ring-destructive/20",
                "read-only:border-rule read-only:bg-transparent",
                clashing && "border-warning-mark bg-warning-wash",
              )}
            />
            {wrong && <RedPenCircle />}
          </div>
        );
      })}

      <div className={resultCell}>
        <RowResult state={state} />
      </div>

      {problems.length > 0 && (
        <p id={messageId} className={cn(underFields, "flex items-start gap-1.5 type-caption font-semibold text-destructive animate-ink-in")}>
          <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {problems.join(" ")}
        </p>
      )}
      {state.kind === "partial" && <p className={cn(underFields, "type-caption text-muted-foreground")}>{joinLabels(state.missing)} not entered yet</p>}
      {conflict && (
        <div id={conflictId} className={cn(underFields, "flex flex-col gap-2 rounded-md border border-warning/30 bg-card p-2.5 sm:flex-row sm:items-center sm:justify-between")}>
          <p className="type-caption text-warning">
            <span className="font-semibold">Someone saved new scores meanwhile:</span>{" "}
            {changedParts.map((column) => `${column.label} ${saved?.[column.key] ?? "not entered"}`).join(", ")}. Yours are in the boxes.
          </p>
          <div className="flex shrink-0 gap-2">
            <Button data-conflict-choice variant="outline" size="sm" onClick={onKeepMine}>
              Keep mine
            </Button>
            <Button variant="ghost" size="sm" onClick={onUseSaved}>
              Use saved
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function RowResult({ state }: { state: RowState }) {
  if (state.kind !== "complete") {
    return (
      <span className="block text-right type-score text-muted-foreground/50 md:pl-2 md:text-left" aria-label="No total yet">
        —
      </span>
    );
  }
  return (
    <span className="flex items-center justify-end gap-2 md:justify-start md:pl-2">
      <span className="type-score">{formatScore(state.total)}</span>
      {state.band ? (
        <span
          title={state.band.remark}
          className="inline-flex h-6 min-w-8 items-center justify-center rounded-sm border border-foreground/25 px-1 text-[0.8125rem] font-bold"
        >
          {state.band.grade}
        </span>
      ) : (
        <span className="text-muted-foreground" aria-label="No grade scale set">
          –
        </span>
      )}
    </span>
  );
}

type SaveBarProps = {
  changedCount: number;
  conflictCount: number;
  toFix: number;
  status: Status;
  online: boolean;
  savedAt: string | null;
  canRetry: boolean;
  onSave: () => void;
};

function SaveBar({ changedCount, conflictCount, toFix, status, online, savedAt, canRetry, onSave }: SaveBarProps) {
  const clean = changedCount === 0 && !canRetry;
  const saving = status === "saving";
  let tone: "quiet" | "warning" | "error" | "success" = "quiet";
  let icon: React.ReactNode = null;
  let message: React.ReactNode;
  let action: React.ReactNode = null;
  const alertIcon = <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />;

  if (saving) {
    message = "Saving scores…";
  } else if (!online && !clean) {
    tone = "warning";
    icon = <CloudOffIcon aria-hidden="true" className="size-4 shrink-0" />;
    message = "You are offline. Your scores are kept on this phone until you can save.";
  } else if (status === "updated") {
    tone = "error";
    icon = alertIcon;
    message = "VoxLMS was updated. Reload the page; your scores are kept on this phone.";
    action = <ReloadButton />;
  } else if (status === "signedOut") {
    tone = "error";
    icon = alertIcon;
    message = "You were signed out. Sign in again; your scores are kept on this phone.";
    action = (
      <Button size="lg" nativeButton={false} render={<Link href="/login" />} className="shrink-0">
        Sign in
      </Button>
    );
  } else if (status === "invalid") {
    tone = "error";
    icon = alertIcon;
    message = "Something in this save didn't match the sheet. Reload the page; your scores are kept on this phone.";
    action = <ReloadButton />;
  } else if (status === "failed") {
    tone = "error";
    icon = alertIcon;
    message = "Couldn't save. Your scores are kept on this phone. Try again.";
  } else if (conflictCount > 0) {
    tone = "warning";
    message = `Someone else saved scores for ${conflictCount} ${conflictCount === 1 ? "student" : "students"} first. Choose Keep mine or Use saved to save.`;
  } else if (toFix > 0) {
    tone = "error";
    icon = alertIcon;
    message = `${toFix} ${toFix === 1 ? "score needs" : "scores need"} fixing before you can save.`;
  } else if (changedCount > 0) {
    tone = "warning";
    message = `${changedCount} ${changedCount === 1 ? "student" : "students"} changed, not saved yet`;
  } else if (savedAt) {
    tone = "success";
    icon = <CircleCheckIcon aria-hidden="true" className="size-4 shrink-0" />;
    message = <SavedAt iso={savedAt} />;
  } else {
    message = "No scores entered yet";
  }

  return (
    <div className="sticky bottom-0 z-20 mt-4 border-t border-rule bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:rounded-t-xl sm:border-x sm:bg-card/95 sm:px-4">
      <div className="flex items-center gap-3">
        <p
          aria-live="polite"
          className={cn(
            "flex min-w-0 flex-1 items-start gap-2 type-caption sm:items-center sm:text-[0.9375rem]",
            tone === "quiet" && "text-muted-foreground",
            tone === "warning" && "text-warning",
            tone === "error" && "font-semibold text-destructive",
            tone === "success" && "text-success",
          )}
        >
          {tone === "warning" && !icon && <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-warning sm:mt-0" />}
          {icon && <span className="mt-px sm:mt-0">{icon}</span>}
          <span>{message}</span>
        </p>
        {action ?? (
          <Button size="lg" onClick={onSave} disabled={saving || clean || !online || conflictCount > 0} className="shrink-0">
            {saving && <Spinner data-icon="inline-start" />}
            {saving ? "Saving" : status === "failed" ? "Try again" : "Save scores"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReloadButton() {
  return (
    <Button size="lg" onClick={() => window.location.reload()} className="shrink-0">
      Reload page
    </Button>
  );
}

/** "Saved at 3:14 pm" today, or "Saved 12 Oct at 3:14 pm" on an earlier day, in Lagos time. */
function SavedAt({ iso }: { iso: string }) {
  const date = new Date(iso);
  const today = lagosDay.format(new Date()) === lagosDay.format(date);
  return (
    <>
      Saved {today ? "" : `${lagosDay.format(date)} `}at{" "}
      <time dateTime={iso} suppressHydrationWarning>
        {lagosTime.format(date)}
      </time>
    </>
  );
}

function joinLabels(columns: ScoreColumn[]) {
  const labels = columns.map((column) => column.label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
