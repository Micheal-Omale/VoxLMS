import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { guardian, student, studentGuardian } from "@/db/schema";

import type { SchoolContext } from "./context";
import { DataError, NotFound } from "./errors";

export class TooManyGuardians extends DataError {
  constructor() {
    super("A student can have at most two parents or guardians");
  }
}

/**
 * Links a parent to a child (spec 0003, AC-9): at most two per child and one
 * primary. The child's row is locked so two links at once can't both pass.
 */
export async function linkGuardian(
  ctx: SchoolContext,
  input: { studentId: string; guardianId: string; relationship: "mother" | "father" | "guardian"; isPrimary: boolean },
) {
  await ctx.db.transaction(async (tx) => {
    const [child] = await tx
      .select({ id: student.id })
      .from(student)
      .where(and(eq(student.schoolId, ctx.schoolId), eq(student.id, input.studentId)))
      .for("update");
    if (!child) throw new NotFound("Student");
    const [parent] = await tx
      .select({ id: guardian.id })
      .from(guardian)
      .where(and(eq(guardian.schoolId, ctx.schoolId), eq(guardian.id, input.guardianId)));
    if (!parent) throw new NotFound("Guardian");

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(studentGuardian)
      .where(eq(studentGuardian.studentId, child.id));
    if (count >= 2) throw new TooManyGuardians();

    if (input.isPrimary) {
      await tx.update(studentGuardian).set({ isPrimary: false }).where(eq(studentGuardian.studentId, child.id));
    }
    await tx.insert(studentGuardian).values({
      schoolId: ctx.schoolId,
      studentId: child.id,
      guardianId: parent.id,
      relationship: input.relationship,
      isPrimary: input.isPrimary,
    });
  });
}
