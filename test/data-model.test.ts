import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { normaliseNigerianPhone } from "@/lib/phone";
import { displayStudentId, formatStudentNo } from "@/lib/student-number";
import {
  allocateStudentNumbers,
  Conflict,
  getCurrentTerm,
  getGradeBands,
  getScoreSheet,
  getStudentSessionResults,
  InvalidScore,
  linkGuardian,
  listClassStudents,
  NotFound,
  NotTakingSubject,
  ScoreAboveMaximum,
  saveScores,
  setCurrentTerm,
  TooManyGuardians,
} from "@/server/data";
import type { Executor } from "@/server/data/context";

import { db, enrolmentOf, type Fixture, inRollback, pool, refusedBy, setUpSchools } from "./db";

// Spec 0003 acceptance criteria, against the dev branch. Every test rolls back.

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

async function part(tx: Executor, f: Fixture, stage: string, key: string) {
  const [row] = await tx
    .select()
    .from(t.assessmentComponent)
    .where(and(eq(t.assessmentComponent.sectionId, f.section(stage).id), eq(t.assessmentComponent.sessionId, f.session.id), eq(t.assessmentComponent.key, key)));
  return row;
}

const save = (f: Fixture, tx: Executor, offerId: string, changes: { studentId: string; componentKey: string; expected: string | null; value: string | null }[], saveId = randomUUID(), term = 1) =>
  saveScores(f.ctx(tx), { termId: f.term(term).id, classSubjectId: offerId, saveId, changes });

describe("AC-1, AC-12: migration and shared lists", () => {
  it("has the standard levels and subjects", async () => {
    const levels = await db.select({ code: t.standardLevel.code }).from(t.standardLevel);
    expect(levels.map((l) => l.code)).toEqual(expect.arrayContaining(["CRECHE", "PRY1", "JSS2", "SS3"]));
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.standardSubject);
    expect(n).toBeGreaterThanOrEqual(30);
  });
});

describe("AC-4: scores", () => {
  it("saves, reads back, and logs a new set of scores", async () => {
    await inRollback(async (tx) => {
      const offer = a.offer(JSS, "Basic Science");
      const ojo = a.student("Ojo Precious");
      const saveId = randomUUID();
      const result = await save(a, tx, offer.id, [
        { studentId: ojo.id, componentKey: "ca1", expected: null, value: "18" },
        { studentId: ojo.id, componentKey: "ca2", expected: null, value: "12.5" },
        { studentId: ojo.id, componentKey: "exam", expected: null, value: "50" },
      ], saveId);
      expect(result.changed).toBe(3);
      const sheet = await getScoreSheet(a.ctx(tx), { termId: a.term(1).id, classSubjectId: offer.id });
      expect(sheet.scores[ojo.id]).toEqual({ ca1: "18", ca2: "12.5", exam: "50" });
      const log = await tx.select().from(t.scoreChange).where(eq(t.scoreChange.saveId, saveId));
      expect(log).toHaveLength(3);
      expect(log.every((row) => row.oldValue === null && row.changedBy === "test-user")).toBe(true);
    });
  });

  it("keeps a missing score missing, never 0", async () => {
    await inRollback(async (tx) => {
      const sheet = await getScoreSheet(a.ctx(tx), { termId: a.term(1).id, classSubjectId: a.offer(JSS, "Mathematics").id });
      expect(sheet.scores[a.student("Danjuma Zainab").id]).toEqual({ ca1: "18" });
      expect(sheet.scores[a.student("Ojo Precious").id]).toBeUndefined();
      expect(sheet.components.map((c) => [c.key, c.max])).toEqual([["ca1", 20], ["ca2", 20], ["exam", 60]]);
    });
  });

  it.each(["12.35", "-1", "abc", "1000", "7."])("refuses %s instead of rounding it", async (value) => {
    await inRollback(async (tx) => {
      const offer = a.offer(JSS, "Basic Science");
      await expect(save(a, tx, offer.id, [{ studentId: a.student("Ojo Precious").id, componentKey: "ca1", expected: null, value }])).rejects.toBeInstanceOf(InvalidScore);
    });
  });

  it("refuses a score above its part's maximum, naming the part", async () => {
    await inRollback(async (tx) => {
      const attempt = save(a, tx, a.offer(JSS, "Basic Science").id, [{ studentId: a.student("Ojo Precious").id, componentKey: "ca1", expected: null, value: "25" }]);
      await expect(attempt).rejects.toBeInstanceOf(ScoreAboveMaximum);
      await expect(attempt).rejects.toThrow("CA 1 is out of 20. You wrote 25.");
    });
  });

  it("removes the row when a score is cleared, and logs it", async () => {
    await inRollback(async (tx) => {
      const offer = a.offer(JSS, "Mathematics");
      const okon = a.student("Okon Emem");
      const saveId = randomUUID();
      await save(a, tx, offer.id, [{ studentId: okon.id, componentKey: "exam", expected: "45", value: null }], saveId);
      const sheet = await getScoreSheet(a.ctx(tx), { termId: a.term(1).id, classSubjectId: offer.id });
      expect(sheet.scores[okon.id]).toEqual({ ca1: "15", ca2: "16" });
      const [log] = await tx.select().from(t.scoreChange).where(eq(t.scoreChange.saveId, saveId));
      expect([log.oldValue, log.newValue]).toEqual(["45.0", null]);
    });
  });

  it("refuses a part that doesn't belong to the class's section", async () => {
    await inRollback(async (tx) => {
      await expect(save(a, tx, a.offer(JSS, "Mathematics").id, [{ studentId: a.student("Ojo Precious").id, componentKey: "ca", expected: null, value: "10" }])).rejects.toBeInstanceOf(InvalidScore);
    });
  });
});

describe("AC-5: saving is all or nothing, conflict safe and repeatable", () => {
  it("saves nothing when any score in the save is wrong", async () => {
    await inRollback(async (tx) => {
      const offer = a.offer(JSS, "Basic Science");
      await expect(save(a, tx, offer.id, [
        { studentId: a.student("Ojo Precious").id, componentKey: "ca1", expected: null, value: "10" },
        { studentId: a.student("Etim Blessing").id, componentKey: "ca1", expected: null, value: "21" },
      ])).rejects.toBeInstanceOf(ScoreAboveMaximum);
      const sheet = await getScoreSheet(a.ctx(tx), { termId: a.term(1).id, classSubjectId: offer.id });
      expect(sheet.scores).toEqual({});
    });
  });

  it("refuses a save made from a stale value and changes nothing", async () => {
    await inRollback(async (tx) => {
      const offer = a.offer(JSS, "Mathematics");
      const okon = a.student("Okon Emem");
      await expect(save(a, tx, offer.id, [{ studentId: okon.id, componentKey: "ca1", expected: "14", value: "16" }])).rejects.toBeInstanceOf(Conflict);
      const sheet = await getScoreSheet(a.ctx(tx), { termId: a.term(1).id, classSubjectId: offer.id });
      expect(sheet.scores[okon.id].ca1).toBe("15");
    });
  });

  it("lets a save that already landed be sent again without changing or logging anything", async () => {
    await inRollback(async (tx) => {
      const offer = a.offer(JSS, "Mathematics");
      const okon = a.student("Okon Emem");
      const saveId = randomUUID();
      const change = [{ studentId: okon.id, componentKey: "ca1", expected: "15", value: "16" }];
      expect((await save(a, tx, offer.id, change, saveId)).changed).toBe(1);
      expect((await save(a, tx, offer.id, change, saveId)).changed).toBe(0);
      expect(await tx.select().from(t.scoreChange).where(eq(t.scoreChange.saveId, saveId))).toHaveLength(1);
    });
  });
});

describe("AC-2: the database refuses mismatched links", () => {
  it("refuses a score whose subject belongs to another class", async () => {
    await inRollback(async (tx) => {
      const enrolment = await enrolmentOf(tx, a.student("Ojo Precious").id, a.term(1).id);
      const ca1 = await part(tx, a, "junior_secondary", "ca1");
      const physics = a.offer(SS, "Physics");
      expect(await refusedBy(tx, (sp) => sp.insert(t.score).values({
        schoolId: a.schoolId, enrolmentId: enrolment.id, classSubjectId: physics.id, componentId: ca1.id,
        classId: enrolment.classId, sessionId: enrolment.sessionId, sectionId: enrolment.sectionId, value: "10", updatedBy: "sql",
      }))).toBe("score_class_subject_fk");
    });
  });

  it("refuses a score whose part belongs to another section", async () => {
    await inRollback(async (tx) => {
      const enrolment = await enrolmentOf(tx, a.student("Ojo Precious").id, a.term(1).id);
      const seniorCa1 = await part(tx, a, "senior_secondary", "ca1");
      expect(await refusedBy(tx, (sp) => sp.insert(t.score).values({
        schoolId: a.schoolId, enrolmentId: enrolment.id, classSubjectId: a.offer(JSS, "Mathematics").id, componentId: seniorCa1.id,
        classId: enrolment.classId, sessionId: enrolment.sessionId, sectionId: enrolment.sectionId, value: "10", updatedBy: "sql",
      }))).toBe("score_component_fk");
    });
  });

  it("refuses an enrolment joining one school's student to another school's class", async () => {
    await inRollback(async (tx) => {
      const base = { studentId: a.student("Ojo Precious").id, termId: a.term(2).id, sessionId: a.session.id };
      expect(await refusedBy(tx, (sp) => sp.insert(t.enrolment).values({ ...base, schoolId: a.schoolId, classId: b.cls(JSS).id, sectionId: b.section("junior_secondary").id }))).toBe("enrolment_class_fk");
      expect(await refusedBy(tx, (sp) => sp.insert(t.enrolment).values({ ...base, schoolId: b.schoolId, classId: b.cls(JSS).id, sectionId: b.section("junior_secondary").id }))).toMatch(/^enrolment_(student|term)_fk$/);
    });
  });
});

describe("AC-3: one school can never reach another's records", () => {
  it("returns NotFound for every read and write of school A made with school B's context", async () => {
    await inRollback(async (tx) => {
      const ctxB = b.ctx(tx);
      const offer = a.offer(JSS, "Mathematics");
      await expect(getScoreSheet(ctxB, { termId: a.term(1).id, classSubjectId: offer.id })).rejects.toBeInstanceOf(NotFound);
      await expect(listClassStudents(ctxB, { termId: a.term(1).id, classId: a.cls(JSS).id })).rejects.toBeInstanceOf(NotFound);
      await expect(getStudentSessionResults(ctxB, { studentId: a.student("Okon Emem").id, sessionId: a.session.id })).rejects.toBeInstanceOf(NotFound);
      await expect(saveScores(ctxB, { termId: a.term(1).id, classSubjectId: offer.id, saveId: randomUUID(), changes: [{ studentId: a.student("Okon Emem").id, componentKey: "ca1", expected: "15", value: "1" }] })).rejects.toBeInstanceOf(NotFound);
      // Using school B's own term with school A's subject is just as refused.
      await expect(getScoreSheet(ctxB, { termId: b.term(1).id, classSubjectId: offer.id })).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("AC-6: enrolment per term", () => {
  it("returns terms a student wasn't in as absent, and follows a change of class", async () => {
    await inRollback(async (tx) => {
      const junior = a.section("junior_secondary");
      const [blue] = await tx.insert(t.schoolClass).values({ schoolId: a.schoolId, sectionId: junior.id, stage: "junior_secondary", standardLevelId: a.cls(JSS).standardLevelId, arm: "Blue", name: "JSS 2 Blue" }).returning();
      const [ada] = await tx.insert(t.student).values({ schoolId: a.schoolId, studentNo: 9101, admissionNo: "TEST/NEW/1", surname: "Newcomer", otherNames: "Ada", gender: "female" }).returning();
      await tx.insert(t.enrolment).values({ schoolId: a.schoolId, studentId: ada.id, termId: a.term(2).id, sessionId: a.session.id, classId: blue.id, sectionId: junior.id });
      const obi = a.student("Obi Uchenna");
      await tx.insert(t.enrolment).values({ schoolId: a.schoolId, studentId: obi.id, termId: a.term(2).id, sessionId: a.session.id, classId: blue.id, sectionId: junior.id });

      const adaResults = await getStudentSessionResults(a.ctx(tx), { studentId: ada.id, sessionId: a.session.id });
      expect(adaResults.map((r) => r.enrolment?.className ?? null)).toEqual([null, "JSS 2 Blue", null]);
      const obiResults = await getStudentSessionResults(a.ctx(tx), { studentId: obi.id, sessionId: a.session.id });
      expect(obiResults.map((r) => r.enrolment?.className ?? null)).toEqual([JSS, "JSS 2 Blue", null]);
      expect(obiResults[0].subjects.find((s) => s.name === "Mathematics")?.scores).toEqual({ ca1: "13", ca2: "12", exam: "38" });
      expect(await refusedBy(tx, (sp) => sp.insert(t.enrolment).values({ schoolId: a.schoolId, studentId: obi.id, termId: a.term(2).id, sessionId: a.session.id, classId: a.cls(JSS).id, sectionId: junior.id }))).toBe("enrolment_student_term_key");
    });
  });
});

describe("AC-7: grade scales belong to a section and session", () => {
  it("changes this session's grades without touching another session", async () => {
    await inRollback(async (tx) => {
      const junior = a.section("junior_secondary");
      const [last] = await tx.insert(t.academicSession).values({ schoolId: a.schoolId, name: "2025/2026", startsOn: "2025-09-15", endsOn: "2026-07-24" }).returning();
      await tx.insert(t.gradeBand).values({ schoolId: a.schoolId, sectionId: junior.id, sessionId: last.id, grade: "A", minScore: "70", remark: "Excellent" });
      await tx.update(t.gradeBand).set({ minScore: "75" }).where(and(eq(t.gradeBand.sectionId, junior.id), eq(t.gradeBand.sessionId, a.session.id), eq(t.gradeBand.grade, "A")));

      const now = await getGradeBands(a.ctx(tx), { sectionId: junior.id, sessionId: a.session.id });
      const before = await getGradeBands(a.ctx(tx), { sectionId: junior.id, sessionId: last.id });
      expect(now[0]).toMatchObject({ grade: "A", min: 75 });
      expect(before[0]).toMatchObject({ grade: "A", min: 70 });
    });
  });
});

describe("AC-8: electives", () => {
  it("only lists and scores students registered for an elective, even after a change of arm", async () => {
    await inRollback(async (tx) => {
      const furtherMaths = a.offer(SS, "Further Mathematics");
      const sheet = await getScoreSheet(a.ctx(tx), { termId: a.term(1).id, classSubjectId: furtherMaths.id });
      expect(sheet.students.map((s) => s.surname).sort()).toEqual(["Adebayo", "Chukwu", "Udo"]);

      await expect(save(a, tx, furtherMaths.id, [{ studentId: a.student("Lawal Maryam").id, componentKey: "ca1", expected: null, value: "10" }])).rejects.toBeInstanceOf(NotTakingSubject);
      await save(a, tx, furtherMaths.id, [{ studentId: a.student("Udo Godswill").id, componentKey: "ca1", expected: null, value: "10" }]);

      // Udo moves to SS 1 Science B in second term and keeps Further Mathematics.
      const senior = a.section("senior_secondary");
      const [scienceB] = await tx.insert(t.schoolClass).values({ schoolId: a.schoolId, sectionId: senior.id, stage: "senior_secondary", standardLevelId: a.cls(SS).standardLevelId, arm: "Science B", name: "SS 1 Science B" }).returning();
      const [fmB] = await tx.insert(t.classSubject).values({ schoolId: a.schoolId, sessionId: a.session.id, classId: scienceB.id, sectionId: senior.id, subjectId: furtherMaths.subjectId, isElective: true }).returning();
      await tx.insert(t.enrolment).values({ schoolId: a.schoolId, studentId: a.student("Udo Godswill").id, termId: a.term(2).id, sessionId: a.session.id, classId: scienceB.id, sectionId: senior.id });
      const result = await save(a, tx, fmB.id, [{ studentId: a.student("Udo Godswill").id, componentKey: "ca1", expected: null, value: "14" }], randomUUID(), 2);
      expect(result.changed).toBe(1);
    });
  });
});

describe("AC-9: parents", () => {
  it("lets siblings share a parent and parents share a phone, but not a third parent or a second primary", async () => {
    await inRollback(async (tx) => {
      const ctx = a.ctx(tx);
      const [{ kids }] = await tx
        .select({ kids: sql<number>`count(*)::int` })
        .from(t.studentGuardian)
        .innerJoin(t.guardian, eq(t.guardian.id, t.studentGuardian.guardianId))
        .where(and(eq(t.guardian.schoolId, a.schoolId), eq(t.guardian.fullName, "Mr Tunde Adebayo")));
      expect(kids).toBe(2);

      const eze = a.student("Eze Chukwuemeka");
      const parents = await tx.select().from(t.studentGuardian).where(eq(t.studentGuardian.studentId, eze.id));
      expect(parents).toHaveLength(2);
      const [first, second] = await Promise.all(parents.map((p) => tx.select().from(t.guardian).where(eq(t.guardian.id, p.guardianId))));
      expect(first[0].phone).toBe(second[0].phone);

      const [aunt] = await tx.insert(t.guardian).values({ schoolId: a.schoolId, fullName: "Aunt Eze", phone: "+2348099990000" }).returning();
      await expect(linkGuardian(ctx, { studentId: eze.id, guardianId: aunt.id, relationship: "guardian", isPrimary: false })).rejects.toBeInstanceOf(TooManyGuardians);

      const mother = parents.find((p) => !p.isPrimary)!;
      expect(await refusedBy(tx, (sp) => sp.update(t.studentGuardian).set({ isPrimary: true }).where(and(eq(t.studentGuardian.studentId, eze.id), eq(t.studentGuardian.guardianId, mother.guardianId))))).toBe("student_guardian_one_primary");
      expect(await refusedBy(tx, (sp) => sp.insert(t.guardian).values({ schoolId: a.schoolId, fullName: "No Date", phone: "+2348099990001", whatsappConsent: true }))).toBe("guardian_consent_has_date");
    });
  });

  it.each([
    ["0803 123 4567", "+2348031234567"],
    ["08031234567", "+2348031234567"],
    ["+234 803 123 4567", "+2348031234567"],
    ["2348031234567", "+2348031234567"],
    ["803-123-4567", "+2348031234567"],
    ["0603 123 4567", null],
    ["080312", null],
  ])("normalises %s", (input, expected) => {
    expect(normaliseNigerianPhone(input)).toBe(expected);
  });
});

describe("AC-10: students who leave", () => {
  it("drops a withdrawn student from the class list but keeps their earlier record", async () => {
    await inRollback(async (tx) => {
      const musa = a.student("Musa Aisha");
      await tx.update(t.enrolment).set({ withdrawnOn: "2026-11-02" }).where(and(eq(t.enrolment.studentId, musa.id), eq(t.enrolment.termId, a.term(1).id)));
      const list = await listClassStudents(a.ctx(tx), { termId: a.term(1).id, classId: a.cls(JSS).id });
      expect(list.map((s) => s.studentId)).not.toContain(musa.id);
      expect(list).toHaveLength(15);
      const results = await getStudentSessionResults(a.ctx(tx), { studentId: musa.id, sessionId: a.session.id });
      expect(results[0].enrolment?.withdrawnOn).toBe("2026-11-02");
      await expect(save(a, tx, a.offer(JSS, "Mathematics").id, [{ studentId: musa.id, componentKey: "ca2", expected: null, value: "10" }])).rejects.toBeInstanceOf(NotTakingSubject);
    });
  });

  it("requires a leaving date exactly when a student is not active", async () => {
    await inRollback(async (tx) => {
      const musa = a.student("Musa Aisha");
      expect(await refusedBy(tx, (sp) => sp.update(t.student).set({ status: "left" }).where(eq(t.student.id, musa.id)))).toBe("student_left_on_matches_status");
      expect(await refusedBy(tx, (sp) => sp.update(t.student).set({ status: "left", leftOn: "2026-11-02" }).where(eq(t.student.id, musa.id)))).toBeNull();
    });
  });
});

describe("AC-11: uniqueness rules", () => {
  it("enforces short names, admission numbers, staff phones and one current term", async () => {
    await inRollback(async (tx) => {
      expect(await refusedBy(tx, (sp) => sp.insert(t.school).values({ slug: "Grace High", code: "GHS", name: "x", address: "x" }))).toBe("school_slug_format");
      expect(await refusedBy(tx, (sp) => sp.insert(t.school).values({ slug: "testschoola", code: "TSA", name: "x", address: "x" }))).toBe("school_slug_unique");
      expect(await refusedBy(tx, (sp) => sp.insert(t.school).values({ slug: "newschool", code: "ghs", name: "x", address: "x" }))).toBe("school_code_format");
      const okon = a.student("Okon Emem");
      expect(await refusedBy(tx, (sp) => sp.insert(t.student).values({ schoolId: a.schoolId, studentNo: 9001, admissionNo: okon.admissionNo, surname: "Dup", otherNames: "Dup", gender: "male" }))).toBe("student_school_admission_key");
      // The same admission number is fine in another school.
      expect(await refusedBy(tx, (sp) => sp.insert(t.student).values({ schoolId: b.schoolId, studentNo: 9001, admissionNo: "TEST/ONLY/IN/B", surname: "Fine", otherNames: "Fine", gender: "male" }))).toBeNull();
      expect(await refusedBy(tx, (sp) => sp.insert(t.student).values({ schoolId: a.schoolId, studentNo: okon.studentNo, surname: "Dup", otherNames: "Dup", gender: "male" }))).toBe("student_school_number_key");
      expect(await refusedBy(tx, (sp) => sp.insert(t.staff).values({ schoolId: a.schoolId, fullName: "Dup", phone: "+2348031234567", role: "teacher" }))).toBe("staff_school_phone_key");
      expect(await refusedBy(tx, (sp) => sp.update(t.term).set({ isCurrent: true }).where(eq(t.term.id, a.term(2).id)))).toBe("term_one_current_per_school");

      await setCurrentTerm(a.ctx(tx), { termId: a.term(2).id });
      expect((await getCurrentTerm(a.ctx(tx))).term.number).toBe(2);
      expect((await getCurrentTerm(b.ctx(tx))).term.number).toBe(1);
    });
  });

  it("gives every student a number, with or without an admission number", async () => {
    await inRollback(async (tx) => {
      // Seniors in the test schools were seeded without admission numbers.
      const udo = a.student("Udo Godswill");
      expect(udo.admissionNo).toBeNull();
      expect(displayStudentId("TSA", udo)).toBe(formatStudentNo("TSA", udo.studentNo));
      expect(displayStudentId("TSA", a.student("Okon Emem"))).toBe("GHS/2024/015");

      const ctx = a.ctx(tx);
      const [first, second] = await allocateStudentNumbers(ctx, { count: 2 });
      expect(second).toBe(first + 1);
      expect(first).toBeGreaterThan(22);
      const [next] = await allocateStudentNumbers(ctx, { count: 1 });
      expect(next).toBe(second + 1);
      // Two students without admission numbers are both fine.
      await tx.insert(t.student).values([
        { schoolId: a.schoolId, studentNo: first, surname: "New", otherNames: "One", gender: "female" },
        { schoolId: a.schoolId, studentNo: second, surname: "New", otherNames: "Two", gender: "male" },
      ]);
      expect(formatStudentNo("GHS", 23)).toBe("GHS-0023");
      expect(formatStudentNo("GHS", 12345)).toBe("GHS-12345");
      // Another school's counter is separate.
      const [otherFirst] = await allocateStudentNumbers(b.ctx(tx), { count: 1 });
      expect(otherFirst).toBe(23);
    });
  });
});
