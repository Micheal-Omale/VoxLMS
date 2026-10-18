// The scores typed on this device but not yet confirmed by the server (spec
// 0009, AC-5, AC-7, AC-8). Each typed value keeps the saved value it was typed
// over (its base), so a save can say what it replaced, and a base that no
// longer matches the server shows up as a conflict instead of overwriting.

import type { ScoreColumn } from "./score-math";
import type { ScoreChange, SheetScores, SheetStudent } from "./types";

export type DraftEntry = { value: string; base: string };
/** studentId → column key → what was typed and what it was typed over. */
export type Draft = Record<string, Record<string, DraftEntry>>;

const DRAFT_VERSION = 1;

/** One text form per score, so "12", "12.0" and "12." compare equal. Text that isn't a score stays as typed. */
export function canonical(value: string | undefined | null): string {
  const text = (value ?? "").trim();
  if (text === "" || text === ".") return "";
  return /^\d*\.?\d*$/.test(text) ? String(Number(text)) : text;
}

export const same = (a: string | undefined | null, b: string | undefined | null) => canonical(a) === canonical(b);

const savedValue = (saved: SheetScores, studentId: string, key: string) => saved[studentId]?.[key] ?? "";

/** What a cell shows: the typed value if there is one, else the saved one. */
export function shown(draft: Draft, saved: SheetScores, studentId: string, key: string): string {
  return draft[studentId]?.[key]?.value ?? savedValue(saved, studentId, key);
}

/** Every score each student would show, typed over saved, for totals and progress. */
export function shownRows(draft: Draft, saved: SheetScores, students: SheetStudent[], columns: ScoreColumn[]): SheetScores {
  const rows: SheetScores = {};
  for (const student of students) {
    const row: Record<string, string> = {};
    for (const column of columns) {
      const value = shown(draft, saved, student.id, column.key);
      if (value !== "") row[column.key] = value;
    }
    rows[student.id] = row;
  }
  return rows;
}

function withEntry(draft: Draft, studentId: string, key: string, entry: DraftEntry | null): Draft {
  const row = { ...draft[studentId] };
  if (entry) row[key] = entry;
  else delete row[key];
  const next = { ...draft };
  if (Object.keys(row).length > 0) next[studentId] = row;
  else delete next[studentId];
  return next;
}

/** Records a typed value. Typing back what is saved removes the change. */
export function typeValue(draft: Draft, saved: SheetScores, studentId: string, key: string, raw: string): Draft {
  const current = savedValue(saved, studentId, key);
  if (same(raw, current)) return withEntry(draft, studentId, key, null);
  const base = draft[studentId]?.[key]?.base ?? current;
  return withEntry(draft, studentId, key, { value: raw, base });
}

/** Students whose typed scores were typed over a value someone else has since changed (AC-7). */
export function conflictedStudents(draft: Draft, saved: SheetScores): Set<string> {
  const ids = new Set<string>();
  for (const [studentId, row] of Object.entries(draft)) {
    for (const [key, entry] of Object.entries(row)) {
      if (!same(entry.base, savedValue(saved, studentId, key))) ids.add(studentId);
    }
  }
  return ids;
}

/** "Keep mine": every typed part in the row becomes a change against the newer saved values. */
export function keepMine(draft: Draft, saved: SheetScores, studentId: string): Draft {
  const row = draft[studentId];
  if (!row) return draft;
  const next: Record<string, DraftEntry> = {};
  for (const [key, entry] of Object.entries(row)) next[key] = { value: entry.value, base: savedValue(saved, studentId, key) };
  return { ...draft, [studentId]: next };
}

/** "Use saved": the typed values for that row are dropped. */
export function takeSaved(draft: Draft, studentId: string): Draft {
  const next = { ...draft };
  delete next[studentId];
  return next;
}

export type Dropped = { studentIds: string[]; columnKeys: string[] };

/**
 * Checks a draft against a freshly read sheet (AC-5, AC-7, AC-8): a typed
 * value that now equals the saved one drops out, and students or parts no
 * longer on the sheet are dropped and reported. Bases are kept, so a saved
 * value that changed meanwhile surfaces as a conflict.
 */
export function reconcile(draft: Draft, saved: SheetScores, students: SheetStudent[], columns: ScoreColumn[]): { draft: Draft; dropped: Dropped } {
  const onSheet = new Set(students.map((s) => s.id));
  const parts = new Set(columns.map((c) => c.key));
  const dropped = { studentIds: new Set<string>(), columnKeys: new Set<string>() };
  const next: Draft = {};
  for (const [studentId, row] of Object.entries(draft)) {
    if (!onSheet.has(studentId)) {
      dropped.studentIds.add(studentId);
      continue;
    }
    for (const [key, entry] of Object.entries(row)) {
      if (!parts.has(key)) {
        dropped.columnKeys.add(key);
        continue;
      }
      if (same(entry.value, savedValue(saved, studentId, key))) continue;
      (next[studentId] ??= {})[key] = entry;
    }
  }
  return { draft: next, dropped: { studentIds: [...dropped.studentIds], columnKeys: [...dropped.columnKeys] } };
}

/** The changes a Save sends, each with the saved value it replaced (spec 0003, AC-5). */
export function toChanges(draft: Draft): ScoreChange[] {
  const changes: ScoreChange[] = [];
  for (const [studentId, row] of Object.entries(draft)) {
    for (const [componentKey, entry] of Object.entries(row)) {
      changes.push({ studentId, componentKey, expected: canonical(entry.base) || null, value: canonical(entry.value) || null });
    }
  }
  return changes;
}

/**
 * Applies a confirmed save. Anything typed after the Save tap stays as a
 * change, now typed over the value that was just saved.
 */
export function applySaved(draft: Draft, saved: SheetScores, changes: ScoreChange[]): { draft: Draft; saved: SheetScores } {
  const nextSaved: SheetScores = { ...saved };
  let nextDraft = draft;
  for (const change of changes) {
    const row = { ...nextSaved[change.studentId] };
    if (change.value === null) delete row[change.componentKey];
    else row[change.componentKey] = change.value;
    nextSaved[change.studentId] = row;

    const entry = nextDraft[change.studentId]?.[change.componentKey];
    if (!entry) continue;
    nextDraft = same(entry.value, change.value)
      ? withEntry(nextDraft, change.studentId, change.componentKey, null)
      : withEntry(nextDraft, change.studentId, change.componentKey, { value: entry.value, base: change.value ?? "" });
  }
  return { draft: nextDraft, saved: nextSaved };
}

export function countEntries(draft: Draft): number {
  return Object.values(draft).reduce((n, row) => n + Object.keys(row).length, 0);
}

/** Reads this device's draft. Anything unreadable counts as no draft. */
export function readDraft(key: string): Draft {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { v?: number; entries?: Draft };
    return parsed?.v === DRAFT_VERSION && parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {};
  } catch {
    return {};
  }
}

/** Keeps the draft on this device; an empty draft removes it. */
export function writeDraft(key: string, draft: Draft) {
  try {
    if (countEntries(draft) === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ v: DRAFT_VERSION, entries: draft }));
  } catch {
    // Private mode or full storage: typing still works, only the safety net is lost.
  }
}
