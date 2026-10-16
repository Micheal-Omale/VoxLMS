import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import {
  assessmentComponent,
  classSubject,
  enrolment,
  gradeBand,
  schoolClass,
  schoolSubject,
  score,
  student,
  term,
} from "@/db/schema";

import type { SchoolContext } from "./context";
import { NotFound } from "./errors";
import { canonicalScore } from "./scores";

/** A section's grade scale for one session, highest band first (spec 0003, AC-7). */
export async function getGradeBands(ctx: SchoolContext, input: { sectionId: string; sessionId: string }) {
  const rows = await ctx.db
    .select({ grade: gradeBand.grade, minScore: gradeBand.minScore, remark: gradeBand.remark })
    .from(gradeBand)
    .where(
      and(
        eq(gradeBand.schoolId, ctx.schoolId),
        eq(gradeBand.sectionId, input.sectionId),
        eq(gradeBand.sessionId, input.sessionId),
      ),
    );
  return rows.map((b) => ({ grade: b.grade, min: Number(b.minScore), remark: b.remark })).sort((a, b) => b.min - a.min);
}

/**
 * A student's scores for every term of a session (spec 0003, AC-6). A term the
 * student was not enrolled in comes back with `enrolment: null`, never zeros.
 * Totals, grades and positions are worked out by Results computation (#10).
 */
export async function getStudentSessionResults(ctx: SchoolContext, input: { studentId: string; sessionId: string }) {
  const [owned] = await ctx.db
    .select({ id: student.id })
    .from(student)
    .where(and(eq(student.schoolId, ctx.schoolId), eq(student.id, input.studentId)));
  if (!owned) throw new NotFound("Student");

  const terms = await ctx.db
    .select({ id: term.id, number: term.number })
    .from(term)
    .where(and(eq(term.schoolId, ctx.schoolId), eq(term.sessionId, input.sessionId)))
    .orderBy(asc(term.number));
  if (terms.length === 0) throw new NotFound("Session");

  const enrolments = await ctx.db
    .select({
      enrolmentId: enrolment.id,
      termId: enrolment.termId,
      classId: enrolment.classId,
      sectionId: enrolment.sectionId,
      className: schoolClass.name,
      withdrawnOn: enrolment.withdrawnOn,
    })
    .from(enrolment)
    .innerJoin(schoolClass, eq(schoolClass.id, enrolment.classId))
    .where(
      and(
        eq(enrolment.schoolId, ctx.schoolId),
        eq(enrolment.studentId, input.studentId),
        eq(enrolment.sessionId, input.sessionId),
      ),
    );

  const scoreRows =
    enrolments.length === 0
      ? []
      : await ctx.db
          .select({
            enrolmentId: score.enrolmentId,
            classSubjectId: score.classSubjectId,
            subjectName: schoolSubject.name,
            componentKey: assessmentComponent.key,
            value: score.value,
          })
          .from(score)
          .innerJoin(classSubject, eq(classSubject.id, score.classSubjectId))
          .innerJoin(schoolSubject, eq(schoolSubject.id, classSubject.subjectId))
          .innerJoin(assessmentComponent, eq(assessmentComponent.id, score.componentId))
          .where(
            and(
              eq(score.schoolId, ctx.schoolId),
              inArray(
                score.enrolmentId,
                enrolments.map((e) => e.enrolmentId),
              ),
            ),
          );

  return terms.map((t) => {
    const e = enrolments.find((row) => row.termId === t.id);
    if (!e) return { termId: t.id, number: t.number, enrolment: null, subjects: [] };
    const subjects = new Map<string, { classSubjectId: string; name: string; scores: Record<string, string> }>();
    for (const row of scoreRows.filter((s) => s.enrolmentId === e.enrolmentId)) {
      const entry = subjects.get(row.classSubjectId) ?? { classSubjectId: row.classSubjectId, name: row.subjectName, scores: {} };
      entry.scores[row.componentKey] = canonicalScore(row.value)!;
      subjects.set(row.classSubjectId, entry);
    }
    return {
      termId: t.id,
      number: t.number,
      enrolment: { id: e.enrolmentId, classId: e.classId, sectionId: e.sectionId, className: e.className, withdrawnOn: e.withdrawnOn },
      subjects: [...subjects.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}
