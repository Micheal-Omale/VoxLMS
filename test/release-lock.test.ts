import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import {
  getClassResults,
  saveRemarks,
  saveScores,
  schoolContext,
  setCurrentTerm,
  TermReleased,
} from "@/server/data";
import type { Executor } from "@/server/data/context";
import { copySessionSetup, saveClassOffer, saveLevelOffer } from "@/server/data/curriculum";
import { saveGradeScale, saveScoreSplit } from "@/server/data/grading";
import { commitStudentImport, planStudentImport } from "@/server/data/imports";
import { makeSlips, type MadeSlips, releaseTerm, withdrawRelease } from "@/server/data/result-pins";
import {
  addStudent,
  moveStudent,
  removeStudent,
  saveClassElectives,
  setStudentLeft,
} from "@/server/data/students";
import { readWorkbook } from "@/server/import/read-workbook";

import { type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0014, AC-4: the release lock against the dev branch.
// While a term is released, every write changing its figures, comments or
// class lists is refused with TermReleased. Writers share lock term rows in id
// order, so a save and a release never cross.

const JSS = "JSS 2 Gold";
let a: Fixture;

beforeAll(async () => {
  ({ a } = await setUpSchools());
});

afterAll(async () => {
  await pool.end();
});

const TEAM_USER = "release-lock-team";

async function teamCtx(tx: Executor) {
  await tx
    .insert(t.user)
    .values({ id: TEAM_USER, name: "Ada Team", email: `${TEAM_USER}@users.voxlms.invalid`, role: "admin" })
    .onConflictDoNothing();
  return schoolContext({ schoolId: a.schoolId, userId: TEAM_USER, db: tx, actor: { kind: "admin", readOnly: false } });
}

const csv = (lines: string[]) => readWorkbook(new TextEncoder().encode(lines.join("\n")), "register.csv", "students");

describe("the release lock (AC-4)", () => {
  it("locks saveScores and saveRemarks while a term is released, and lifts after withdraw", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const termId = a.term(1).id;
      const results = await getClassResults(ctx, { classId: a.cls(JSS).id });
      const subject = results.subjects[0];
      const student = results.students[0];
      const part = results.split[0];

      await releaseTerm(ctx, { termId });

      // saveScores is refused
      await expect(
        saveScores(ctx, {
          termId,
          classSubjectId: subject.classSubjectId,
          saveId: randomUUID(),
          changes: [{ studentId: student.studentId, componentKey: part.key, expected: null, value: "15" }],
        }),
      ).rejects.toThrow(TermReleased);

      // saveRemarks is refused
      await expect(
        saveRemarks(ctx, {
          termId,
          classId: a.cls(JSS).id,
          saveId: randomUUID(),
          changes: [{ studentId: student.studentId, field: "teacher", expected: null, value: "Great work this term." }],
        }),
      ).rejects.toThrow(TermReleased);

      // Withdrawing release unlocks both
      await withdrawRelease(ctx, { termId });

      const scoreSaved = await saveScores(ctx, {
        termId,
        classSubjectId: subject.classSubjectId,
        saveId: randomUUID(),
        changes: [{ studentId: student.studentId, componentKey: part.key, expected: null, value: "15" }],
      });
      expect(scoreSaved.changed).toBe(1);

      const remarkSaved = await saveRemarks(ctx, {
        termId,
        classId: a.cls(JSS).id,
        saveId: randomUUID(),
        changes: [{ studentId: student.studentId, field: "teacher", expected: null, value: "Great work this term." }],
      });
      expect(remarkSaved.changed).toBe(1);
    });
  });

  it("refuses student writers (add, move, left, electives, import) while the term is released", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const termId = a.term(1).id;
      const results = await getClassResults(ctx, { classId: a.cls(JSS).id });
      const firstStudent = results.students[0];
      const [firstEnrolment] = await tx
        .select({ id: t.enrolment.id })
        .from(t.enrolment)
        .where(and(eq(t.enrolment.studentId, firstStudent.studentId), eq(t.enrolment.termId, termId)));

      await releaseTerm(ctx, { termId });

      // addStudent throws TermReleased
      await expect(
        addStudent(ctx, {
          classId: a.cls(JSS).id,
          surname: "ZIK",
          otherNames: "Chidi",
          gender: "male",
          confirmDuplicate: false,
        }),
      ).rejects.toThrow(TermReleased);

      // moveStudent throws TermReleased
      await expect(
        moveStudent(ctx, {
          enrolmentId: firstEnrolment.id,
          toClassId: a.cls("SS 1 Science").id,
        }),
      ).rejects.toThrow(TermReleased);

      // setStudentLeft throws TermReleased
      await expect(
        setStudentLeft(ctx, {
          studentId: firstStudent.studentId,
          leftOn: "2026-11-15",
        }),
      ).rejects.toThrow(TermReleased);

      // saveClassElectives throws TermReleased
      await expect(
        saveClassElectives(ctx, {
          classId: a.cls(JSS).id,
          ticks: [],
        }),
      ).rejects.toThrow(TermReleased);

      // commitStudentImport throws TermReleased
      const lines = [
        "Surname,Other Names,Gender,Class",
        `NEWKID,Tester,M,${JSS}`,
      ];
      const grid = await csv(lines);
      const plan = await planStudentImport(ctx, grid);
      await expect(
        commitStudentImport(ctx, {
          grid,
          fileName: "register.csv",
          termId,
          planHash: plan.planHash,
          addAnyway: [],
        }),
      ).rejects.toThrow(TermReleased);
    });
  });

  it("refuses removeStudent when enrolled in a released term, and counts slips as records", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const termId = a.term(1).id;

      // 1. Add a fresh student with no scores
      const added = await addStudent(ctx, {
        classId: a.cls(JSS).id,
        surname: "FRESH",
        otherNames: "Kid",
        gender: "female",
        confirmDuplicate: false,
      });
      if (!added.ok || !("studentId" in added)) throw new Error("Could not add student");

      // 2. Release the term -> removeStudent throws TermReleased
      await releaseTerm(ctx, { termId });
      await expect(removeStudent(ctx, { studentId: added.studentId })).rejects.toThrow(TermReleased);

      // 3. Withdraw release -> print a slip for the student
      await withdrawRelease(ctx, { termId });
      const keep = async (made: MadeSlips) => made;
      await makeSlips(ctx, { do: "one", enrolmentId: (await tx.select().from(t.enrolment).where(and(eq(t.enrolment.studentId, added.studentId), eq(t.enrolment.termId, termId))))[0].id }, "voxlms.test", keep);

      // 4. Now the student has a slip: removeStudent is refused because the student has records
      const res = await removeStudent(ctx, { studentId: added.studentId });
      expect(res).toMatchObject({ ok: false, field: "student", error: "This student already has results records, so can only be marked as left." });
    });
  });

  it("refuses session-wide grading and curriculum setup when any term of the session is released", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const termId = a.term(1).id;
      const sessionId = a.session.id;
      const sec = a.section("junior_secondary");

      await releaseTerm(ctx, { termId });

      // saveScoreSplit is refused
      await expect(
        saveScoreSplit(ctx, {
          sectionId: sec.id,
          sessionId,
          parts: [{ label: "Exam", max: 100 }],
        }),
      ).rejects.toThrow(TermReleased);

      // saveGradeScale is refused
      await expect(
        saveGradeScale(ctx, {
          sectionId: sec.id,
          sessionId,
          bands: [
            { grade: "A", min: 70, remark: "Excellent" },
            { grade: "F", min: 0, remark: "Fail" },
          ],
        }),
      ).rejects.toThrow(TermReleased);

      // saveLevelOffer is refused
      const [level] = await tx.select({ id: t.standardLevel.id }).from(t.standardLevel).limit(1);
      const [sub] = await tx
        .select({ id: t.schoolSubject.id })
        .from(t.schoolSubject)
        .where(eq(t.schoolSubject.schoolId, a.schoolId))
        .limit(1);
      await expect(
        saveLevelOffer(ctx, {
          levelId: level.id,
          sessionId,
          changes: [{ subjectId: sub.id, offered: true, isElective: false }],
        }),
      ).rejects.toThrow(TermReleased);

      // saveClassOffer is refused
      await expect(
        saveClassOffer(ctx, {
          classId: a.cls(JSS).id,
          sessionId,
          subjects: [],
        }),
      ).rejects.toThrow(TermReleased);

      // copySessionSetup into that session is refused
      const [otherSession] = await tx
        .insert(t.academicSession)
        .values({
          schoolId: a.schoolId,
          name: "2025/2026",
          startsOn: "2025-09-01",
          endsOn: "2026-07-31",
        })
        .returning({ id: t.academicSession.id });
      await expect(
        copySessionSetup(ctx, {
          fromSessionId: otherSession.id,
          toSessionId: sessionId,
        }),
      ).rejects.toThrow(TermReleased);

      // Withdraw release -> each works again
      await withdrawRelease(ctx, { termId });
      const gradeRes = await saveGradeScale(ctx, {
        sectionId: sec.id,
        sessionId,
        bands: [
          { grade: "A", min: 70, remark: "Excellent" },
          { grade: "F", min: 0, remark: "Fail" },
        ],
      });
      expect(gradeRes.ok).toBe(true);
    });
  });

  it("switching setCurrentTerm back and then forward to a released term carries no students into it", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const term1 = a.term(1).id;
      const term2 = a.term(2).id;

      // Switch to term 2 so it is current
      await setCurrentTerm(ctx, { termId: term2 });
      // Release term 2
      await releaseTerm(ctx, { termId: term2 });
      // Switch back to term 1
      await setCurrentTerm(ctx, { termId: term1 });

      // Switch forward to term 2: carries 0 students because term 2 is released
      const carried = await setCurrentTerm(ctx, { termId: term2 });
      expect(carried.carried).toBe(0);

      // Term 2 is current
      const [current] = await tx.select({ id: t.term.id, isCurrent: t.term.isCurrent }).from(t.term).where(and(eq(t.term.schoolId, a.schoolId), eq(t.term.id, term2)));
      expect(current.isCurrent).toBe(true);
    });
  });
});
