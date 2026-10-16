import "server-only";

import { eq, sql } from "drizzle-orm";

import { school } from "@/db/schema";

import { assertNotTeacher, assertWritable } from "./access";
import type { SchoolContext } from "./context";
import { DataError, NotFound } from "./errors";

/**
 * Hands out the next `count` student numbers for the school (spec 0003, AC-11).
 * One atomic update, so two people adding students at once never get the same
 * number, and a number is never reused. Call it inside the transaction that
 * inserts the students.
 */
export async function allocateStudentNumbers(ctx: SchoolContext, input: { count: number }): Promise<number[]> {
  assertNotTeacher(ctx, "School");
  assertWritable(ctx);
  if (!Number.isInteger(input.count) || input.count < 1) throw new DataError("count must be a positive whole number");
  const [row] = await ctx.db
    .update(school)
    .set({ studentNoCounter: sql`${school.studentNoCounter} + ${input.count}` })
    .where(eq(school.id, ctx.schoolId))
    .returning({ last: school.studentNoCounter });
  if (!row) throw new NotFound("School");
  const first = row.last - input.count + 1;
  return Array.from({ length: input.count }, (_, i) => first + i);
}
