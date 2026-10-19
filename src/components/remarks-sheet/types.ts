import type { ReadOnlyReason, SheetScores, SheetStudent } from "@/components/score-sheet/types";

export type { ReadOnlyReason };

/** The two comments per student (spec 0011). */
export type RemarkColumn = "teacher" | "head";

export type RemarksStudent = SheetStudent & {
  /** Hundredths, from results (spec 0010); null while incomplete. */
  average: number | null;
  position: number | null;
};

/** What the server says the Remarks sheet holds right now. */
export type RemarksSnapshot = {
  /** Open enrolments, surname first. */
  students: RemarksStudent[];
  /** studentId → column → saved text. The head's column holds only typed text; none means automatic. */
  saved: SheetScores;
  /** studentId → the automatic head's comment, or null while it waits for all scores. */
  automatic: Record<string, string | null>;
  /** studentId → who last saved the row and when (ISO); absent if never saved. */
  lastChange: Record<string, { by: string; at: string }>;
};

/** One changed comment, sent with the saved text it was typed over. */
export type RemarkChange = {
  studentId: string;
  field: RemarkColumn;
  expected: string | null;
  value: string | null;
};

export type RemarksSaveRequest = { saveId: string; changes: RemarkChange[] };

/**
 * Every way a save can end (AC-5 to AC-8, as spec 0009). "failed" and
 * "updated" are made in the browser when the request itself goes wrong.
 */
export type RemarksSaveOutcome =
  | { kind: "saved"; updatedAt: string; sheet?: RemarksSnapshot }
  | { kind: "conflict"; studentIds: string[]; sheet: RemarksSnapshot }
  | { kind: "stale"; removedStudentIds: string[]; sheet: RemarksSnapshot }
  | { kind: "closed" }
  | { kind: "readOnly" }
  | { kind: "invalid" }
  | { kind: "notFound" }
  | { kind: "signedOut" }
  | { kind: "failed" }
  | { kind: "updated" };
