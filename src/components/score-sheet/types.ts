import type { GradeBand, ScoreColumn } from "./score-math";

export type SheetStudent = {
  id: string;
  surname: string;
  otherNames: string;
  /** Admission number (or VoxLMS number), shown under the name. */
  number?: string;
};

/** studentId → column key → the score as text. */
export type SheetScores = Record<string, Record<string, string>>;

/** What the server says the sheet holds right now. */
export type SheetSnapshot = {
  students: SheetStudent[];
  columns: ScoreColumn[];
  scale: GradeBand[];
  scores: SheetScores;
};

/** One changed score, sent with the saved value it was typed over (spec 0003, AC-5). */
export type ScoreChange = {
  studentId: string;
  componentKey: string;
  expected: string | null;
  value: string | null;
};

export type SaveRequest = { saveId: string; changes: ScoreChange[] };

/**
 * Every way a save can end (spec 0009, AC-5 to AC-8, AC-13). "failed" and
 * "updated" are made in the browser when the request itself goes wrong.
 */
export type SaveOutcome =
  | { kind: "saved"; updatedAt: string }
  | { kind: "conflict"; studentIds: string[]; sheet: SheetSnapshot }
  | { kind: "stale"; removedStudentIds: string[]; sheet: SheetSnapshot }
  | { kind: "closed" }
  | { kind: "readOnly" }
  | { kind: "invalid"; studentId: string; componentKey: string }
  | { kind: "notFound" }
  | { kind: "signedOut" }
  | { kind: "failed" }
  | { kind: "updated" };

/** Why a sheet can't be typed in. */
export type ReadOnlyReason = "closed" | "viewingAs" | "lostAccess";
