"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon, CircleAlertIcon, EyeIcon, HistoryIcon, LockIcon, RefreshCwIcon, UserXIcon } from "lucide-react";

import { RedPenCircle } from "@/components/red-pen";
import { countEntries, type Draft, draftOps, readDraft, shown, writeDraft } from "@/components/score-sheet/draft";
import { LagosTime, SaveBar, type SaveNoun, type SaveStatus, settle, useOnline } from "@/components/score-sheet/saving";
import { noticeName } from "@/components/score-sheet/score-sheet";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatHundredths, ordinal } from "@/lib/results";
import { addPick, QUICK_PICKS, REMARK_COUNTER_FROM, REMARK_MAX, remarkLength, tidyRemark } from "@/lib/remarks";
import { cn } from "@/lib/utils";

import type { ReadOnlyReason, RemarkChange, RemarkColumn, RemarksSaveOutcome, RemarksSaveRequest, RemarksSnapshot, RemarksStudent } from "./types";

// The Remarks sheet (spec 0011): one class's teacher's and head's comments for
// a term, saved exactly like the score sheet (spec 0009, AC-5): only changed
// comments, each with the saved text it replaced, kept on this device until
// the server confirms them.

/** Two comments compare equal when their tidy text does; empty is none. */
const ops = draftOps((value) => tidyRemark(value) ?? "");
const COLUMNS: { key: RemarkColumn }[] = [{ key: "teacher" }, { key: "head" }];
const NOUN: SaveNoun = { one: "comment", many: "comments", empty: "No comments written yet" };

type SheetState = { sheet: RemarksSnapshot; draft: Draft };

type RemarksSheetProps = {
  /** Keys the draft kept on this device: `remark-draft:{userId}:{termId}:{classId}`. */
  draftKey: string;
  /** "First Term", for the closed term messages. */
  termName: string;
  /** Whoever signs the class's section: "Principal", "Head teacher" (spec 0007). */
  signerTitle: string;
  sheet: RemarksSnapshot;
  /** Set when the sheet opens read only: an earlier term, or viewing as someone. */
  readOnly?: ReadOnlyReason | null;
  /** Sends one frozen change set. Throwing counts as a failed request. */
  onSave: (request: RemarksSaveRequest) => Promise<RemarksSaveOutcome>;
};

const READ_ONLY_TEXT: Record<ReadOnlyReason, (termName: string) => string> = {
  closed: (termName) => `${termName} is closed. Remarks can only be changed in the current term.`,
  viewingAs: () => "You are viewing as this person. Nothing can be saved.",
  lostAccess: () => "You no longer have this class. Your typed comments are kept on this phone.",
};

/** The head's comment as a title for labels: "Principal's comment". */
export const headLabel = (signerTitle: string) => `${signerTitle}’s comment`;

const toDraftChanges = (changes: RemarkChange[]) => changes.map((c) => ({ studentId: c.studentId, componentKey: c.field, expected: c.expected, value: c.value }));

function latestChange(sheet: RemarksSnapshot): string | null {
  const times = Object.values(sheet.lastChange).map((c) => c.at);
  return times.length === 0 ? null : times.reduce((a, b) => (a > b ? a : b));
}

export function RemarksSheet({ draftKey, termName, signerTitle, sheet: initialSheet, readOnly: initialReadOnly = null, onSave }: RemarksSheetProps) {
  const [data, setData] = useState<SheetState>({ sheet: initialSheet, draft: {} });
  const [readOnly, setReadOnly] = useState<ReadOnlyReason | null>(initialReadOnly);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(latestChange(initialSheet));
  const [restoredCount, setRestoredCount] = useState(0);
  const [notices, setNotices] = useState<string[]>([]);
  /** Students whose head's comment box is open with nothing typed yet (Type over on a waiting comment). */
  const [typingHead, setTypingHead] = useState<Set<string>>(new Set());
  /** The one row whose quick picks are open. */
  const [picksFor, setPicksFor] = useState<string | null>(null);
  const online = useOnline();
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  /** The frozen change set of the last Save tap, resent as is until it lands or is refused (AC-5). */
  const [retry, setRetry] = useState<RemarksSaveRequest | null>(null);
  const seqRef = useRef(0);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  const { sheet, draft } = data;
  const { students, saved } = sheet;
  const editable = readOnly === null;
  const live = editable ? draft : {};

  // Bring back anything typed on this device but never confirmed, checked against the fresh sheet.
  useEffect(() => {
    const restored = restoreDraft(draftKey, initialReadOnly, dataRef.current.sheet);
    setData((d) => ({ ...d, draft: restored.draft }));
    setRestoredCount(restored.restoredCount);
    setNotices(restored.notices);
    setLoaded(true);
  }, [draftKey, initialReadOnly]);

  // Keep the draft in step with every keystroke until the server confirms it.
  useEffect(() => {
    if (loaded && editable) writeDraft(draftKey, draft);
  }, [draft, loaded, editable, draftKey]);

  const text = (studentId: string, column: RemarkColumn) => shown(live, saved, studentId, column);
  const conflicts = editable ? ops.conflictedStudents(draft, saved) : new Set<string>();
  const withTeacher = students.filter((s) => tidyRemark(text(s.id, "teacher"))).length;
  const waiting = students.filter((s) => !tidyRemark(text(s.id, "head")) && sheet.automatic[s.id] === null).length;
  // Only typed comments block a save; a saved one never does.
  const toFix = editable ? Object.values(draft).reduce((n, row) => n + Object.values(row).filter((entry) => remarkLength(entry.value) > REMARK_MAX).length, 0) : 0;
  const changedCount = editable ? Object.keys(draft).length : 0;

  function setText(studentId: string, column: RemarkColumn, raw: string) {
    if (!editable) return;
    if (status === "saved") setStatus("idle");
    setData((d) => ({ ...d, draft: ops.typeValue(d.draft, d.sheet.saved, studentId, column, raw) }));
  }

  /** On leaving a box the text is tidied (AC-3); an emptied head's box closes back to automatic. */
  function tidyBox(studentId: string, column: RemarkColumn) {
    const current = text(studentId, column);
    const tidy = tidyRemark(current) ?? "";
    if (tidy !== current) setText(studentId, column, tidy);
    if (column === "head" && tidy === "") closeHead(studentId);
  }

  function closeHead(studentId: string) {
    setTypingHead((open) => {
      if (!open.has(studentId)) return open;
      const next = new Set(open);
      next.delete(studentId);
      return next;
    });
  }

  function typeOver(studentId: string) {
    setTypingHead((open) => new Set(open).add(studentId));
    if (!tidyRemark(text(studentId, "head"))) setText(studentId, "head", sheet.automatic[studentId] ?? "");
    requestAnimationFrame(() => {
      const box = sheetRef.current?.querySelector<HTMLTextAreaElement>(`[data-head="${studentId}"]`);
      box?.focus();
      box?.setSelectionRange(box.value.length, box.value.length);
    });
  }

  function backToAutomatic(studentId: string) {
    closeHead(studentId);
    setText(studentId, "head", "");
  }

  async function save() {
    if (!editable || status === "saving") return;
    if (toFix > 0) {
      sheetRef.current?.querySelector<HTMLTextAreaElement>("[aria-invalid=true]")?.focus();
      return;
    }
    if (conflicts.size > 0) {
      sheetRef.current?.querySelector<HTMLButtonElement>("[data-conflict-choice]")?.focus();
      return;
    }
    const request = retry ?? {
      saveId: crypto.randomUUID(),
      changes: ops.toChanges(draft).map((c) => ({ studentId: c.studentId, field: c.componentKey as RemarkColumn, expected: c.expected, value: c.value })),
    };
    if (request.changes.length === 0) return;
    setRetry(request);
    const seq = ++seqRef.current;
    setStatus("saving");
    const outcome = await settle(onSave(request));
    if (seq !== seqRef.current) return; // a newer attempt owns the sheet now
    handle(outcome, request);
  }

  function handle(outcome: RemarksSaveOutcome, request: RemarksSaveRequest) {
    const current = dataRef.current;
    switch (outcome.kind) {
      case "saved": {
        setRetry(null);
        const applied = ops.applySaved(current.draft, current.sheet.saved, toDraftChanges(request.changes));
        // The fresh sheet brings the last change lines and any automatic comment that moved meanwhile.
        if (outcome.sheet) {
          const { draft: next } = ops.reconcile(applied.draft, outcome.sheet.saved, outcome.sheet.students, COLUMNS);
          setData({ sheet: outcome.sheet, draft: next });
        } else {
          setData({ sheet: { ...current.sheet, saved: applied.saved }, draft: applied.draft });
        }
        setSavedAt(outcome.updatedAt);
        setStatus("saved");
        setRestoredCount(0);
        setNotices([]);
        return;
      }
      case "conflict": {
        // Nothing was written. Rows typed over a comment someone changed become conflict rows (AC-6).
        setRetry(null);
        const { draft: next } = ops.reconcile(current.draft, outcome.sheet.saved, outcome.sheet.students, COLUMNS);
        setData({ sheet: outcome.sheet, draft: next });
        setStatus("idle");
        return;
      }
      case "stale": {
        // A student left the class: reload, name them, keep everything else as unsaved (AC-8).
        setRetry(null);
        const { draft: next, dropped } = ops.reconcile(current.draft, outcome.sheet.saved, outcome.sheet.students, COLUMNS);
        const removed = [...new Set([...outcome.removedStudentIds, ...dropped.studentIds])];
        const named = removed.map((id) => current.sheet.students.find((s) => s.id === id)).filter((s): s is RemarksStudent => Boolean(s));
        setData({ sheet: outcome.sheet, draft: next });
        setNotices([...droppedNotices(removed.length - named.length, named), "Everything else you typed is still here. Save once more to finish."]);
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
    setTypingHead(new Set());
    setRestoredCount(0);
  }

  function discardNeverSaved() {
    writeDraft(draftKey, {});
    setData((d) => ({ ...d, draft: {} }));
  }

  const neverSaved = readOnly === "closed" ? draft : {};
  const neverSavedCount = countEntries(neverSaved);
  const columnName = (column: string) => (column === "head" ? headLabel(signerTitle) : "Teacher's comment");

  return (
    <section aria-labelledby={titleId} className="flex flex-col">
      <h2 id={titleId} className="sr-only">
        Comments
      </h2>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-4 sm:px-0">
        <p className="type-label">
          <span className="type-figure">{withTeacher}</span> of <span className="type-figure">{students.length}</span> have a teacher’s comment
        </p>
        <p className="type-caption text-muted-foreground">
          {[
            waiting > 0 && `${waiting} ${signerTitle.toLowerCase()}’s ${waiting === 1 ? "comment waits" : "comments wait"} for all scores`,
            toFix > 0 && `${toFix} to fix`,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
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
              {neverSavedCount} {neverSavedCount === 1 ? "comment" : "comments"} typed on this phone {neverSavedCount === 1 ? "was" : "were"} never saved before {termName} closed
            </AlertTitle>
            <AlertDescription className="text-foreground/80">
              <p>Pass them to the VoxLMS team, who can enter them for you.</p>
              <ul className="mt-2 flex flex-col gap-2">
                {Object.entries(neverSaved).flatMap(([studentId, row]) => {
                  const student = students.find((s) => s.id === studentId);
                  return Object.entries(row).map(([column, entry]) => (
                    <li key={`${studentId}:${column}`} className="flex flex-col">
                      <span>
                        <span className="font-semibold">{student ? noticeName(student) : "A student no longer on this sheet"}</span>
                        <span className="text-muted-foreground">, {columnName(column).toLowerCase()}</span>
                      </span>
                      <span>{tidyRemark(entry.value) ?? "Back to automatic"}</span>
                    </li>
                  ));
                })}
              </ul>
              <Button variant="outline" className="mt-3" onClick={discardNeverSaved}>
                Discard these comments
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {editable && restoredCount > 0 && (
          <Alert role="status" className="border-warning/30 bg-warning-wash">
            <HistoryIcon />
            <AlertTitle className="font-semibold">
              Unsaved comments for {restoredCount} {restoredCount === 1 ? "student" : "students"} were kept on this phone
            </AlertTitle>
            <AlertDescription className="text-foreground/80">They are back in the sheet. Save to keep them, or discard to go back to the saved comments.</AlertDescription>
            <AlertAction>
              <Button variant="ghost" onClick={discardRestored}>
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
      </div>

      {students.length === 0 ? (
        <p className="mx-4 rounded-xl border border-dashed border-input bg-card p-6 text-muted-foreground sm:mx-0">No students in this class this term.</p>
      ) : (
        <div ref={sheetRef} className="ruled-sheet border-y border-rule sm:rounded-xl sm:border-x">
          <div aria-hidden="true" className={cn(rowGrid, "sticky top-0 z-10 hidden border-b border-rule bg-card/95 py-2.5 backdrop-blur-sm md:grid sm:rounded-t-xl")}>
            <span />
            <span className="type-caption font-semibold text-muted-foreground">Student</span>
            <span className="type-caption font-semibold text-muted-foreground">Teacher’s comment</span>
            <span className="type-caption font-semibold text-muted-foreground">{headLabel(signerTitle)}</span>
          </div>
          <ol>
            {students.map((student, i) => (
              <StudentRow
                key={student.id}
                number={i + 1}
                student={student}
                signerTitle={signerTitle}
                teacher={text(student.id, "teacher")}
                head={text(student.id, "head")}
                automatic={sheet.automatic[student.id] ?? null}
                draft={live[student.id]}
                saved={saved[student.id]}
                lastChange={sheet.lastChange[student.id] ?? null}
                headOpen={typingHead.has(student.id) || Boolean(tidyRemark(text(student.id, "head")))}
                picksOpen={picksFor === student.id}
                conflict={conflicts.has(student.id)}
                readOnly={!editable}
                onText={(column, raw) => setText(student.id, column, raw)}
                onBlur={(column) => tidyBox(student.id, column)}
                onPick={(pick) => setText(student.id, "teacher", addPick(text(student.id, "teacher"), pick))}
                onTogglePicks={() => setPicksFor((open) => (open === student.id ? null : student.id))}
                onTypeOver={() => typeOver(student.id)}
                onUseAutomatic={() => backToAutomatic(student.id)}
                onKeepMine={() => setData((d) => ({ ...d, draft: ops.keepMine(d.draft, d.sheet.saved, student.id) }))}
                onUseSaved={() => {
                  closeHead(student.id);
                  setData((d) => {
                    const next = { ...d.draft };
                    delete next[student.id];
                    return { ...d, draft: next };
                  });
                }}
              />
            ))}
          </ol>
        </div>
      )}

      {editable && (
        <SaveBar
          noun={NOUN}
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

/** What this device kept for the sheet, checked against the sheet as it opened (AC-5, AC-7). */
function restoreDraft(draftKey: string, readOnly: ReadOnlyReason | null, opening: RemarksSnapshot): { draft: Draft; restoredCount: number; notices: string[] } {
  // Viewing as can't type, so it never reads or makes a draft.
  if (readOnly === "viewingAs") return { draft: {}, restoredCount: 0, notices: [] };
  const stored = readDraft(draftKey);
  if (readOnly === "closed") {
    // Read only: list what was never saved, never merge it into the sheet.
    const unsaved: Draft = {};
    for (const [studentId, row] of Object.entries(stored)) {
      for (const [column, entry] of Object.entries(row)) {
        if (!ops.same(entry.value, opening.saved[studentId]?.[column])) (unsaved[studentId] ??= {})[column] = entry;
      }
    }
    return { draft: unsaved, restoredCount: 0, notices: [] };
  }
  const { draft, dropped } = ops.reconcile(stored, opening.saved, opening.students, COLUMNS);
  return { draft, restoredCount: Object.keys(draft).length, notices: droppedNotices(dropped.studentIds.length, []) };
}

function droppedNotices(unnamed: number, named: RemarksStudent[]): string[] {
  const notices = named.map((s) => `${noticeName(s)} is no longer in this class, so their comments were not saved.`);
  if (unnamed > 0) {
    notices.push(
      unnamed === 1
        ? "A student with comments kept on this phone is no longer in this class, so their comments were not saved."
        : `${unnamed} students with comments kept on this phone are no longer in this class, so their comments were not saved.`,
    );
  }
  return notices;
}

// A phone stacks each student (name and figures, then the two comments); from
// md the comments sit side by side under one header.
const rowGrid = "grid grid-cols-[var(--margin-x)_minmax(0,1fr)] gap-x-3 pr-4 md:grid-cols-[var(--margin-x)_12rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-x-5";
/** Everything after the student column. */
const afterStudent = "col-start-2 md:col-start-3";

type StudentRowProps = {
  number: number;
  student: RemarksStudent;
  signerTitle: string;
  teacher: string;
  head: string;
  automatic: string | null;
  draft: Draft[string] | undefined;
  saved: Record<string, string> | undefined;
  lastChange: { by: string; at: string } | null;
  headOpen: boolean;
  picksOpen: boolean;
  conflict: boolean;
  readOnly: boolean;
  onText: (column: RemarkColumn, raw: string) => void;
  onBlur: (column: RemarkColumn) => void;
  onPick: (pick: string) => void;
  onTogglePicks: () => void;
  onTypeOver: () => void;
  onUseAutomatic: () => void;
  onKeepMine: () => void;
  onUseSaved: () => void;
};

function StudentRow({
  number,
  student,
  signerTitle,
  teacher,
  head,
  automatic,
  draft,
  saved,
  lastChange,
  headOpen,
  picksOpen,
  conflict,
  readOnly,
  onText,
  onBlur,
  onPick,
  onTogglePicks,
  onTypeOver,
  onUseAutomatic,
  onKeepMine,
  onUseSaved,
}: StudentRowProps) {
  const nameId = useId();
  const conflictId = useId();
  const dirty = Boolean(draft);
  const clashing = COLUMNS.filter((c) => draft?.[c.key] && !ops.same(draft[c.key].base, saved?.[c.key])).map((c) => c.key);

  return (
    <li
      role="group"
      aria-labelledby={nameId}
      aria-describedby={conflict ? conflictId : undefined}
      className={cn(
        rowGrid,
        "relative gap-y-3 border-b border-rule py-4 last:border-b-0 md:items-start",
        dirty && "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-warning-mark sm:last:before:rounded-bl-xl",
        conflict && "bg-warning-wash/70",
      )}
    >
      <span aria-hidden="true" className="pt-0.5 pr-2.5 text-right type-caption type-figure text-muted-foreground">
        {number}
      </span>

      <div className="flex min-w-0 items-start justify-between gap-3 md:flex-col md:justify-start md:gap-1">
        <div className="flex min-w-0 flex-col">
          <p id={nameId} className="min-w-0">
            <span className="font-bold">{student.surname}</span> {student.otherNames}
          </p>
          {student.number && <span className="type-caption type-figure text-muted-foreground">{student.number}</span>}
        </div>
        <Figures student={student} />
      </div>

      <div className={cn(afterStudent, "flex min-w-0 flex-col gap-2 md:col-start-3")}>
        <RemarkBox
          id={`teacher-${student.id}`}
          label="Teacher’s comment"
          value={teacher}
          typed={Boolean(draft?.teacher)}
          clashing={clashing.includes("teacher")}
          readOnly={readOnly}
          emptyText="No comment yet"
          onChange={(raw) => onText("teacher", raw)}
          onBlur={() => onBlur("teacher")}
        />
        {!readOnly && (
          <div className="flex flex-col gap-2">
            <Button variant="ghost" aria-expanded={picksOpen} onClick={onTogglePicks} className="-ml-3 self-start text-muted-foreground">
              Quick picks
              <ChevronDownIcon data-icon="inline-end" className={cn("transition-transform", picksOpen && "rotate-180")} />
            </Button>
            {picksOpen && (
              <ul aria-label="Quick picks" className="flex flex-wrap gap-2">
                {QUICK_PICKS.map((pick) => (
                  <li key={pick}>
                    <Button variant="outline" onClick={() => onPick(pick)} className="h-auto min-h-11 justify-start py-2 text-left whitespace-normal">
                      {pick}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="col-start-2 flex min-w-0 flex-col gap-2 md:col-start-4">
        {headOpen && !readOnly ? (
          <>
            <RemarkBox
              id={`head-${student.id}`}
              dataHead={student.id}
              label={headLabel(signerTitle)}
              tag="Typed"
              value={head}
              typed={Boolean(draft?.head)}
              clashing={clashing.includes("head")}
              readOnly={false}
              emptyText=""
              onChange={(raw) => onText("head", raw)}
              onBlur={() => onBlur("head")}
            />
            <Button variant="ghost" onClick={onUseAutomatic} className="-ml-3 self-start text-muted-foreground">
              Use automatic
            </Button>
          </>
        ) : (
          <HeadShown
            label={headLabel(signerTitle)}
            typed={tidyRemark(head)}
            automatic={automatic}
            pendingAutomatic={Boolean(draft?.head)}
            clashing={clashing.includes("head")}
            readOnly={readOnly}
            onTypeOver={onTypeOver}
          />
        )}
      </div>

      {lastChange && (
        <p className={cn(afterStudent, "type-caption text-muted-foreground md:col-end-[-1]")}>
          Last changed by {lastChange.by}, <LagosTime iso={lastChange.at} />
        </p>
      )}

      {conflict && (
        <div
          id={conflictId}
          className={cn(afterStudent, "flex flex-col gap-2 rounded-md border border-warning/30 bg-card p-3 md:col-end-[-1] md:flex-row md:items-center md:justify-between")}
        >
          <div className="flex flex-col gap-1 type-caption text-warning">
            <p className="font-semibold">Someone saved new comments meanwhile. Yours are shown above.</p>
            {clashing.map((column) => (
              <p key={column}>
                {column === "head" ? headLabel(signerTitle) : "Teacher’s comment"}: {saved?.[column] ? `“${saved[column]}”` : column === "head" ? "back to automatic" : "cleared"}
              </p>
            ))}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button data-conflict-choice variant="outline" onClick={onKeepMine}>
              Keep mine
            </Button>
            <Button variant="ghost" onClick={onUseSaved}>
              Use saved
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function Figures({ student }: { student: RemarksStudent }) {
  if (student.average === null) return <span className="shrink-0 type-caption text-muted-foreground">Incomplete</span>;
  return (
    <span className="flex shrink-0 flex-col items-end md:flex-row md:items-baseline md:gap-2">
      <span className="type-score" aria-label={`Average ${formatHundredths(student.average)}`}>
        {formatHundredths(student.average)}
      </span>
      {student.position !== null && <span className="type-caption type-figure text-muted-foreground">{ordinal(student.position)}</span>}
    </span>
  );
}

type RemarkBoxProps = {
  id: string;
  dataHead?: string;
  label: string;
  tag?: string;
  value: string;
  /** Typed on this device and not saved yet. */
  typed: boolean;
  clashing: boolean;
  readOnly: boolean;
  emptyText: string;
  onChange: (raw: string) => void;
  onBlur: () => void;
};

/** A comment box with the tidy length rule: a counter from 160, circled in red over 200 (AC-3). */
function RemarkBox({ id, dataHead, label, tag, value, typed, clashing, readOnly, emptyText, onChange, onBlur }: RemarkBoxProps) {
  const messageId = useId();
  const length = remarkLength(value);
  const over = typed && length > REMARK_MAX;
  const labelRow = (
    <span className="flex items-center gap-2">
      <label htmlFor={id} className="type-caption font-semibold text-muted-foreground md:sr-only">
        {label}
      </label>
      {tag && <Tag>{tag}</Tag>}
    </span>
  );

  if (readOnly) {
    return (
      <div className="flex flex-col gap-1">
        <span className="type-caption font-semibold text-muted-foreground md:sr-only">{label}</span>
        <p className={cn("min-h-11 py-1", !value && "text-muted-foreground")}>{tidyRemark(value) ?? emptyText}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {labelRow}
      <div className="relative">
        <Textarea
          id={id}
          data-head={dataHead}
          value={value}
          rows={2}
          aria-invalid={over || undefined}
          aria-describedby={length >= REMARK_COUNTER_FROM ? messageId : undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className={cn("min-h-12 resize-none md:text-base", clashing && "border-warning-mark bg-warning-wash", over && "focus-visible:ring-destructive/20")}
        />
        {over && <RedPenCircle />}
      </div>
      {over ? (
        <p id={messageId} className="flex items-start gap-1.5 type-caption font-semibold text-destructive animate-ink-in">
          <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>
            Comments fit in {REMARK_MAX} characters. This one has <span className="type-figure">{length}</span>.
          </span>
        </p>
      ) : (
        length >= REMARK_COUNTER_FROM && (
          <p id={messageId} className="type-caption type-figure text-muted-foreground">
            {length} of {REMARK_MAX}
          </p>
        )
      )}
    </div>
  );
}

type HeadShownProps = {
  label: string;
  typed: string | null;
  automatic: string | null;
  /** Use automatic was tapped on a saved typed comment, not saved yet. */
  pendingAutomatic: boolean;
  clashing: boolean;
  readOnly: boolean;
  onTypeOver: () => void;
};

/** The head's comment when no box is open: typed (read only sheets), automatic, or waiting (AC-4). */
function HeadShown({ label, typed, automatic, pendingAutomatic, clashing, readOnly, onTypeOver }: HeadShownProps) {
  const state = typed ? "typed" : automatic ? "automatic" : "waiting";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2">
        <span className="type-caption font-semibold text-muted-foreground md:sr-only">{label}</span>
        {state !== "waiting" && <Tag>{state === "typed" ? "Typed" : pendingAutomatic ? "Automatic, not saved yet" : "Automatic"}</Tag>}
      </span>
      {state === "waiting" ? (
        <p className={cn("flex min-h-12 items-center rounded-lg border border-dashed border-input px-3 py-2.5 text-muted-foreground", clashing && "border-warning-mark bg-warning-wash")}>
          Waits for all scores
        </p>
      ) : (
        <p className={cn("min-h-12 rounded-lg bg-background/70 px-3 py-2.5", clashing && "bg-warning-wash")}>{typed ?? automatic}</p>
      )}
      {!readOnly && (
        <Button variant="ghost" onClick={onTypeOver} className="-ml-3 self-start text-muted-foreground">
          Type over
        </Button>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-rule bg-card px-2 py-0.5 type-caption leading-none text-muted-foreground">{children}</span>;
}
