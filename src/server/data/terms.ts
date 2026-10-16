import "server-only";

import { and, eq } from "drizzle-orm";

import { academicSession, term } from "@/db/schema";

import type { SchoolContext } from "./context";
import { NoCurrentTerm, NotFound } from "./errors";

export async function getCurrentTerm(ctx: SchoolContext) {
  const [row] = await ctx.db
    .select({ term, session: academicSession })
    .from(term)
    .innerJoin(academicSession, eq(academicSession.id, term.sessionId))
    .where(and(eq(term.schoolId, ctx.schoolId), eq(term.isCurrent, true)));
  if (!row) throw new NoCurrentTerm();
  return row;
}

/** Makes one term current and clears the flag on the school's other terms. */
export async function setCurrentTerm(ctx: SchoolContext, input: { termId: string }) {
  await ctx.db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: term.id })
      .from(term)
      .where(and(eq(term.schoolId, ctx.schoolId), eq(term.id, input.termId)));
    if (!target) throw new NotFound("Term");
    await tx
      .update(term)
      .set({ isCurrent: false })
      .where(and(eq(term.schoolId, ctx.schoolId), eq(term.isCurrent, true)));
    await tx.update(term).set({ isCurrent: true }).where(eq(term.id, target.id));
  });
}
