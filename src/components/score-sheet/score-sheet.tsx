"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { CircleAlertIcon, CircleCheckIcon, CloudOffIcon, HistoryIcon } from "lucide-react";

import { RedPenCircle } from "@/components/red-pen";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import {
  SCORE_PATTERN,
  formatScore,
  readCell,
  readRow,
  type GradeBand,
  type RowState,
  type ScoreColumn,
} from "./score-math";

export type SheetStudent = {
  id: string;
  surname: string;
  otherNames: string;
};

/** studentId → column key → the score exactly as typed. */
export type SheetScores = Record<string, Record<string, string>>;

type ScoreSheetProps = {
  /** Unique per class + subject + term; keys the draft kept on this device. */
  sheetId: string;
  students: SheetStudent[];
  columns: ScoreColumn[];
  scale: GradeBand[];
  initialScores: SheetScores;
  lastSavedAt?: string;
  /** Persists only the rows that changed. Throw to report a failed save. */
  onSave: (changes: SheetScores) => Promise<void>;
};

const lagosTime = new Intl.DateTimeFormat("en-NG", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Africa/Lagos",
});

export function ScoreSheet({
  sheetId,
  students,
  columns,
  scale,
  initialScores,
  lastSavedAt,
  onSave,
}: ScoreSheetProps) {
  const draftKey = `score-draft:${sheetId}`;
  const [saved, setSaved] = useState<SheetScores>(initialScores);
  const [values, setValues] = useState<SheetScores>(initialScores);
  const [savedAt, setSavedAt] = useState(lastSavedAt);
  const [restoredCount, setRestoredCount] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const online = useOnline();
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Bring back anything typed on this device but never confirmed by the server.
  useEffect(() => {
    const draft = readDraft(draftKey);
    if (!draft) return;
    const count = Object.keys(draft).length;
    if (count === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
    setValues((current) => mergeScores(current, draft));
    setRestoredCount(count);
  }, [draftKey]);

  const changes = useMemo(() => diffScores(values, saved), [values, saved]);
  const changedIds = Object.keys(changes);

  // Keep the draft in step with every keystroke until the server confirms it.
  useEffect(() => {
    try {
      if (changedIds.length === 0) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey, JSON.stringify(changes));
    } catch {
      // Private mode or full storage: typing still works, only the safety net is lost.
    }
  }, [changes, changedIds.length, draftKey]);

  const rows = students.map((student) => ({
    student,
    state: readRow(values[student.id], columns, scale),
    dirty: student.id in changes,
  }));
  const complete = rows.filter((row) => row.state.kind === "complete").length;
  const toFix = rows.filter((row) => row.state.kind === "invalid").length;
  const unfinished = rows.filter((row) => row.state.kind === "partial").length;

  function setCell(studentId: string, key: string, raw: string) {
    if (!SCORE_PATTERN.test(raw)) return;
    setSaveFailed(false);
    setValues((current) => ({
      ...current,
      [studentId]: { ...current[studentId], [key]: raw },
    }));
  }

  function focusCell(row: number, col: number) {
    const input = sheetRef.current?.querySelector<HTMLInputElement>(
      `[data-cell="${row}:${col}"]`,
    );
    input?.focus();
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

  function save() {
    if (toFix > 0) {
      sheetRef.current?.querySelector<HTMLInputElement>("[aria-invalid=true]")?.focus();
      return;
    }
    const pending = changes;
    startSaving(async () => {
      try {
        await onSave(pending);
        setSaved((current) => mergeScores(current, pending));
        setSavedAt(new Date().toISOString());
        setRestoredCount(0);
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      }
    });
  }

  function discardDraft() {
    setValues(saved);
    setRestoredCount(0);
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col">
      <h2 id={titleId} className="sr-only">
        Scores
      </h2>

      <div className="flex flex-col gap-2.5 px-4 pb-4 sm:px-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="type-label">
            <span className="type-figure">{complete}</span> of{" "}
            <span className="type-figure">{students.length}</span> students complete
          </p>
          <p className="type-caption text-muted-foreground">
            {[
              unfinished > 0 && `${unfinished} still missing a score`,
              toFix > 0 && `${toFix} to fix`,
            ]
              .filter(Boolean)
              .join(", ") || "Every score entered"}
          </p>
        </div>
        <Progress
          value={(complete / Math.max(students.length, 1)) * 100}
          aria-label="Students complete"
        />
      </div>

      {restoredCount > 0 && (
        <Alert className="mx-4 mb-4 w-auto border-warning/30 bg-warning-wash sm:mx-0">
          <HistoryIcon />
          <AlertTitle>
            Unsaved scores for {restoredCount} {restoredCount === 1 ? "student" : "students"}{" "}
            were kept on this device
          </AlertTitle>
          <AlertDescription className="text-foreground/80">
            They are back in the sheet. Save to keep them, or discard to go back to the last
            saved scores.
          </AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="sm" onClick={discardDraft}>
              Discard
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div
        ref={sheetRef}
        className="ruled-sheet border-y border-rule sm:rounded-xl sm:border-x"
      >
        <SheetHeader columns={columns} />
        <ol>
          {rows.map(({ student, state, dirty }, rowIndex) => (
            <StudentRow
              key={student.id}
              number={rowIndex + 1}
              student={student}
              columns={columns}
              values={values[student.id]}
              state={state}
              dirty={dirty}
              isLast={rowIndex === rows.length - 1}
              onChange={(key, raw) => setCell(student.id, key, raw)}
              onKeyDown={(event, col) => onKeyDown(event, rowIndex, col)}
              rowIndex={rowIndex}
            />
          ))}
        </ol>
      </div>

      <SaveBar
        changedCount={changedIds.length}
        toFix={toFix}
        isSaving={isSaving}
        saveFailed={saveFailed}
        online={online}
        savedAt={savedAt}
        onSave={save}
      />
    </section>
  );
}

const sheetGrid =
  "grid grid-cols-[var(--margin-x)_repeat(3,minmax(0,4rem))_minmax(4.5rem,1fr)] gap-x-2 pr-3 md:grid-cols-[var(--margin-x)_minmax(0,22rem)_repeat(3,4.5rem)_minmax(7.5rem,1fr)] md:gap-x-3 md:pr-4";

function SheetHeader({ columns }: { columns: ScoreColumn[] }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        sheetGrid,
        "sticky top-0 z-10 items-end border-b border-rule bg-card/95 py-2.5 backdrop-blur-sm sm:rounded-t-xl",
      )}
    >
      <span className="hidden pl-4 type-caption font-semibold text-muted-foreground md:col-start-2 md:block">
        Student
      </span>
      {columns.map((column, i) => (
        <span
          key={column.key}
          className={cn("flex flex-col items-center leading-tight", i === 0 && "col-start-2 md:col-start-3")}
        >
          <span className="type-caption font-semibold">{column.label}</span>
          <span className="type-caption type-figure text-muted-foreground">of {column.max}</span>
        </span>
      ))}
      <span className="flex flex-col items-end leading-tight md:items-start md:pl-2">
        <span className="type-caption font-semibold">Total</span>
        <span className="type-caption type-figure text-muted-foreground">
          of {columns.reduce((sum, column) => sum + column.max, 0)}
        </span>
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
  state: RowState;
  dirty: boolean;
  isLast: boolean;
  onChange: (key: string, raw: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, col: number) => void;
};

function StudentRow({
  number,
  rowIndex,
  student,
  columns,
  values,
  state,
  dirty,
  isLast,
  onChange,
  onKeyDown,
}: StudentRowProps) {
  const nameId = useId();
  const messageId = useId();
  const cells = columns.map((column) => readCell(values?.[column.key], column));
  const overCells = columns.filter((_, i) => cells[i].kind === "over");

  return (
    <li
      role="group"
      aria-labelledby={nameId}
      className={cn(
        sheetGrid,
        "relative items-center gap-y-2.5 border-b border-rule py-3 last:border-b-0 md:py-2.5",
        dirty &&
          "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-warning-mark sm:last:before:rounded-bl-xl",
      )}
    >
      <span
        aria-hidden="true"
        className="row-span-2 self-start pt-0.5 pr-2.5 text-right type-caption type-figure text-muted-foreground md:row-span-1 md:self-center md:pt-0"
      >
        {number}
      </span>

      <p id={nameId} className="col-span-4 min-w-0 truncate pl-1 md:col-span-1 md:pl-4">
        <span className="font-bold">{student.surname}</span> {student.otherNames}
      </p>

      {columns.map((column, col) => {
        const cell = cells[col];
        const over = cell.kind === "over";
        return (
          <div key={column.key} className={cn("relative", col === 0 && "col-start-2 md:col-start-3")}>
            <input
              data-cell={`${rowIndex}:${col}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint={isLast && col === columns.length - 1 ? "done" : "next"}
              aria-label={`${column.label}, out of ${column.max}`}
              aria-invalid={over}
              aria-describedby={over ? messageId : undefined}
              placeholder="–"
              value={values?.[column.key] ?? ""}
              onChange={(event) => onChange(column.key, event.target.value)}
              onKeyDown={(event) => onKeyDown(event, col)}
              onFocus={(event) => event.currentTarget.select()}
              className={cn(
                "relative h-12 w-full rounded-md border border-input bg-card text-center type-score transition-colors outline-none placeholder:font-normal placeholder:text-muted-foreground/60",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25",
                "aria-invalid:border-destructive/60 aria-invalid:text-destructive aria-invalid:focus-visible:ring-destructive/20",
              )}
            />
            {over && <RedPenCircle />}
          </div>
        );
      })}

      <RowResult state={state} />

      {overCells.length > 0 && (
        <p
          id={messageId}
          className="col-span-4 col-start-2 flex items-start gap-1.5 pl-1 type-caption font-semibold text-destructive animate-ink-in md:col-span-4 md:col-start-3 md:pl-0"
        >
          <CircleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {overCells
            .map((column) => {
              const typed = values?.[column.key] ?? "";
              return `${column.label} is out of ${column.max}. You wrote ${typed}.`;
            })
            .join(" ")}
        </p>
      )}
      {state.kind === "partial" && (
        <p className="col-span-4 col-start-2 pl-1 type-caption text-muted-foreground md:col-span-4 md:col-start-3 md:pl-0">
          {joinLabels(state.missing)} not entered yet
        </p>
      )}
    </li>
  );
}

function RowResult({ state }: { state: RowState }) {
  if (state.kind !== "complete") {
    return (
      <span
        className="justify-self-end pr-1 type-score text-muted-foreground/50 md:justify-self-start md:pl-2"
        aria-label="No total yet"
      >
        —
      </span>
    );
  }
  return (
    <span className="flex items-center justify-end gap-2 md:justify-start md:pl-2">
      <span className="type-score">{formatScore(state.total)}</span>
      {state.band && (
        <span
          title={state.band.remark}
          className="inline-flex h-6 min-w-8 items-center justify-center rounded-sm border border-foreground/25 px-1 text-[0.8125rem] font-bold"
        >
          {state.band.grade}
        </span>
      )}
    </span>
  );
}

type SaveBarProps = {
  changedCount: number;
  toFix: number;
  isSaving: boolean;
  saveFailed: boolean;
  online: boolean;
  savedAt: string | undefined;
  onSave: () => void;
};

function SaveBar({ changedCount, toFix, isSaving, saveFailed, online, savedAt, onSave }: SaveBarProps) {
  const clean = changedCount === 0;
  let tone: "quiet" | "warning" | "error" | "success" = "quiet";
  let icon: React.ReactNode = null;
  let message: React.ReactNode;

  if (isSaving) {
    message = "Saving scores…";
  } else if (!online && !clean) {
    tone = "warning";
    icon = <CloudOffIcon aria-hidden="true" className="size-4 shrink-0" />;
    message = "You are offline. Scores are kept on this device until you can save.";
  } else if (saveFailed) {
    tone = "error";
    icon = <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />;
    message = "Scores not saved. Check your connection and save again.";
  } else if (toFix > 0) {
    tone = "error";
    icon = <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />;
    message = `${toFix} ${toFix === 1 ? "score is" : "scores are"} above the maximum. Fix ${toFix === 1 ? "it" : "them"} to save.`;
  } else if (!clean) {
    tone = "warning";
    message = `${changedCount} ${changedCount === 1 ? "student" : "students"} changed, not saved yet`;
  } else if (savedAt) {
    tone = "success";
    icon = <CircleCheckIcon aria-hidden="true" className="size-4 shrink-0" />;
    message = (
      <>
        All scores saved at{" "}
        <time dateTime={savedAt} suppressHydrationWarning>
          {lagosTime.format(new Date(savedAt))}
        </time>
      </>
    );
  } else {
    message = "No scores entered yet";
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-px mt-4 border-t border-rule bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:mx-0 sm:rounded-t-xl sm:border-x sm:bg-card/95 sm:px-4">
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
          {tone === "warning" && !icon && (
            <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-warning sm:mt-0" />
          )}
          {icon && <span className="mt-px sm:mt-0">{icon}</span>}
          <span>{message}</span>
        </p>
        <Button size="lg" onClick={onSave} disabled={isSaving || clean || !online} className="shrink-0">
          {isSaving && <Spinner data-icon="inline-start" />}
          {isSaving ? "Saving" : "Save scores"}
        </Button>
      </div>
    </div>
  );
}

function joinLabels(columns: ScoreColumn[]) {
  const labels = columns.map((column) => column.label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function mergeScores(base: SheetScores, patch: SheetScores): SheetScores {
  const next = { ...base };
  for (const [id, row] of Object.entries(patch)) next[id] = { ...base[id], ...row };
  return next;
}

function diffScores(values: SheetScores, saved: SheetScores): SheetScores {
  const changes: SheetScores = {};
  for (const [id, row] of Object.entries(values)) {
    for (const [key, raw] of Object.entries(row)) {
      if ((saved[id]?.[key] ?? "") !== raw) {
        changes[id] = { ...changes[id], [key]: raw };
      }
    }
  }
  return changes;
}

function readDraft(key: string): SheetScores | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SheetScores) : null;
  } catch {
    return null;
  }
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
