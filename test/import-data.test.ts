import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { NotFound, schoolContext, setCurrentTerm } from "@/server/data";
import type { Actor, Executor } from "@/server/data/context";
import { addGuardian } from "@/server/data/guardians";
import { commitStudentImport, PlanChanged, planStudentImport, type StudentPlan, TermChanged } from "@/server/data/imports";
import { addStudent } from "@/server/data/students";
import { readWorkbook } from "@/server/import/read-workbook";

import { type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0013: planning and confirming a student import against the dev
// branch. Every test rolls back.

let a: Fixture;

beforeAll(async () => {
  ({ a } = await setUpSchools());
});

afterAll(async () => {
  await pool.end();
});

const team: Actor = { kind: "admin", readOnly: false };

async function teamCtx(tx: Executor) {
  const [admin] = await tx
    .insert(t.user)
    .values({ id: `team-${crypto.randomUUID()}`, name: "Team Member", email: `${crypto.randomUUID()}@users.voxlms.invalid`, role: "admin" })
    .returning();
  return schoolContext({ schoolId: a.schoolId, userId: admin.id, db: tx, actor: team });
}

/** Letters only, so names pass the student rules and never meet the fixture's students. */
const tag = () =>
  Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const phone = () => `080${Math.floor(Math.random() * 10)}${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

const csv = (lines: string[]) => readWorkbook(new TextEncoder().encode(lines.join("\n")), "register.csv", "students");

async function commit(ctx: ReturnType<typeof schoolContext>, lines: string[], plan: StudentPlan, addAnyway: number[] = []) {
  return commitStudentImport(ctx, { grid: await csv(lines), fileName: "register.csv", termId: plan.termId, planHash: plan.planHash, addAnyway });
}

describe("student import (AC-2 to AC-9)", () => {
  it("adds every good row with numbers, enrolments, shared siblings' mother and an existing parent", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const s = tag();
      // A parent already in the school, linked to a child typed in earlier.
      const typed = await addStudent(ctx, { classId: a.cls("SS 1 Science").id, surname: `OLD${s}`, otherNames: "Child", gender: "male", confirmDuplicate: false });
      if (!typed.ok) throw new Error(typed.error);
      const fatherPhone = phone();
      const existing = await addGuardian(ctx, { studentId: typed.studentId, fullName: "Emeka Obi", phone: fatherPhone, relationship: "father", newParent: true });
      if (!existing.ok) throw new Error(existing.error);
      const motherPhone = phone();

      const lines = [
        "GRACE HIGH SCHOOL 2026/2027 REGISTER",
        "Class,Name,Gender,Adm No,Mother's name,Mother's phone,Father's name,Father's phone",
        `jss2 gold,"OKAFOR${s}, Chinedu Emmanuel",M,A${s}1,Ngozi Okafor,${motherPhone},,`,
        `J.S.S 2 Gold,OKAFOR${s} Chidi,Boy,A${s}2,Mrs Ngozi Okafor,${motherPhone},,`,
        `SS 1 Science,OBI${s} Ada,F,A${s}3,,,Mr Emeka Obi,${fatherPhone}`,
        `SS 1 Science,UDO${s} Grace,girl,A${s}4,,,,`,
        `ss1science,EZE${s} Musa,male,A${s}5,,,,`,
      ];
      const plan = await planStudentImport(ctx, await csv(lines));
      expect(plan).toMatchObject({ sheet: "register", headerRow: 2, counts: { add: 5, here: 0, probably: 0, problems: 0 } });
      expect(plan.rows.map((r) => [r.row, r.className])).toEqual([
        [3, "JSS 2 Gold"],
        [4, "JSS 2 Gold"],
        [5, "SS 1 Science"],
        [6, "SS 1 Science"],
        [7, "SS 1 Science"],
      ]);
      expect(plan.rows[1].parents[0].match).toEqual({ kind: "new", key: expect.any(String), sharedWithRow: 3 });
      expect(plan.rows[2].parents[0].match).toEqual({ kind: "existing", guardianId: existing.guardianId, fullName: "Emeka Obi" });

      const result = await commit(ctx, lines, plan);
      expect(result.counts).toMatchObject({ added: 5, parentsCreated: 1, parentsLinked: 1 });
      expect(result.skipped).toEqual([]);

      const students = await tx.select().from(t.student).where(eq(t.student.importRunId, result.runId!));
      expect(students).toHaveLength(5);
      expect(new Set(students.map((x) => x.studentNo)).size).toBe(5);
      const enrolments = await tx.select().from(t.enrolment).where(inArray(t.enrolment.studentId, students.map((x) => x.id)));
      expect(enrolments.every((e) => e.termId === a.term(1).id)).toBe(true);
      expect(enrolments).toHaveLength(5);

      const [mother] = await tx.select().from(t.guardian).where(eq(t.guardian.importRunId, result.runId!));
      expect(mother).toMatchObject({ fullName: "Ngozi Okafor", phone: `+234${motherPhone.slice(1)}` });
      const motherLinks = await tx.select().from(t.studentGuardian).where(eq(t.studentGuardian.guardianId, mother.id));
      expect(motherLinks.map((l) => [l.relationship, l.isPrimary])).toEqual([
        ["mother", true],
        ["mother", true],
      ]);
      const fatherLinks = await tx.select().from(t.studentGuardian).where(eq(t.studentGuardian.guardianId, existing.guardianId));
      expect(fatherLinks).toHaveLength(2);
      const [old] = await tx.select().from(t.guardian).where(eq(t.guardian.id, existing.guardianId));
      expect(old.importRunId).toBeNull();

      const [run] = await tx.select().from(t.importRun).where(eq(t.importRun.id, result.runId!));
      expect(run).toMatchObject({ kind: "students", fileName: "register.csv", termId: a.term(1).id, createdBy: ctx.userId, createdLogins: [] });

      // Uploading the same file again adds nothing (AC-6, AC-9).
      const again = await planStudentImport(ctx, await csv(lines));
      expect(again.counts).toEqual({ add: 0, here: 5, probably: 0, problems: 0 });
      expect(again.rows[0].reasons[0]).toMatch(/already belongs to OKAFOR/);
      const nothing = await commit(ctx, lines, again);
      expect(nothing.runId).toBeNull();
      expect(nothing.skipped).toHaveLength(5);
    });
  });

  it("lists every problem by its Excel row and saves the valid rows", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const s = tag();
      await tx.update(t.schoolClass).set({ isActive: false }).where(eq(t.schoolClass.id, a.cls("Primary 4").id));
      const lines = [
        "Surname,Other names,Gender,Class,Admission no,Parent name,Parent phone",
        `GOOD${s},Ada,F,JSS 2 Gold,,,`,
        `ONE${s},Ada,F,SS 3 Blue,,,`,
        `TWO${s},Ada,F,Primary 4,,,`,
        `THREE${s},Ada,X,JSS 2 Gold,,,`,
        `FOUR${s},Ada,F,JSS 2 Gold,,Ngozi Okafor,0803 123`,
        `FIVE${s},Ada,F,JSS 2 Gold,,Ngozi Okafor,`,
        `SIX${s},Ada,F,JSS 2 Gold,R${s},,`,
        `SEVEN${s},Ada,F,JSS 2 Gold,r ${s},,`,
      ];
      const plan = await planStudentImport(ctx, await csv(lines));
      expect(plan.counts).toEqual({ add: 1, here: 0, probably: 0, problems: 7 });
      const reasons = Object.fromEntries(plan.rows.filter((r) => r.outcome === "problem").map((r) => [r.row, r.reasons.join(" ")]));
      expect(reasons).toEqual({
        3: "SS 3 Blue is not a class at this school.",
        4: "Primary 4 is switched off. Switch it back on from the Classes page, or use another class.",
        5: "Gender “X” isn’t one we know. Use M or F.",
        6: "Parent 1 phone 0803 123 isn’t a Nigerian mobile number.",
        7: "Parent 1 has a name but no phone number.",
        8: `Admission number R${s} is on rows 8 and 9.`,
        9: `Admission number r ${s} is on rows 8 and 9.`,
      });
      const result = await commit(ctx, lines, plan);
      expect(result.counts).toMatchObject({ added: 1, problems: 7 });
      expect(result.skipped.map((r) => r.row)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    });
  });

  it("skips probably here rows unless ticked, including a second same name row in one class", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const s = tag();
      const typed = await addStudent(ctx, { classId: a.cls("JSS 2 Gold").id, surname: `HERE${s}`, otherNames: "Chinedu", gender: "male", confirmDuplicate: false });
      if (!typed.ok) throw new Error(typed.error);
      const lines = ["Name,Gender,Class", `here${s} chinedu,M,SS 1 Science`, `TWIN${s} Ada,F,JSS 2 Gold`, `TWIN${s} Ada,F,JSS 2 Gold`];
      const plan = await planStudentImport(ctx, await csv(lines));
      expect(plan.rows.map((r) => r.outcome)).toEqual(["probably", "add", "probably"]);
      expect(plan.rows[0].reasons).toEqual([`Probably HERE${s} Chinedu in JSS 2 Gold.`]);
      expect(plan.rows[2].reasons).toEqual(["Probably the same as row 3."]);

      const result = await commit(ctx, lines, plan, [4]);
      expect(result.counts).toMatchObject({ added: 2, probablyHereSkipped: 1 });
      expect(result.skipped).toEqual([expect.objectContaining({ row: 2, outcome: "probably" })]);
    });
  });

  it("refuses, saving nothing, when the term or the records changed since the preview", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const s = tag();
      const lines = ["Name,Gender,Class", `LATE${s} Ada,F,JSS 2 Gold`, `NEW${s} Bola,F,JSS 2 Gold`];
      const plan = await planStudentImport(ctx, await csv(lines));
      const imported = () => tx.select({ id: t.student.id }).from(t.student).where(and(eq(t.student.schoolId, a.schoolId), isNotNull(t.student.importRunId)));
      const before = (await imported()).length;

      // A student typed meanwhile turns row 2 into "probably here".
      const typed = await addStudent(ctx, { classId: a.cls("JSS 2 Gold").id, surname: `LATE${s}`, otherNames: "Ada", gender: "female", confirmDuplicate: false });
      if (!typed.ok) throw new Error(typed.error);
      const changed = await commit(ctx, lines, plan).catch((e: unknown) => e);
      expect(changed).toBeInstanceOf(PlanChanged);
      expect((changed as PlanChanged).plan.rows[0].outcome).toBe("probably");

      const fresh = (changed as PlanChanged).plan;
      await setCurrentTerm(ctx, { termId: a.term(2).id });
      expect(await commit(ctx, lines, fresh).catch((e: unknown) => e)).toBeInstanceOf(TermChanged);
      expect(await imported()).toHaveLength(before);
    });
  });

  it("is our team's only (AC-16)", async () => {
    await inRollback(async (tx) => {
      const grid = await csv(["Name,Gender,Class", "OKAFOR Ada,F,JSS 2 Gold"]);
      const teacher = schoolContext({ schoolId: a.schoolId, userId: "teacher", db: tx, actor: { kind: "teacher", staffId: crypto.randomUUID(), readOnly: false } });
      await expect(planStudentImport(teacher, grid)).rejects.toBeInstanceOf(NotFound);
      const viewingAs = schoolContext({ schoolId: a.schoolId, userId: "team", db: tx, actor: { kind: "admin", readOnly: true } });
      await expect(commitStudentImport(viewingAs, { grid, fileName: "x.csv", termId: a.term(1).id, planHash: "x", addAnyway: [] })).rejects.toBeInstanceOf(NotFound);
    });
  });
});
