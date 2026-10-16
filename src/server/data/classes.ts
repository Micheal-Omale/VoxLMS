import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { enrolment, schoolClass, student, term } from "@/db/schema";

import type { SchoolContext } from "./context";
import { NotFound } from "./errors";

/**
 * A class's students for a term, surname first. Withdrawn enrolments are left
 * out; a class is at most a few dozen students, so no paging is needed.
 */
export async function listClassStudents(ctx: SchoolContext, input: { termId: string; classId: string }) {
  const [owned] = await ctx.db
    .select({ classId: schoolClass.id, termId: term.id })
    .from(schoolClass)
    .innerJoin(term, and(eq(term.schoolId, schoolClass.schoolId), eq(term.id, input.termId)))
    .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
  if (!owned) throw new NotFound("Class");

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
