import { and, eq } from "drizzle-orm";

import * as t from "@/db/schema";
import { createSeedDb } from "@/db/seed/client";
import { buildSchool } from "@/db/seed/demo-school";
import { seedStandardLists } from "@/db/seed/standard-lists";
import { schoolContext, type SchoolContext } from "@/server/data";
import type { Executor } from "@/server/data/context";

// Two permanent made-up schools on the dev branch. Each test runs inside a
// transaction that is rolled back, so tests never leave changes behind.

export const { db, pool } = createSeedDb();

class Rollback extends Error {}

export async function inRollback(fn: (tx: Executor) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/**
 * Runs a statement in a savepoint. Returns the name of the database constraint
 * that refused it, or null if it was accepted (so tests prove the right rule fired).
 */
export async function refusedBy(tx: Executor, fn: (sp: Executor) => Promise<unknown>): Promise<string | null> {
  try {
    await tx.transaction(async (sp) => {
      await fn(sp);
    });
    return null;
  } catch (error) {
    for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
      const constraint = (e as { constraint?: string }).constraint;
      if (constraint) return constraint;
    }
    throw error;
  }
}

async function ensureSchool(slug: string, code: string, name: string) {
  const found = await db.query.school.findFirst({ where: eq(t.school.slug, slug) });
  if (found) return found.id;
  return db.transaction((tx) => buildSchool(tx, { slug, code, name }));
}

export type Fixture = Awaited<ReturnType<typeof loadFixture>>;

async function loadFixture(schoolId: string) {
  const [terms, sections, classes, offers, students, sessions] = await Promise.all([
    db.select().from(t.term).where(eq(t.term.schoolId, schoolId)),
    db.select().from(t.section).where(eq(t.section.schoolId, schoolId)),
    db.select().from(t.schoolClass).where(eq(t.schoolClass.schoolId, schoolId)),
    db
      .select({ id: t.classSubject.id, classId: t.classSubject.classId, subject: t.schoolSubject.name, subjectId: t.schoolSubject.id })
      .from(t.classSubject)
      .innerJoin(t.schoolSubject, eq(t.schoolSubject.id, t.classSubject.subjectId))
      .where(eq(t.classSubject.schoolId, schoolId)),
    db.select().from(t.student).where(eq(t.student.schoolId, schoolId)),
    db.select().from(t.academicSession).where(eq(t.academicSession.schoolId, schoolId)),
  ]);
  const one = <T>(rows: T[], what: string) => {
    if (rows.length !== 1) throw new Error(`Fixture: expected one ${what}, found ${rows.length}`);
    return rows[0];
  };
  const cls = (name: string) => one(classes.filter((c) => c.name === name), name);
  return {
    schoolId,
    session: one(sessions, "session"),
    term: (n: number) => one(terms.filter((x) => x.number === n), `term ${n}`),
    section: (stage: string) => one(sections.filter((s) => s.stage === stage), stage),
    cls,
    offer: (className: string, subject: string) =>
      one(offers.filter((o) => o.classId === cls(className).id && o.subject === subject), `${className} ${subject}`),
    student: (fullName: string) => one(students.filter((s) => `${s.surname} ${s.otherNames}` === fullName), fullName),
    ctx: (tx: Executor, userId: string | null = "test-user"): SchoolContext => schoolContext({ schoolId, userId, db: tx }),
  };
}

export async function setUpSchools() {
  await seedStandardLists(db);
  const [a, b] = [await ensureSchool("testschoola", "TSA", "Test School A"), await ensureSchool("testschoolb", "TSB", "Test School B")];
  return { a: await loadFixture(a), b: await loadFixture(b) };
}

export async function enrolmentOf(tx: Executor, studentId: string, termId: string) {
  const [row] = await tx
    .select()
    .from(t.enrolment)
    .where(and(eq(t.enrolment.studentId, studentId), eq(t.enrolment.termId, termId)));
  return row;
}
