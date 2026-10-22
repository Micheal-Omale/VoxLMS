import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { classTeacher, schoolClass } from "@/db/schema";

import type { SchoolContext } from "./context";
import { DataError, NotFound } from "./errors";

// Who may do what (spec 0004, AC-8, AC-9). Anything out of reach is "not
// found", so addresses and actions can't be used to probe other classes.

export class ReadOnlySession extends DataError {
  constructor(message = "You are viewing as this person. Nothing can be saved.") {
    super(message);
  }
}

/**
 * Refuses every write while our team is viewing as someone. A principal
 * reviews scores and comments but never changes them.
 */
export function assertWritable(ctx: SchoolContext) {
  if (ctx.actor.kind === "principal") throw new ReadOnlySession("You can review this class. Only its form teacher can change it.");
  if (ctx.actor.kind !== "system" && ctx.actor.readOnly) throw new ReadOnlySession();
}

/** School setup actions (terms, parents, new students, PIN slips) are our team's alone in Release 1. */
export function assertNotTeacher(ctx: SchoolContext, what: string) {
  if (ctx.actor.kind === "teacher" || ctx.actor.kind === "principal") throw new NotFound(what);
}

/** A teacher reaches a class only if they are its form teacher in that session. */
export async function assertClassAccess(ctx: SchoolContext, input: { classId: string; sessionId: string }) {
  if (ctx.actor.kind !== "teacher") return;
  const [row] = await ctx.db
    .select({ id: classTeacher.id })
    .from(classTeacher)
    .where(
      and(
        eq(classTeacher.schoolId, ctx.schoolId),
        eq(classTeacher.classId, input.classId),
        eq(classTeacher.sessionId, input.sessionId),
        eq(classTeacher.staffId, ctx.actor.staffId),
      ),
    );
  if (!row) throw new NotFound("Class");
}

/** The classes a teacher is form teacher of in a session (empty for anyone else). */
export async function listMyClasses(ctx: SchoolContext, input: { sessionId: string }) {
  if (ctx.actor.kind !== "teacher") return [];
  return ctx.db
    .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId })
    .from(classTeacher)
    .innerJoin(schoolClass, eq(schoolClass.id, classTeacher.classId))
    .where(
      and(
        eq(classTeacher.schoolId, ctx.schoolId),
        eq(classTeacher.sessionId, input.sessionId),
        eq(classTeacher.staffId, ctx.actor.staffId),
      ),
    )
    .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name));
}
