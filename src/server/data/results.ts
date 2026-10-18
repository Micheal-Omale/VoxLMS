import "server-only";

import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";

import {
  assessmentComponent,
  classSubject,
  classTeacher,
  enrolment,
  gradeBand,
  schoolClass,
  schoolSubject,
  score,
  section,
  student,
  studentElective,
  term,
} from "@/db/schema";
import { computeClassResults, type ResultsInput } from "@/lib/results";

import { assertClassAccess } from "./access";
import { readSnapshot, type SchoolContext } from "./context";
import { NotFound } from "./errors";
import { canonicalScore } from "./scores";
import { getCurrentTerm } from "./terms";

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
  if (ctx.actor.kind === "teacher") {
    // A teacher sees a student's session only if the student is in one of their form classes then.
    const mine = await ctx.db
      .select({ id: enrolment.id })
      .from(enrolment)
      .innerJoin(
        classTeacher,
        and(eq(classTeacher.classId, enrolment.classId), eq(classTeacher.sessionId, enrolment.sessionId)),
      )
      .where(
        and(
          eq(enrolment.schoolId, ctx.schoolId),
          eq(enrolment.studentId, input.studentId),
          eq(enrolment.sessionId, input.sessionId),
          eq(classTeacher.staffId, ctx.actor.staffId),
        ),
      )
      .limit(1);
    if (mine.length === 0) throw new NotFound("Student");
  }

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
          )
          // The school's one subject order (spec 0006, AC-2); the map below keeps it.
          .orderBy(asc(schoolSubject.sortOrder), asc(schoolSubject.name));

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
      subjects: [...subjects.values()],
    };
  });
}

/**
 * A class's results for one term (spec 0010), worked out from the saved
 * scores on every read and never stored. Runs every read on the `ctx.db` it is
 * given, without opening a transaction, so the report card (#12) and
 * broadsheet (#16) can call it inside their own snapshot. No `termId` means
 * the current term; otherwise a term of the current session up to the current
 * one, chosen exactly as `listSubjectProgress` chooses it.
 */
export async function loadClassResults(ctx: SchoolContext, input: { classId: string; termId?: string }) {
  const current = await getCurrentTerm(ctx);
  const [cls] = await ctx.db
    .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId, sectionName: section.name })
    .from(schoolClass)
    .innerJoin(section, eq(section.id, schoolClass.sectionId))
    .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
  if (!cls) throw new NotFound("Class");
  const sessionId = current.session.id;
  await assertClassAccess(ctx, { classId: cls.id, sessionId });

  const terms = await ctx.db
    .select({ id: term.id, number: term.number, isCurrent: term.isCurrent })
    .from(term)
    .where(and(eq(term.schoolId, ctx.schoolId), eq(term.sessionId, sessionId), lte(term.number, current.term.number)))
    .orderBy(desc(term.number));
  const chosen = input.termId ? terms.find((t) => t.id === input.termId) : terms.find((t) => t.isCurrent);
  if (!chosen) throw new NotFound("Term");

  const [split, gradeBands, offered, enrolled] = await Promise.all([
    ctx.db
      .select({ id: assessmentComponent.id, key: assessmentComponent.key, label: assessmentComponent.label, maxScore: assessmentComponent.maxScore })
      .from(assessmentComponent)
      .where(
        and(
          eq(assessmentComponent.schoolId, ctx.schoolId),
          eq(assessmentComponent.sectionId, cls.sectionId),
          eq(assessmentComponent.sessionId, sessionId),
        ),
      )
      .orderBy(asc(assessmentComponent.sortOrder)),
    getGradeBands(ctx, { sectionId: cls.sectionId, sessionId }),
    ctx.db
      .select({
        classSubjectId: classSubject.id,
        subjectId: classSubject.subjectId,
        isElective: classSubject.isElective,
        name: schoolSubject.name,
        shortName: schoolSubject.shortName,
      })
      .from(classSubject)
      .innerJoin(schoolSubject, eq(schoolSubject.id, classSubject.subjectId))
      .where(and(eq(classSubject.schoolId, ctx.schoolId), eq(classSubject.classId, cls.id), eq(classSubject.sessionId, sessionId)))
      // Compulsory first, then electives, each in the school's one subject order (spec 0006).
      .orderBy(asc(classSubject.isElective), asc(schoolSubject.sortOrder), asc(schoolSubject.name)),
    // Open enrolments only: a student withdrawn this term is in no figure (AC-4).
    ctx.db
      .select({
        enrolmentId: enrolment.id,
        studentId: student.id,
        surname: student.surname,
        otherNames: student.otherNames,
        studentNo: student.studentNo,
        admissionNo: student.admissionNo,
      })
      .from(enrolment)
      .innerJoin(student, eq(student.id, enrolment.studentId))
      .where(
        and(
          eq(enrolment.schoolId, ctx.schoolId),
          eq(enrolment.termId, chosen.id),
          eq(enrolment.classId, cls.id),
          isNull(enrolment.withdrawnOn),
        ),
      ),
  ]);

  const studentIds = enrolled.map((e) => e.studentId);
  const electiveIds = offered.filter((o) => o.isElective).map((o) => o.subjectId);
  const [registrations, scoreRows] = await Promise.all([
    studentIds.length === 0 || electiveIds.length === 0
      ? []
      : ctx.db
          .select({ studentId: studentElective.studentId, subjectId: studentElective.subjectId })
          .from(studentElective)
          .where(
            and(
              eq(studentElective.schoolId, ctx.schoolId),
              eq(studentElective.sessionId, sessionId),
              inArray(studentElective.studentId, studentIds),
              inArray(studentElective.subjectId, electiveIds),
            ),
          ),
    enrolled.length === 0 || offered.length === 0 || split.length === 0
      ? []
      : ctx.db
          .select({ enrolmentId: score.enrolmentId, classSubjectId: score.classSubjectId, componentId: score.componentId, value: score.value })
          .from(score)
          .where(
            and(
              eq(score.schoolId, ctx.schoolId),
              inArray(
                score.enrolmentId,
                enrolled.map((e) => e.enrolmentId),
              ),
              inArray(
                score.classSubjectId,
                offered.map((o) => o.classSubjectId),
              ),
              // Only parts of the section's current split count.
              inArray(
                score.componentId,
                split.map((c) => c.id),
              ),
            ),
          ),
  ]);

  const studentOf = new Map(enrolled.map((e) => [e.enrolmentId, e.studentId]));
  const keyOf = new Map(split.map((c) => [c.id, c.key]));
  const scores: ResultsInput["scores"] = {};
  for (const row of scoreRows) {
    const byStudent = (scores[studentOf.get(row.enrolmentId)!] ??= {});
    (byStudent[row.classSubjectId] ??= {})[keyOf.get(row.componentId)!] = canonicalScore(row.value)!;
  }

  const figures = computeClassResults({
    split: split.map((c) => ({ key: c.key, label: c.label, max: Number(c.maxScore) })),
    gradeBands,
    subjects: offered.map((o) => ({
      classSubjectId: o.classSubjectId,
      name: o.name,
      shortName: o.shortName,
      isElective: o.isElective,
      // An elective counts only its registered takers; a compulsory subject counts everyone once.
      takerIds: o.isElective
        ? registrations.filter((r) => r.subjectId === o.subjectId).map((r) => r.studentId)
        : studentIds,
    })),
    students: enrolled.map((e) => ({ studentId: e.studentId, surname: e.surname, otherNames: e.otherNames, studentNo: e.studentNo, admissionNo: e.admissionNo })),
    scores,
  });

  return {
    cls: { id: cls.id, name: cls.name },
    term: chosen,
    section: { name: cls.sectionName },
    session: { name: current.session.name },
    split: split.map((c) => ({ key: c.key, label: c.label, max: Number(c.maxScore) })),
    hasGradeScale: gradeBands.length > 0,
    ...figures,
  };
}

export type ClassResults = Awaited<ReturnType<typeof loadClassResults>>;

/** A class's results from one consistent read (spec 0010, AC-11). */
export function getClassResults(ctx: SchoolContext, input: { classId: string; termId?: string }) {
  return readSnapshot(ctx, (snapshot) => loadClassResults(snapshot, input));
}
