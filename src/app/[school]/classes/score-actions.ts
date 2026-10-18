"use server";

import type { SaveOutcome, ScoreChange } from "@/components/score-sheet/types";
import { getActionViewer, schoolContextFor } from "@/server/auth/viewer";
import {
  Conflict,
  getScoreHistory,
  getScoreSheet,
  InvalidScore,
  NoCurrentTerm,
  NotFound,
  NotSignedIn,
  NotTakingSubject,
  ReadOnlySession,
  saveScores,
  ScoreAboveMaximum,
  TermClosed,
} from "@/server/data";
import type { SchoolContext } from "@/server/data/context";

import { toSnapshot } from "./sheet-snapshot";

// Score entry (spec 0009). Nothing is thrown to the sheet: every refusal comes
// back as a result it can act on, with a freshly read sheet where it must
// reload. A signed out session is a result too, so typed work stays put.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const isScoreText = (value: unknown): value is string | null => value === null || typeof value === "string";

type SheetRef = { termId: string; classSubjectId: string };

async function context(slug: string): Promise<{ ctx: SchoolContext; schoolCode: string } | "signedOut" | "notFound"> {
  const viewer = await getActionViewer();
  if (!viewer) return "signedOut";
  const resolved = await schoolContextFor(viewer, String(slug));
  if (!resolved) return "notFound";
  return { ctx: resolved.ctx, schoolCode: resolved.school.code };
}

export async function saveScoresAction(slug: string, input: SheetRef & { saveId: string; changes: ScoreChange[] }): Promise<SaveOutcome> {
  const found = await context(slug);
  if (found === "signedOut" || found === "notFound") return { kind: found };
  const { ctx, schoolCode } = found;

  // Ids that aren't ids are "not found", so the address can't be used to probe (AC-13).
  if (!isId(input?.termId) || !isId(input.classSubjectId) || !isId(input.saveId) || !Array.isArray(input.changes)) return { kind: "notFound" };
  const changes = input.changes.map((c) => ({
    studentId: c?.studentId,
    componentKey: c?.componentKey,
    expected: c?.expected,
    value: c?.value,
  }));
  if (changes.some((c) => !isId(c.studentId) || typeof c.componentKey !== "string" || !isScoreText(c.expected) || !isScoreText(c.value))) {
    return { kind: "notFound" };
  }
  const ref = { termId: input.termId, classSubjectId: input.classSubjectId };

  try {
    const result = await saveScores(ctx, { ...ref, saveId: input.saveId, changes: changes as ScoreChange[] });
    return { kind: "saved", updatedAt: result.updatedAt.toISOString() };
  } catch (error) {
    const fresh = async () => toSnapshot(await getScoreSheet(ctx, ref), schoolCode);
    try {
      if (error instanceof Conflict) return { kind: "conflict", studentIds: error.studentIds, sheet: await fresh() };
      if (error instanceof NotTakingSubject) return { kind: "stale", removedStudentIds: error.studentIds, sheet: await fresh() };
      if (error instanceof ScoreAboveMaximum) return { kind: "stale", removedStudentIds: [], sheet: await fresh() };
    } catch (freshError) {
      if (freshError instanceof NotFound || freshError instanceof NoCurrentTerm) return { kind: "notFound" };
      throw freshError;
    }
    if (error instanceof TermClosed) return { kind: "closed" };
    if (error instanceof ReadOnlySession) return { kind: "readOnly" };
    if (error instanceof InvalidScore) return { kind: "invalid", studentId: error.studentId, componentKey: error.componentKey };
    if (error instanceof NotFound || error instanceof NoCurrentTerm) return { kind: "notFound" };
    if (error instanceof NotSignedIn) return { kind: "signedOut" };
    throw error;
  }
}

export type HistoryResult =
  | {
      ok: true;
      parts: { key: string; label: string; changes: { oldValue: string | null; newValue: string | null; changedAt: string; by: string }[] }[];
    }
  | { ok: false; kind: "notFound" | "signedOut" };

export async function scoreHistoryAction(slug: string, input: SheetRef & { studentId: string }): Promise<HistoryResult> {
  const found = await context(slug);
  if (found === "signedOut" || found === "notFound") return { ok: false, kind: found };
  if (!isId(input?.termId) || !isId(input.classSubjectId) || !isId(input.studentId)) return { ok: false, kind: "notFound" };
  try {
    const parts = await getScoreHistory(found.ctx, { termId: input.termId, classSubjectId: input.classSubjectId, studentId: input.studentId });
    return {
      ok: true,
      parts: parts.map((p) => ({ ...p, changes: p.changes.map((c) => ({ ...c, changedAt: c.changedAt.toISOString() })) })),
    };
  } catch (error) {
    if (error instanceof NotFound || error instanceof NoCurrentTerm) return { ok: false, kind: "notFound" };
    throw error;
  }
}
