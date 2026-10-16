import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { classSubject, enrolment, schoolClass, schoolSubject, student, term } from "@/db/schema";

import { assertClassAccess, listMyClasses } from "./access";
import type { SchoolContext } from "./context";
import { NotFound } from "./errors";

/**
 * A class's students for a term, surname first. Withdrawn enrolments are left
 * out; a class is at most a few dozen students, so no paging is needed.
 */
export async function listClassStudents(ctx: SchoolContext, input: { termId: string; classId: string }) {
  const [owned] = await ctx.db
    .select({ classId: schoolClass.id, termId: term.id, sessionId: term.sessionId })
    .from(schoolClass)
    .innerJoin(term, and(eq(term.schoolId, schoolClass.schoolId), eq(term.id, input.termId)))
    .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
  if (!owned) throw new NotFound("Class");
  await assertClassAccess(ctx, { classId: owned.classId, sessionId: owned.sessionId });

  return ctx.db
    .select({
      enrolmentId: enrolment.id,
      studentId: student.id,
      admissionNo: student.admissionNo,
      surname: student.surname,
      otherNames: student.otherNames,
      gender: student.gender,
    })
    .from(enrolment)
    .innerJoin(student, eq(student.id, enrolment.studentId))
    .where(
      and(
        eq(enrolment.schoolId, ctx.schoolId),
        eq(enrolment.termId, input.termId),
        eq(enrolment.classId, input.classId),
        isNull(enrolment.withdrawnOn),
      ),
    )
    .orderBy(asc(student.surname), asc(student.otherNames));
}

/**
 * Classes for the school home: a teacher's form classes, or every active class
 * for our team, each with its subjects and student count this term.
 */
export async function listHomeClasses(ctx: SchoolContext, input: { termId: string; sessionId: string }) {
  const classes =
    ctx.actor.kind === "teacher"
      ? await listMyClasses(ctx, { sessionId: input.sessionId })
      : await ctx.db
          .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId })
          .from(schoolClass)
          .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.isActive, true)))
          .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name));
  if (classes.length === 0) return [];
  const ids = classes.map((c) => c.id);
  const [subjects, counts] = await Promise.all([
    ctx.db
      .select({ classId: classSubject.classId, id: classSubject.id, name: schoolSubject.name, isElective: classSubject.isElective })
      .from(classSubject)
      .innerJoin(schoolSubject, eq(schoolSubject.id, classSubject.subjectId))
      .where(and(eq(classSubject.schoolId, ctx.schoolId), eq(classSubject.sessionId, input.sessionId), inArray(classSubject.classId, ids)))
      .orderBy(asc(classSubject.sortOrder)),
    ctx.db
      .select({ classId: enrolment.classId, n: sql<number>`count(*)::int` })
      .from(enrolment)
      .where(and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.termId, input.termId), inArray(enrolment.classId, ids), isNull(enrolment.withdrawnOn)))
      .groupBy(enrolment.classId),
  ]);
  return classes.map((c) => ({
    ...c,
    students: counts.find((x) => x.classId === c.id)?.n ?? 0,
    subjects: subjects.filter((s) => s.classId === c.id),
  }));
}
