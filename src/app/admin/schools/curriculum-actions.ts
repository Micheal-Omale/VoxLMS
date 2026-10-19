"use server";

import { refresh } from "next/cache";

import type { Band } from "@/lib/grading-presets";
import type { RemarkBand } from "@/lib/remarks";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import type { SchoolContext } from "@/server/data/context";
import {
  addStandardSubjects,
  copySessionSetup,
  createClasses,
  moveSubject,
  type OfferChange,
  removeClass,
  removeSubject,
  restoreClass,
  restoreSubject,
  saveClass,
  saveClassOffer,
  saveLevelOffer,
  saveSubject,
  type SubjectInput,
} from "@/server/data/curriculum";
import { TermReleased } from "@/server/data/errors";
import { saveGradeScale, saveScoreSplit, type SplitPartInput } from "@/server/data/grading";
import { saveRemarkBands } from "@/server/data/remarks";
import type { FormResult } from "@/server/data/team";

// Our team's subject, class and grading setup actions (spec 0006). Each checks
// the caller is on our team; the data functions check it again, keep to the
// school, and validate everything sent.

async function run<T extends object>(schoolId: string, fn: (ctx: SchoolContext) => Promise<FormResult<T>>): Promise<FormResult<T>> {
  const { ctx } = await requireTeamSchoolContext(String(schoolId));
  try {
    const result = await fn(ctx);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof TermReleased) return { ok: false, field: "term", error: error.message };
    throw error;
  }
}

const ids = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

// ---------- Subjects ----------

export async function addStandardSubjectsAction(schoolId: string, standardSubjectIds: string[]) {
  return run(schoolId, (ctx) => addStandardSubjects(ctx, { standardSubjectIds: ids(standardSubjectIds) }));
}

export async function saveSubjectAction(schoolId: string, input: SubjectInput) {
  return run(schoolId, (ctx) =>
    saveSubject(ctx, {
      id: input.id ? String(input.id) : null,
      name: String(input.name ?? ""),
      shortName: String(input.shortName ?? ""),
      standardSubjectId: input.standardSubjectId ? String(input.standardSubjectId) : null,
    }),
  );
}

export async function moveSubjectAction(schoolId: string, id: string, direction: "up" | "down") {
  return run(schoolId, (ctx) => moveSubject(ctx, { id: String(id), direction: direction === "up" ? "up" : "down" }));
}

export async function removeSubjectAction(schoolId: string, id: string) {
  return run(schoolId, (ctx) => removeSubject(ctx, { id: String(id) }));
}

export async function restoreSubjectAction(schoolId: string, id: string) {
  return run(schoolId, (ctx) => restoreSubject(ctx, { id: String(id) }));
}

// ---------- Classes and their subjects ----------

export async function createClassesAction(schoolId: string, levelIds: string[], arms: string) {
  return run(schoolId, (ctx) => createClasses(ctx, { levelIds: ids(levelIds), arms: String(arms ?? "") }));
}

export async function saveClassAction(schoolId: string, id: string, name: string, arm: string | null) {
  return run(schoolId, (ctx) => saveClass(ctx, { id: String(id), name: String(name ?? ""), arm: arm ? String(arm) : null }));
}

export async function removeClassAction(schoolId: string, id: string) {
  return run(schoolId, (ctx) => removeClass(ctx, { id: String(id) }));
}

export async function restoreClassAction(schoolId: string, id: string) {
  return run(schoolId, (ctx) => restoreClass(ctx, { id: String(id) }));
}

export async function saveLevelOfferAction(schoolId: string, levelId: string, sessionId: string, changes: OfferChange[]) {
  return run(schoolId, (ctx) =>
    saveLevelOffer(ctx, {
      levelId: String(levelId),
      sessionId: String(sessionId),
      changes: Array.isArray(changes)
        ? changes.map((c) => ({ subjectId: c?.subjectId, offered: c?.offered, ...(typeof c?.isElective === "boolean" ? { isElective: c.isElective } : {}) }))
        : [],
    }),
  );
}

export async function saveClassOfferAction(schoolId: string, classId: string, sessionId: string, subjects: { subjectId: string; isElective: boolean }[]) {
  return run(schoolId, (ctx) =>
    saveClassOffer(ctx, {
      classId: String(classId),
      sessionId: String(sessionId),
      subjects: Array.isArray(subjects) ? subjects.map((s) => ({ subjectId: s?.subjectId, isElective: s?.isElective === true })) : [],
    }),
  );
}

export async function copySessionSetupAction(schoolId: string, fromSessionId: string, toSessionId: string) {
  return run(schoolId, (ctx) => copySessionSetup(ctx, { fromSessionId: String(fromSessionId), toSessionId: String(toSessionId) }));
}

// ---------- Score split and grades ----------

export async function saveScoreSplitAction(schoolId: string, sectionId: string, sessionId: string, parts: SplitPartInput[]) {
  return run(schoolId, (ctx) => saveScoreSplit(ctx, { sectionId: String(sectionId), sessionId: String(sessionId), parts }));
}

export async function saveGradeScaleAction(schoolId: string, sectionId: string, sessionId: string, bands: Band[]) {
  return run(schoolId, (ctx) => saveGradeScale(ctx, { sectionId: String(sectionId), sessionId: String(sessionId), bands }));
}

// ---------- Principal's comment bands (spec 0011) ----------

export async function saveRemarkBandsAction(schoolId: string, bands: RemarkBand[]) {
  return run(schoolId, (ctx) =>
    saveRemarkBands(ctx, { bands: Array.isArray(bands) ? bands.map((b) => ({ minAverage: String(b?.minAverage ?? ""), remark: String(b?.remark ?? "") })) : [] }),
  );
}
