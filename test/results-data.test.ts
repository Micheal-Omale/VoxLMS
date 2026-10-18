import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { type Actor, getClassResults, loadClassResults, NoCurrentTerm, NotFound, saveScores, schoolContext, setCurrentTerm } from "@/server/data";
import type { Executor } from "@/server/data/context";

import { db, type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0010 (results computation) loader, against the dev branch. Every test rolls back.

const JSS = "JSS 2 Gold";
const SS = "SS 1 Science";

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  ({ a, b } = await setUpSchools());
});

afterAll(async () => {
  await pool.end();
});

const team: Actor = { kind: "admin", readOnly: false };
const teamCtx = (tx: Executor) => schoolContext({ schoolId: a.schoolId, userId: "team", db: tx, actor: team });

/** Funke Adewale is form teacher of JSS 2 Gold. */
async function funke(tx: Executor) {
  const [member] = await tx.select().from(t.staff).where(and(eq(t.staff.schoolId, a.schoolId), eq(t.staff.fullName, "Funke Adewale")));
  return schoolContext({ schoolId: a.schoolId, userId: "teacher", db: tx, actor: { kind: "teacher", staffId: member.id, readOnly: false } });
}

const jss = () => ({ classId: a.cls(JSS).id });
const maths = (r: Awaited<ReturnType<typeof loadClassResults>>) => r.subjects.find((s) => s.name === "Mathematics")!;
const who = (r: Awaited<ReturnType<typeof loadClassResults>>, fullName: string) => r.students.find((s) => `${s.surname} ${s.otherNames}` === fullName)!;

/** Fills every JSS 2 Gold subject except Mathematics for one student with 10, 10, 30. */
async function fillOtherSubjects(tx: Executor, studentName: string) {
  const offers = await tx
    .select({ id: t.classSubject.id, name: t.schoolSubject.name })
    .from(t.classSubject)
    .innerJoin(t.schoolSubject, eq(t.schoolSubject.id, t.classSubject.subjectId))
    .where(eq(t.classSubject.classId, a.cls(JSS).id));
  const others = offers.filter((o) => o.name !== "Mathematics");
  for (const offer of others) {
    await saveScores(teamCtx(tx), {
      termId: a.term(1).id,
      classSubjectId: offer.id,
      saveId: randomUUID(),
      changes: [
        { studentId: a.student(studentName).id, componentKey: "ca1", expected: null, value: "10" },
        { studentId: a.student(studentName).id, componentKey: "ca2", expected: null, value: "10" },
        { studentId: a.student(studentName).id, componentKey: "exam", expected: null, value: "30" },
      ],
    });
  }
  return others.length;
}

describe("the demo class's figures (AC-1, AC-2, AC-5, AC-7)", () => {
  it("works out Mathematics from the seeded scores, and keeps the class provisional", async () => {
    await inRollback(async (tx) => {
      const r = await getClassResults(teamCtx(tx), jss());
      expect(r).toMatchObject({
        cls: { name: JSS },
        term: { id: a.term(1).id, number: 1, isCurrent: true },
        section: { name: expect.any(String) },
        hasGradeScale: true,
        numberInClass: 16,
        incompleteCount: 16,
        final: false,
        classAverage: null,
      });
      expect(r.split.map((p) => p.key)).toEqual(["ca1", "ca2", "exam"]);
      // Ten students have all three parts: 80 65 91 47 72 71 83 96 63 76 → 744 / 10 = 74.40.
      expect(maths(r)).toMatchObject({ takers: 16, completeTakers: 10, classAverage: 7440, highest: 960, lowest: 470, provisional: true });
      const sub = (name: string) => who(r, name).subjects.find((s) => s.classSubjectId === maths(r).classSubjectId)!;
      expect(sub("Nwosu Ifeoma")).toMatchObject({ total: 960, grade: "A", position: 1 });
      expect(sub("Afolabi Temitope")).toMatchObject({ total: 470, grade: "D", position: 10 });
      expect(sub("Danjuma Zainab")).toMatchObject({ total: null, position: null, missing: ["CA 2", "Exam"] });
      expect(who(r, "Musa Aisha").missing).toContainEqual({ subjectName: "Mathematics", partLabels: ["CA 2"] });
    });
  });

  it("ranks a student once every subject is in, reading the scores saved in the same snapshot (AC-2, AC-11)", async () => {
    await inRollback(async (tx) => {
      const others = await fillOtherSubjects(tx, "Nwosu Ifeoma");
      // These saves are not committed: only a loader reading through the given ctx.db can see them.
      const r = await loadClassResults(teamCtx(tx), jss());
      // 96 + 7 × 50 = 446 over 8 subjects = 55.75.
      expect(others).toBe(7);
      expect(who(r, "Nwosu Ifeoma")).toMatchObject({ status: "ranked", total: 4460, average: 5575, position: 1, missing: [] });
      expect(r.students[0].surname).toBe("Nwosu");
      expect(r).toMatchObject({ incompleteCount: 15, final: false, classAverage: 5575 });
    });
  });

  it("follows a grade band change on the next read (AC-7)", async () => {
    await inRollback(async (tx) => {
      await tx
        .update(t.gradeBand)
        .set({ minScore: "97" })
        .where(and(eq(t.gradeBand.sectionId, a.section("junior_secondary").id), eq(t.gradeBand.grade, "A")));
      const r = await getClassResults(teamCtx(tx), jss());
      const sub = who(r, "Nwosu Ifeoma").subjects.find((s) => s.classSubjectId === maths(r).classSubjectId)!;
      expect(sub).toMatchObject({ total: 960, grade: "B" });
    });
  });

  it("makes everyone incomplete when a part is added to the split (AC-7)", async () => {
    await inRollback(async (tx) => {
      await tx.insert(t.assessmentComponent).values({
        schoolId: a.schoolId,
        sectionId: a.section("junior_secondary").id,
        sessionId: a.session.id,
        key: "ca3",
        label: "CA 3",
        maxScore: "10",
        sortOrder: 4,
      });
      const r = await getClassResults(teamCtx(tx), jss());
      expect(maths(r)).toMatchObject({ completeTakers: 0, classAverage: null, highest: null });
      expect(who(r, "Nwosu Ifeoma").missing).toContainEqual({ subjectName: "Mathematics", partLabels: ["CA 3"] });
    });
  });

  it("shows grades as dashes without a scale, and no figures without a split (AC-1, AC-9)", async () => {
    await inRollback(async (tx) => {
      const junior = a.section("junior_secondary").id;
      await tx.delete(t.gradeBand).where(eq(t.gradeBand.sectionId, junior));
      const noScale = await getClassResults(teamCtx(tx), jss());
      expect(noScale.hasGradeScale).toBe(false);
      expect(maths(noScale)).toMatchObject({ completeTakers: 10, highest: 960 });
      expect(who(noScale, "Nwosu Ifeoma").subjects.find((s) => s.total !== null)).toMatchObject({ grade: null, remark: null, position: 1 });

      await tx.delete(t.score).where(eq(t.score.sectionId, junior));
      await tx.delete(t.scoreChange).where(eq(t.scoreChange.classSubjectId, a.offer(JSS, "Mathematics").id));
      await tx.delete(t.assessmentComponent).where(eq(t.assessmentComponent.sectionId, junior));
      const noSplit = await getClassResults(teamCtx(tx), jss());
      expect(noSplit).toMatchObject({ split: [], final: false, incompleteCount: 16 });
    });
  });
});

describe("who is in the class (AC-1, AC-4)", () => {
  it("leaves a withdrawn student out of every figure", async () => {
    await inRollback(async (tx) => {
      await tx
        .update(t.enrolment)
        .set({ withdrawnOn: "2026-10-01" })
        .where(and(eq(t.enrolment.studentId, a.student("Nwosu Ifeoma").id), eq(t.enrolment.termId, a.term(1).id)));
      const r = await getClassResults(teamCtx(tx), jss());
      expect(r.numberInClass).toBe(15);
      expect(r.students.some((s) => s.surname === "Nwosu")).toBe(false);
      // 744 − 96 = 648 over 9 = 72.00; the highest is now Adeyemi's 91.
      expect(maths(r)).toMatchObject({ takers: 15, completeTakers: 9, classAverage: 7200, highest: 910 });
    });
  });

  it("counts only registered students for an elective, and once when it becomes compulsory", async () => {
    await inRollback(async (tx) => {
      const before = await getClassResults(teamCtx(tx), { classId: a.cls(SS).id });
      const further = before.subjects.find((s) => s.name === "Further Mathematics")!;
      expect(further).toMatchObject({ isElective: true, takers: 3 });
      expect(who(before, "Adebayo Kehinde").subjects).toHaveLength(7);

      await tx.update(t.classSubject).set({ isElective: false }).where(eq(t.classSubject.id, further.classSubjectId));
      const after = await getClassResults(teamCtx(tx), { classId: a.cls(SS).id });
      expect(after.subjects.find((s) => s.name === "Further Mathematics")).toMatchObject({ isElective: false, takers: 6 });
      const kehinde = who(after, "Adebayo Kehinde").subjects.map((s) => s.classSubjectId);
      expect(kehinde).toHaveLength(7);
      expect(new Set(kehinde).size).toBe(7);
    });
  });

  it("lists compulsory subjects first, then electives, in the school's order", async () => {
    await inRollback(async (tx) => {
      // Set the school order explicitly: the test school may predate it.
      const order = ["English Studies", "Mathematics", "Civic Education", "Physics", "Chemistry", "Biology", "Further Mathematics", "Agricultural Science", "Economics"];
      for (const [i, name] of order.entries()) {
        await tx.update(t.schoolSubject).set({ sortOrder: i + 1 }).where(and(eq(t.schoolSubject.schoolId, a.schoolId), eq(t.schoolSubject.name, name)));
      }
      // Economics before Agricultural Science would show the electives follow the school order, not the name.
      await tx.update(t.schoolSubject).set({ sortOrder: 0 }).where(and(eq(t.schoolSubject.schoolId, a.schoolId), eq(t.schoolSubject.name, "Economics")));
      const r = await getClassResults(teamCtx(tx), { classId: a.cls(SS).id });
      expect(r.subjects.map((s) => s.name)).toEqual([
        "English Studies", "Mathematics", "Civic Education", "Physics", "Chemistry", "Biology",
        "Economics", "Further Mathematics", "Agricultural Science",
      ]);
    });
  });
});

describe("terms (AC-8, AC-10)", () => {
  it("reads an earlier term of the session by id, and the current term by default", async () => {
    await inRollback(async (tx) => {
      await setCurrentTerm(teamCtx(tx), { termId: a.term(2).id });
      const now = await getClassResults(teamCtx(tx), jss());
      expect(now.term).toMatchObject({ id: a.term(2).id, isCurrent: true });
      expect(maths(now).completeTakers).toBe(0);
      const earlier = await getClassResults(teamCtx(tx), { ...jss(), termId: a.term(1).id });
      expect(earlier.term).toMatchObject({ id: a.term(1).id, isCurrent: false });
      expect(maths(earlier).completeTakers).toBe(10);
    });
  });

  it("gives not found for a later term, or a term of another session", async () => {
    await inRollback(async (tx) => {
      await expect(getClassResults(teamCtx(tx), { ...jss(), termId: a.term(2).id })).rejects.toBeInstanceOf(NotFound);
      const [session] = await tx
        .insert(t.academicSession)
        .values({ schoolId: a.schoolId, name: "2027/2028", startsOn: "2027-09-13", endsOn: "2028-07-21" })
        .returning();
      const [other] = await tx
        .insert(t.term)
        .values({ schoolId: a.schoolId, sessionId: session.id, number: 1, startsOn: "2027-09-13", endsOn: "2027-12-10" })
        .returning();
      await expect(getClassResults(teamCtx(tx), { ...jss(), termId: other.id })).rejects.toBeInstanceOf(NotFound);
      await expect(getClassResults(teamCtx(tx), { ...jss(), termId: b.term(1).id })).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("who may see results (AC-10)", () => {
  it("lets a form teacher see their own class, and nothing else", async () => {
    await inRollback(async (tx) => {
      const ctx = await funke(tx);
      await expect(getClassResults(ctx, jss())).resolves.toMatchObject({ numberInClass: 16 });
      await expect(getClassResults(ctx, { classId: a.cls(SS).id })).rejects.toBeInstanceOf(NotFound);
    });
  });

  it("lets our team see any class, also while viewing as someone", async () => {
    await inRollback(async (tx) => {
      const viewing = schoolContext({ schoolId: a.schoolId, userId: "team", db: tx, actor: { kind: "admin", readOnly: true } });
      await expect(getClassResults(viewing, { classId: a.cls(SS).id })).resolves.toMatchObject({ numberInClass: 6 });
    });
  });

  it("looks every class id up within the school", async () => {
    await inRollback(async (tx) => {
      await expect(getClassResults(teamCtx(tx), { classId: b.cls(JSS).id })).rejects.toBeInstanceOf(NotFound);
      await expect(getClassResults(teamCtx(tx), { classId: randomUUID() })).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("one consistent read (AC-11)", () => {
  it("runs in a real read only snapshot on the shared client, not just a savepoint", async () => {
    // Every other test runs inside a rolled back transaction, where readSnapshot is a savepoint.
    // This one opens the real "repeatable read, read only" transaction; it writes nothing.
    const ctx = schoolContext({ schoolId: a.schoolId, userId: "team", db, actor: team });
    const r = await getClassResults(ctx, jss());
    expect(r).toMatchObject({ numberInClass: 16, final: false });
    expect(maths(r).completeTakers).toBe(10);
  });
});

describe("no current term (AC-9)", () => {
  it("refuses with NoCurrentTerm, which the class page turns into its existing state", async () => {
    await inRollback(async (tx) => {
      await tx.update(t.term).set({ isCurrent: false }).where(eq(t.term.schoolId, a.schoolId));
      await expect(getClassResults(teamCtx(tx), jss())).rejects.toBeInstanceOf(NoCurrentTerm);
    });
  });
});
