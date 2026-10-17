import "server-only";

import { and, desc, eq, lt, sql } from "drizzle-orm";

import { academicSession, enrolment, term } from "@/db/schema";

import { assertNotTeacher, assertWritable } from "./access";
import type { Executor, SchoolContext } from "./context";
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

export type CarriedForward = { carried: number; classOff: number };

/**
 * Makes one term current and clears the flag on the school's other terms.
 * Moving forward within a session carries class lists into the new term in
 * the same transaction (spec 0008, AC-13); an earlier term, or a term of
 * another session, copies nothing.
 */
export async function setCurrentTerm(ctx: SchoolContext, input: { termId: string }): Promise<CarriedForward> {
  assertNotTeacher(ctx, "Term");
  assertWritable(ctx);
  return ctx.db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: term.id, sessionId: term.sessionId, number: term.number })
      .from(term)
      .where(and(eq(term.schoolId, ctx.schoolId), eq(term.id, input.termId)));
    if (!target) throw new NotFound("Term");
    // Updating the old current term locks it, so a student save holding it (share) finishes first.
    const [previous] = await tx
      .update(term)
      .set({ isCurrent: false })
      .where(and(eq(term.schoolId, ctx.schoolId), eq(term.isCurrent, true)))
      .returning({ sessionId: term.sessionId, number: term.number });
    await tx.update(term).set({ isCurrent: true }).where(eq(term.id, target.id));

    const forward = !previous || (previous.sessionId === target.sessionId && previous.number < target.number);
    return forward ? carryForward(tx, ctx.schoolId, target) : { carried: 0, classOff: 0 };
  });
}

/**
 * Copies the open enrolments of active students from the latest earlier term
 * of the session with any enrolments into the same classes for the new term.
 * Students already enrolled in it are skipped, so running it twice copies nothing.
 */
async function carryForward(tx: Executor, schoolId: string, target: { id: string; sessionId: string; number: number }): Promise<CarriedForward> {
  const [source] = await tx
    .select({ id: term.id })
    .from(term)
    .innerJoin(enrolment, eq(enrolment.termId, term.id))
    .where(and(eq(term.schoolId, schoolId), eq(term.sessionId, target.sessionId), lt(term.number, target.number)))
    .orderBy(desc(term.number))
    .limit(1);
  if (!source) return { carried: 0, classOff: 0 };

  const copied = await tx.execute(sql`
    insert into enrolment (school_id, student_id, term_id, session_id, class_id, section_id)
    select e.school_id, e.student_id, ${target.id}, e.session_id, e.class_id, e.section_id
    from enrolment e
    join student s on s.id = e.student_id and s.status = 'active'
    join class c on c.id = e.class_id and c.is_active
    where e.school_id = ${schoolId} and e.term_id = ${source.id} and e.withdrawn_on is null
    on conflict (student_id, term_id) do nothing`);
  const [{ n: classOff }] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n
    from enrolment e
    join student s on s.id = e.student_id and s.status = 'active'
    join class c on c.id = e.class_id and not c.is_active
    where e.school_id = ${schoolId} and e.term_id = ${source.id} and e.withdrawn_on is null
      and not exists (select 1 from enrolment n where n.student_id = e.student_id and n.term_id = ${target.id})`).then((r) => r.rows);
  return { carried: copied.rowCount ?? 0, classOff };
}
