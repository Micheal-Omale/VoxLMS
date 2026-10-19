"use server";

import type { RemarkChange, RemarksSaveOutcome } from "@/components/remarks-sheet/types";
import { getActionViewer, schoolContextFor } from "@/server/auth/viewer";
import {
  Conflict,
  getClassRemarks,
  InvalidRemark,
  NoCurrentTerm,
  NotFound,
  NotInClass,
  NotSignedIn,
  ReadOnlySession,
  saveRemarks,
  TermClosed,
  TermReleased,
} from "@/server/data";

import { toRemarksSnapshot } from "./remarks-snapshot";

// Remarks (spec 0011), saved exactly like scores (spec 0009). Nothing is
// thrown to the sheet: every refusal comes back as a result it can act on,
// with a freshly read sheet where it must reload. A signed out session is a
// result too, so typed comments stay put.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const isText = (value: unknown): value is string | null => value === null || typeof value === "string";
const isField = (value: unknown): value is "teacher" | "head" => value === "teacher" || value === "head";

export async function saveRemarksAction(
  slug: string,
  input: { termId: string; classId: string; saveId: string; changes: RemarkChange[] },
): Promise<RemarksSaveOutcome> {
  const viewer = await getActionViewer();
  if (!viewer) return { kind: "signedOut" };
  const resolved = await schoolContextFor(viewer, String(slug));
  if (!resolved) return { kind: "notFound" };
  const { ctx, school } = resolved;

  // Ids that aren't ids are "not found", so the action can't be used to probe (AC-12).
  if (!isId(input?.termId) || !isId(input.classId) || !isId(input.saveId) || !Array.isArray(input.changes)) return { kind: "notFound" };
  const changes = input.changes.map((c) => ({ studentId: c?.studentId, field: c?.field, expected: c?.expected, value: c?.value }));
  if (changes.some((c) => !isId(c.studentId) || !isField(c.field) || !isText(c.expected) || !isText(c.value))) return { kind: "notFound" };
  const ref = { classId: input.classId, termId: input.termId };
  const fresh = async () => toRemarksSnapshot(await getClassRemarks(ctx, ref), school.code);

  let updatedAt: Date;
  try {
    ({ updatedAt } = await saveRemarks(ctx, { ...ref, saveId: input.saveId, changes: changes as RemarkChange[] }));
  } catch (error) {
    try {
      if (error instanceof Conflict) return { kind: "conflict", studentIds: error.studentIds, sheet: await fresh() };
      if (error instanceof NotInClass) return { kind: "stale", removedStudentIds: error.studentIds, sheet: await fresh() };
    } catch (freshError) {
      if (freshError instanceof NotFound || freshError instanceof NoCurrentTerm) return { kind: "notFound" };
      throw freshError;
    }
    if (error instanceof TermReleased) return { kind: "closed" };
    if (error instanceof TermClosed) return { kind: "closed" };
    if (error instanceof ReadOnlySession) return { kind: "readOnly" };
    if (error instanceof InvalidRemark) return { kind: "invalid" };
    if (error instanceof NotFound || error instanceof NoCurrentTerm) return { kind: "notFound" };
    if (error instanceof NotSignedIn) return { kind: "signedOut" };
    throw error;
  }
  // The save landed; a fresh read brings the last change lines. If that read fails, the sheet keeps its own copy.
  try {
    return { kind: "saved", updatedAt: updatedAt.toISOString(), sheet: await fresh() };
  } catch {
    return { kind: "saved", updatedAt: updatedAt.toISOString() };
  }
}
