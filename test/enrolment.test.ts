import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { createAuth } from "@/server/auth/config";
import { changePhone, setLoginEnabled } from "@/server/auth/service";
import { getClassPage, listClassStudents, NotFound, schoolContext, setCurrentTerm } from "@/server/data";
import type { Actor, Executor } from "@/server/data/context";
import { addGuardian, findGuardiansByPhone, makePrimaryGuardian, unlinkGuardian } from "@/server/data/guardians";
import { readJpegSize } from "@/server/data/setup";
import { addTeacher, saveTeacher, setFormTeacher, setStaffLeft } from "@/server/data/staff";
import {
  addStudent,
  getClassRoster,
  getEnrolmentProgress,
  moveStudent,
  removeStudent,
  saveClassElectives,
  saveStudent,
  saveStudentPhoto,
  setStudentLeft,
} from "@/server/data/students";
import { lagosToday } from "@/server/data/team";

import { enrolmentOf, type Fixture, inRollback, pool, refusedBy, setUpSchools } from "./db";

// Spec 0008 acceptance criteria. Every test rolls back.

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  ({ a, b } = await setUpSchools());
});

afterAll(async () => {
  await pool.end();
});

const team: Actor = { kind: "admin", readOnly: false };
const teamCtx = (tx: Executor, f: Fixture = a) => schoolContext({ schoolId: f.schoolId, userId: "team", db: tx, actor: team });
const teacherCtx = (tx: Executor, staffId: string) => schoolContext({ schoolId: a.schoolId, userId: "teacher", db: tx, actor: { kind: "teacher", staffId, readOnly: false } });

/** A phone no one on the dev branch has, so tests never meet real logins. */
const freshPhone = () => `0809${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

async function teamMember(tx: Executor) {
  const [admin] = await tx
    .insert(t.user)
    .values({ id: `team-${crypto.randomUUID()}`, name: "Team Member", email: `${crypto.randomUUID()}@users.voxlms.invalid`, username: `234809${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, role: "admin" })
    .returning();
  return admin;
}

async function newTeacher(tx: Executor, f: Fixture = a, phone = freshPhone()) {
  const admin = await teamMember(tx);
  const result = await addTeacher(teamCtx(tx, f), { title: "Mrs", fullName: "Ada Nwankwo", phone, confirmSamePerson: false }, { actorUserId: admin.id });
  if (!result.ok) throw new Error(`teacher not added: ${result.error}`);
  return { ...result, admin, phone };
}

async function add(tx: Executor, classId: string, surname: string, otherNames: string, extra: { admissionNo?: string; confirmDuplicate?: boolean } = {}) {
  return addStudent(teamCtx(tx), { classId, surname, otherNames, gender: "female", confirmDuplicate: false, ...extra });
}

async function added(tx: Executor, classId: string, surname: string, otherNames: string) {
  const result = await add(tx, classId, surname, otherNames);
  if (!result.ok) throw new Error(`student not added: ${result.error}`);
  return result.studentId;
}

/** A minimal JPEG: start marker and a baseline frame header (enough for the size check). */
function jpegBytes(width: number, height: number) {
  const bytes = new Uint8Array(40);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff]);
  return bytes;
}

describe("happy path: a teacher sees exactly their class (AC-1, AC-4, AC-5, AC-14)", () => {
  it("adds a teacher with a login, makes them form master, and they see the three students added", async () => {
    await inRollback(async (tx) => {
      const teacher = await newTeacher(tx);
      expect(teacher.login).toBe("new");
      const [staffRow] = await tx.select().from(t.staff).where(eq(t.staff.id, teacher.staffId));
      expect(staffRow).toMatchObject({ role: "teacher", title: "Mrs", fullName: "Ada Nwankwo", userId: teacher.userId });

      const primary4 = a.cls("Primary 4");
      expect(await setFormTeacher(teamCtx(tx), { classId: primary4.id, staffId: teacher.staffId })).toEqual({ ok: true });
      for (const name of ["Alabi", "Bassey", "Chukwu"]) await added(tx, primary4.id, name, "Test");

      const own = teacherCtx(tx, teacher.staffId);
      const page = await getClassPage(own, { classId: primary4.id });
      expect(page.students.map((s) => s.surname)).toEqual(["Alabi", "Bassey", "Chukwu"]);
      await expect(getClassPage(own, { classId: a.cls("JSS 2 Gold").id })).rejects.toBeInstanceOf(NotFound);
    });
  });

  it("gives each new student the next number and an enrolment in the current term", async () => {
    await inRollback(async (tx) => {
      const first = await add(tx, a.cls("Primary 4").id, "Alabi", "Ruth");
      const second = await add(tx, a.cls("Primary 4").id, "Bassey", "Joy");
      if (!first.ok || !second.ok) throw new Error("not added");
      expect(first.studentNo).toMatch(/^TSA-\d{4}$/);
      expect(Number(second.studentNo.slice(4))).toBe(Number(first.studentNo.slice(4)) + 1);
      expect(await enrolmentOf(tx, first.studentId, a.term(1).id)).toMatchObject({ classId: a.cls("Primary 4").id, withdrawnOn: null });
    });
  });

  it("puts a class under one form master per session, and refuses a teacher who has left", async () => {
    await inRollback(async (tx) => {
      const teacher = await newTeacher(tx);
      const jss2 = a.cls("JSS 2 Gold");
      await setFormTeacher(teamCtx(tx), { classId: jss2.id, staffId: teacher.staffId });
      const heads = await tx.select().from(t.classTeacher).where(and(eq(t.classTeacher.classId, jss2.id), eq(t.classTeacher.sessionId, a.session.id)));
      expect(heads.map((h) => h.staffId)).toEqual([teacher.staffId]);
      await setFormTeacher(teamCtx(tx), { classId: jss2.id, staffId: null });
      expect(await tx.select().from(t.classTeacher).where(eq(t.classTeacher.classId, jss2.id))).toHaveLength(0);

      await setStaffLeft(teamCtx(tx), { staffId: teacher.staffId, left: true }, { actorUserId: teacher.admin.id });
      expect(await setFormTeacher(teamCtx(tx), { classId: jss2.id, staffId: teacher.staffId })).toMatchObject({ ok: false, error: expect.stringMatching(/has left/) });
    });
  });
});

describe("AC-1, AC-2: adding and fixing teachers", () => {
  it("refuses a phone already used by staff here, pointing a leaver to Mark as active again", async () => {
    await inRollback(async (tx) => {
      const teacher = await newTeacher(tx);
      const again = await addTeacher(teamCtx(tx), { fullName: "Someone Else", phone: teacher.phone, confirmSamePerson: true }, { actorUserId: teacher.admin.id });
      expect(again).toMatchObject({ ok: false, field: "phone", error: expect.stringMatching(/already has that number/) });
      await setStaffLeft(teamCtx(tx), { staffId: teacher.staffId, left: true }, { actorUserId: teacher.admin.id });
      const leaver = await addTeacher(teamCtx(tx), { fullName: "Someone Else", phone: teacher.phone, confirmSamePerson: true }, { actorUserId: teacher.admin.id });
      expect(leaver).toMatchObject({ ok: false, error: expect.stringMatching(/Mark as active again/) });
      expect(await addTeacher(teamCtx(tx), { fullName: "Ab", phone: freshPhone(), confirmSamePerson: false }, { actorUserId: null })).toMatchObject({ ok: false, field: "fullName" });
      expect(await addTeacher(teamCtx(tx), { fullName: "Bad Phone", phone: "12345", confirmSamePerson: false }, { actorUserId: null })).toMatchObject({ ok: false, field: "phone" });
    });
  });

  it("asks 'same person?' before saving anything for a phone with a login elsewhere, saying when it is off", async () => {
    await inRollback(async (tx) => {
      const elsewhere = await newTeacher(tx, b);
      await setLoginEnabled({ auth: createAuth(tx, { withNextCookies: false }), db: tx }, { userId: elsewhere.userId, enabled: false, actorUserId: elsewhere.admin.id });
      const before = await tx.select().from(t.staff).where(eq(t.staff.schoolId, a.schoolId));

      const asked = await addTeacher(teamCtx(tx), { fullName: "Ada Nwankwo", phone: elsewhere.phone, confirmSamePerson: false }, { actorUserId: elsewhere.admin.id });
      expect(asked).toMatchObject({ ok: false, needsConfirm: true, existing: { schools: ["Test School B"], off: true } });
      expect(await tx.select().from(t.staff).where(eq(t.staff.schoolId, a.schoolId))).toHaveLength(before.length);

      const linked = await addTeacher(teamCtx(tx), { fullName: "Ada Nwankwo", phone: elsewhere.phone, confirmSamePerson: true }, { actorUserId: elsewhere.admin.id });
      expect(linked).toMatchObject({ ok: true, userId: elsewhere.userId, login: "existing_off" });
      const [login] = await tx.select({ banned: t.user.banned }).from(t.user).where(eq(t.user.id, elsewhere.userId));
      expect(login.banned).toBe(true);
    });
  });

  it("edits the phone directly only without a login; with one, Change phone refuses a clash in any school first", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const [bare] = await tx.insert(t.staff).values({ schoolId: a.schoolId, fullName: "No Login Yet", phone: "+2348090000123", role: "teacher" }).returning();
      const typed = freshPhone();
      expect(await saveTeacher(ctx, { staffId: bare.id, fullName: "No Login Yet", phone: typed })).toEqual({ ok: true });
      const [moved] = await tx.select({ phone: t.staff.phone }).from(t.staff).where(eq(t.staff.id, bare.id));
      expect(moved.phone).toBe(`+234${typed.slice(1)}`);

      const teacher = await newTeacher(tx);
      expect(await saveTeacher(ctx, { staffId: teacher.staffId, fullName: "Ada Nwankwo-Obi", phone: freshPhone() })).toMatchObject({ ok: false, field: "phone" });
      expect(await saveTeacher(ctx, { staffId: teacher.staffId, title: "Dr", fullName: "Ada Nwankwo-Obi" })).toEqual({ ok: true });
      const [login] = await tx.select({ name: t.user.name }).from(t.user).where(eq(t.user.id, teacher.userId));
      expect(login.name).toBe("Dr Ada Nwankwo-Obi");

      const clash = await changePhone({ auth: createAuth(tx, { withNextCookies: false }), db: tx }, { userId: teacher.userId, newPhone: typed, actorUserId: teacher.admin.id });
      expect(clash).toMatchObject({ ok: false, reason: "staff", staffName: "No Login Yet", schoolName: "Test School A" });
      const [unchanged] = await tx.select({ phone: t.staff.phone }).from(t.staff).where(eq(t.staff.id, teacher.staffId));
      expect(unchanged.phone).toBe(`+234${teacher.phone.slice(1)}`);
    });
  });
});

describe("AC-3: a teacher who leaves", () => {
  it("is removed as form master this session and their login goes off, unless still active elsewhere", async () => {
    await inRollback(async (tx) => {
      const teacher = await newTeacher(tx);
      await setFormTeacher(teamCtx(tx), { classId: a.cls("Primary 4").id, staffId: teacher.staffId });
      const left = await setStaffLeft(teamCtx(tx), { staffId: teacher.staffId, left: true }, { actorUserId: teacher.admin.id });
      expect(left).toEqual({ ok: true, unassigned: ["Primary 4"], loginOff: true });
      expect(await tx.select().from(t.classTeacher).where(eq(t.classTeacher.staffId, teacher.staffId))).toHaveLength(0);

      // Back again: the record only; classes and the login stay as they are.
      expect(await setStaffLeft(teamCtx(tx), { staffId: teacher.staffId, left: false }, { actorUserId: teacher.admin.id })).toMatchObject({ ok: true });
      const [row] = await tx.select({ status: t.staff.status }).from(t.staff).where(eq(t.staff.id, teacher.staffId));
      const [login] = await tx.select({ banned: t.user.banned }).from(t.user).where(eq(t.user.id, teacher.userId));
      expect(row.status).toBe("active");
      expect(login.banned).toBe(true);
    });
  });

  it("keeps the login on when they still teach at another school, and never touches the team member's own", async () => {
    await inRollback(async (tx) => {
      const teacher = await newTeacher(tx);
      const inB = await addTeacher(teamCtx(tx, b), { fullName: "Ada Nwankwo", phone: teacher.phone, confirmSamePerson: true }, { actorUserId: teacher.admin.id });
      expect(inB.ok).toBe(true);
      const left = await setStaffLeft(teamCtx(tx), { staffId: teacher.staffId, left: true }, { actorUserId: teacher.admin.id });
      expect(left).toMatchObject({ ok: true, loginOff: false });

      const own = await setStaffLeft(teamCtx(tx, b), { staffId: (inB as { staffId: string }).staffId, left: true }, { actorUserId: teacher.userId });
      expect(own).toMatchObject({ ok: true, loginOff: false });
    });
  });
});

describe("AC-6: admission numbers and the same name warning", () => {
  it("refuses an admission number that differs only in case and spaces, naming the holder", async () => {
    await inRollback(async (tx) => {
      const okon = a.student("Okon Emem");
      expect(okon.admissionNo).toBe("GHS/2024/015");
      const clash = await add(tx, a.cls("Primary 4").id, "Ade", "New", { admissionNo: "ghs/2024/ 015" });
      expect(clash).toEqual({ ok: false, field: "admissionNo", error: "ghs/2024/ 015 already belongs to OKON Emem." });
      // The database is the final judge.
      expect(
        await refusedBy(tx, (sp) => sp.insert(t.student).values({ schoolId: a.schoolId, studentNo: 99001, admissionNo: "GHS/ 2024/015", surname: "X", otherNames: "Y", gender: "male" })),
      ).toBe("student_school_admission_norm_key");
      // Only spaces means none.
      const blank = await add(tx, a.cls("Primary 4").id, "Ade", "Blank", { admissionNo: "   " });
      if (!blank.ok) throw new Error("not added");
      const [row] = await tx.select({ admissionNo: t.student.admissionNo }).from(t.student).where(eq(t.student.id, blank.studentId));
      expect(row.admissionNo).toBeNull();
      // A fix may keep its own number.
      expect(await saveStudent(teamCtx(tx), { studentId: okon.id, surname: "Okon", otherNames: "Emem", gender: "male", admissionNo: "ghs/2024/015", house: "Green" })).toEqual({ ok: true });
    });
  });

  it("warns about a name already in the class this term and saves only on confirm", async () => {
    await inRollback(async (tx) => {
      const jss2 = a.cls("JSS 2 Gold").id;
      const warned = await add(tx, jss2, "okafor", "CHIAMAKA");
      expect(warned).toEqual({ ok: false, field: "surname", needsConfirm: true, error: "There is already an OKAFOR Chiamaka in JSS 2 Gold. Add anyway?" });
      expect((await add(tx, jss2, "Okafor", "Chiamaka", { confirmDuplicate: true })).ok).toBe(true);
    });
  });
});

describe("AC-7: details and photos", () => {
  it("reads a JPEG's size and accepts only a small JPEG of a sensible size", async () => {
    expect(readJpegSize(jpegBytes(300, 400))).toEqual({ width: 300, height: 400 });
    expect(readJpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const studentId = await added(tx, a.cls("Primary 4").id, "Photo", "Test");
      expect(await saveStudentPhoto(ctx, { studentId, bytes: jpegBytes(50, 60) })).toMatchObject({ ok: false, field: "file" });
      expect(await saveStudentPhoto(ctx, { studentId, bytes: new Uint8Array(101 * 1024) })).toMatchObject({ ok: false, error: expect.stringMatching(/100 KB/) });
      const first = await saveStudentPhoto(ctx, { studentId, bytes: jpegBytes(300, 400) });
      const second = await saveStudentPhoto(ctx, { studentId, bytes: jpegBytes(300, 400) });
      if (!first.ok || !second.ok) throw new Error("photo refused");
      const kept = await tx.select({ id: t.asset.id, kind: t.asset.kind, mime: t.asset.mimeType }).from(t.asset).where(eq(t.asset.id, first.assetId));
      expect(kept).toHaveLength(0);
      const [now] = await tx.select({ kind: t.asset.kind, mime: t.asset.mimeType }).from(t.asset).where(eq(t.asset.id, second.assetId));
      expect(now).toEqual({ kind: "student_photo", mime: "image/jpeg" });
    });
  });
});

describe("AC-8: parents and siblings", () => {
  it("offers the parent who already has the phone, links them, and deletes them once their last child goes", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const [tunde] = await tx.select().from(t.guardian).where(and(eq(t.guardian.schoolId, a.schoolId), eq(t.guardian.fullName, "Mr Tunde Adebayo")));
      const child = await added(tx, a.cls("Primary 4").id, "Adebayo", "Taiwo");

      const offered = await addGuardian(ctx, { studentId: child, fullName: "Tunde Adebayo", phone: tunde.phone, relationship: "father" });
      expect(offered).toMatchObject({ ok: false, needsConfirm: true, matches: [{ guardianId: tunde.id, fullName: "Mr Tunde Adebayo" }] });
      expect((offered as { matches: { children: unknown[] }[] }).matches[0].children).toHaveLength(2);

      expect(await addGuardian(ctx, { studentId: child, relationship: "father", linkTo: tunde.id })).toEqual({ ok: true, guardianId: tunde.id });
      const links = await tx.select().from(t.studentGuardian).where(eq(t.studentGuardian.guardianId, tunde.id));
      expect(links).toHaveLength(3);
      expect(links.find((l) => l.studentId === child)?.isPrimary).toBe(true);

      // A second, new parent with the same phone when the answer is "No".
      const mum = await addGuardian(ctx, { studentId: child, fullName: "Mrs Kemi Adebayo", phone: tunde.phone, relationship: "mother", newParent: true });
      if (!mum.ok) throw new Error("not added");
      expect(await addGuardian(ctx, { studentId: child, fullName: "Third Parent", phone: "08099990002", relationship: "guardian", newParent: true })).toMatchObject({
        ok: false,
        error: expect.stringMatching(/at most two/),
      });
      expect(await tx.select().from(t.guardian).where(eq(t.guardian.fullName, "Third Parent"))).toHaveLength(0);

      // Unlinking the primary makes the other parent primary.
      await unlinkGuardian(ctx, { studentId: child, guardianId: tunde.id });
      const [left] = await tx.select().from(t.studentGuardian).where(eq(t.studentGuardian.studentId, child));
      expect(left).toMatchObject({ guardianId: mum.guardianId, isPrimary: true });
      // Her only child: unlinking deletes her record.
      expect(await unlinkGuardian(ctx, { studentId: child, guardianId: mum.guardianId })).toEqual({ ok: true, deleted: true });
      expect(await tx.select().from(t.guardian).where(eq(t.guardian.id, mum.guardianId))).toHaveLength(0);
      expect(await findGuardiansByPhone(ctx, { phone: "123" })).toBeNull();
    });
  });

  it("switches the primary parent", async () => {
    await inRollback(async (tx) => {
      const eze = a.student("Eze Chukwuemeka");
      const parents = await tx.select().from(t.studentGuardian).where(eq(t.studentGuardian.studentId, eze.id));
      const other = parents.find((p) => !p.isPrimary)!;
      expect(await makePrimaryGuardian(teamCtx(tx), { studentId: eze.id, guardianId: other.guardianId })).toEqual({ ok: true });
      const after = await tx.select().from(t.studentGuardian).where(eq(t.studentGuardian.studentId, eze.id));
      expect(after.filter((p) => p.isPrimary).map((p) => p.guardianId)).toEqual([other.guardianId]);
      const roster = await getClassRoster(teamCtx(tx), { classId: a.cls("JSS 2 Gold").id });
      expect(roster.students.find((s) => s.studentId === eze.id)?.parents[0]).toMatchObject({ guardianId: other.guardianId, isPrimary: true });
    });
  });
});

/** Saves one score for a student in a subject of their class this term. */
async function scoreFor(tx: Executor, studentId: string, className: string, subject: string) {
  const offer = a.offer(className, subject);
  const enrolled = await enrolmentOf(tx, studentId, a.term(1).id);
  const [part] = await tx
    .select()
    .from(t.assessmentComponent)
    .where(and(eq(t.assessmentComponent.sectionId, enrolled.sectionId), eq(t.assessmentComponent.sessionId, a.session.id)));
  await tx.insert(t.score).values({
    schoolId: a.schoolId,
    enrolmentId: enrolled.id,
    classSubjectId: offer.id,
    componentId: part.id,
    classId: enrolled.classId,
    sessionId: enrolled.sessionId,
    sectionId: enrolled.sectionId,
    value: "10",
    updatedBy: "test",
  });
}

describe("AC-9: electives", () => {
  it("replaces this class's ticks, and refuses the whole save when an unticked elective has scores", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const ss1 = a.cls("SS 1 Science").id;
      const chukwu = a.student("Chukwu Nnamdi");
      const lawal = a.student("Lawal Maryam");
      const subject = (name: string) => a.offer("SS 1 Science", name).subjectId;
      const roster = await getClassRoster(ctx, { classId: ss1 });
      const ticks = roster.students.flatMap((s) => s.electives.map((e) => ({ studentId: s.studentId, subjectId: e.subjectId })));

      // Chukwu drops Economics; Lawal adds Further Mathematics.
      const next = [...ticks.filter((x) => !(x.studentId === chukwu.id && x.subjectId === subject("Economics"))), { studentId: lawal.id, subjectId: subject("Further Mathematics") }];
      expect(await saveClassElectives(ctx, { classId: ss1, ticks: next })).toEqual({ ok: true, added: 1, removed: 1 });

      await scoreFor(tx, lawal.id, "SS 1 Science", "Further Mathematics");
      const refused = await saveClassElectives(ctx, { classId: ss1, ticks: next.filter((x) => x.studentId !== lawal.id) });
      expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/LAWAL Maryam has 1 score in Further Mathematics/) });
      const still = await tx.select().from(t.studentElective).where(eq(t.studentElective.studentId, lawal.id));
      expect(still.length).toBeGreaterThan(1);
      // A compulsory subject can't be ticked as an elective.
      await expect(saveClassElectives(ctx, { classId: ss1, ticks: [{ studentId: lawal.id, subjectId: subject("Mathematics") }] })).rejects.toBeInstanceOf(NotFound);
    });
  });
});

async function newJss2Arm(tx: Executor) {
  const jss2 = a.cls("JSS 2 Gold");
  const [blue] = await tx
    .insert(t.schoolClass)
    .values({ schoolId: a.schoolId, sectionId: jss2.sectionId, stage: jss2.stage, standardLevelId: jss2.standardLevelId, arm: "Blue", name: "JSS 2 Blue Test", sortOrder: jss2.sortOrder + 1 })
    .returning();
  return blue;
}

describe("AC-10: moving a student", () => {
  it("moves an enrolment without scores, and refuses one with scores", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const blue = await newJss2Arm(tx);
      const etim = a.student("Etim Blessing");
      const enrolled = await enrolmentOf(tx, etim.id, a.term(1).id);
      expect(await moveStudent(ctx, { enrolmentId: enrolled.id, toClassId: blue.id })).toMatchObject({ ok: true, className: "JSS 2 Blue Test" });
      expect(await enrolmentOf(tx, etim.id, a.term(1).id)).toMatchObject({ classId: blue.id, sectionId: blue.sectionId });

      const abubakar = await enrolmentOf(tx, a.student("Abubakar Sadiq").id, a.term(1).id);
      expect(await moveStudent(ctx, { enrolmentId: abubakar.id, toClassId: blue.id })).toMatchObject({ ok: false, error: expect.stringMatching(/scores this term/) });
    });
  });

  it("drops electives the new class doesn't offer, unless they have scores this session", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const chukwu = a.student("Chukwu Nnamdi");
      const enrolled = await enrolmentOf(tx, chukwu.id, a.term(1).id);
      // An earlier term's score in Economics (in SS 1 Science) keeps that elective.
      const [earlier] = await tx
        .insert(t.enrolment)
        .values({ schoolId: a.schoolId, studentId: chukwu.id, termId: a.term(3).id, sessionId: a.session.id, classId: enrolled.classId, sectionId: enrolled.sectionId })
        .returning();
      const offer = a.offer("SS 1 Science", "Economics");
      const [part] = await tx.select().from(t.assessmentComponent).where(and(eq(t.assessmentComponent.sectionId, enrolled.sectionId), eq(t.assessmentComponent.sessionId, a.session.id)));
      await tx.insert(t.score).values({ schoolId: a.schoolId, enrolmentId: earlier.id, classSubjectId: offer.id, componentId: part.id, classId: enrolled.classId, sessionId: a.session.id, sectionId: enrolled.sectionId, value: "12", updatedBy: "test" });

      const ss1 = a.cls("SS 1 Science");
      const [arts] = await tx
        .insert(t.schoolClass)
        .values({ schoolId: a.schoolId, sectionId: ss1.sectionId, stage: ss1.stage, standardLevelId: ss1.standardLevelId, arm: "Arts", name: "SS 1 Arts Test", sortOrder: ss1.sortOrder + 1 })
        .returning();
      const moved = await moveStudent(ctx, { enrolmentId: enrolled.id, toClassId: arts.id });
      expect(moved).toMatchObject({ ok: true, removedElectives: ["Further Mathematics"] });
      const left = await tx.select({ subjectId: t.studentElective.subjectId }).from(t.studentElective).where(eq(t.studentElective.studentId, chukwu.id));
      expect(left.map((e) => e.subjectId)).toEqual([offer.subjectId]);
    });
  });

  it("refuses a move into another section while the enrolment has ratings", async () => {
    await inRollback(async (tx) => {
      const etim = await enrolmentOf(tx, a.student("Etim Blessing").id, a.term(1).id);
      const [trait] = await tx.insert(t.ratingTrait).values({ schoolId: a.schoolId, kind: "behaviour", name: `Neatness ${crypto.randomUUID()}` }).returning();
      await tx.insert(t.rating).values({ schoolId: a.schoolId, enrolmentId: etim.id, traitId: trait.id, value: 4, updatedBy: "test" });
      expect(await moveStudent(teamCtx(tx), { enrolmentId: etim.id, toClassId: a.cls("Primary 4").id })).toMatchObject({ ok: false, error: expect.stringMatching(/rating/) });
    });
  });
});

describe("AC-11: a student who leaves", () => {
  it("drops off the lists from a date this term, and Undo brings them back", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const ojo = a.student("Ojo Precious");
      const jss2 = a.cls("JSS 2 Gold").id;
      const termId = a.term(1).id;
      expect(await setStudentLeft(ctx, { studentId: ojo.id, leftOn: "2099-01-01" })).toMatchObject({ ok: false, error: expect.stringMatching(/future/) });
      expect(await setStudentLeft(ctx, { studentId: ojo.id, leftOn: "2026-01-01" })).toMatchObject({ ok: false, error: expect.stringMatching(/this term/) });

      // The test schools' First Term started in September 2026, so today is inside it.
      const today = lagosToday();
      expect(await setStudentLeft(ctx, { studentId: ojo.id, leftOn: today })).toEqual({ ok: true });
      expect((await listClassStudents(ctx, { termId, classId: jss2 })).some((s) => s.studentId === ojo.id)).toBe(false);
      expect(await enrolmentOf(tx, ojo.id, termId)).toMatchObject({ withdrawnOn: today });
      const roster = await getClassRoster(ctx, { classId: jss2 });
      expect(roster.students.find((s) => s.studentId === ojo.id)?.withdrawnOn).toBe(today);

      expect(await setStudentLeft(ctx, { studentId: ojo.id, leftOn: null })).toEqual({ ok: true });
      expect((await listClassStudents(ctx, { termId, classId: jss2 })).some((s) => s.studentId === ojo.id)).toBe(true);
      const [back] = await tx.select({ status: t.student.status, leftOn: t.student.leftOn }).from(t.student).where(eq(t.student.id, ojo.id));
      expect(back).toEqual({ status: "active", leftOn: null });
    });
  });
});

describe("AC-12: removing a student added by mistake", () => {
  it("refuses one with any score history, and otherwise leaves nothing behind", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const studentId = await added(tx, a.cls("JSS 2 Gold").id, "Mistake", "Twice");
      const enrolled = await enrolmentOf(tx, studentId, a.term(1).id);
      const offer = a.offer("JSS 2 Gold", "Mathematics");
      const [part] = await tx.select().from(t.assessmentComponent).where(and(eq(t.assessmentComponent.sectionId, enrolled.sectionId), eq(t.assessmentComponent.sessionId, a.session.id)));
      // A score entered and then cleared still leaves its history.
      await tx
        .insert(t.scoreChange)
        .values({ schoolId: a.schoolId, saveId: crypto.randomUUID(), enrolmentId: enrolled.id, classSubjectId: offer.id, componentId: part.id, oldValue: "5", newValue: null, changedBy: "test" });
      expect(await removeStudent(ctx, { studentId })).toMatchObject({ ok: false, error: expect.stringMatching(/marked as left/) });

      const mistake = await added(tx, a.cls("JSS 2 Gold").id, "Mistake", "Once");
      const parent = await addGuardian(ctx, { studentId: mistake, fullName: "Only Parent", phone: "08099990003", relationship: "mother", newParent: true });
      const photo = await saveStudentPhoto(ctx, { studentId: mistake, bytes: jpegBytes(300, 400) });
      if (!parent.ok || !photo.ok) throw new Error("setup failed");
      expect(await removeStudent(ctx, { studentId: mistake })).toEqual({ ok: true });
      expect(await tx.select().from(t.student).where(eq(t.student.id, mistake))).toHaveLength(0);
      expect(await tx.select().from(t.enrolment).where(eq(t.enrolment.studentId, mistake))).toHaveLength(0);
      expect(await tx.select().from(t.guardian).where(eq(t.guardian.id, parent.guardianId))).toHaveLength(0);
      expect(await tx.select().from(t.asset).where(eq(t.asset.id, photo.assetId))).toHaveLength(0);
    });
  });
});

describe("AC-13: carrying class lists forward", () => {
  it("copies open enrolments of active students into the next term once, and nothing for an earlier term", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const term1 = a.term(1).id;
      const term2 = a.term(2).id;
      const leaver = a.student("Udo Godswill");
      await tx.update(t.student).set({ status: "left", leftOn: a.term(1).startsOn }).where(eq(t.student.id, leaver.id));
      await tx.update(t.enrolment).set({ withdrawnOn: a.term(1).startsOn }).where(and(eq(t.enrolment.studentId, leaver.id), eq(t.enrolment.termId, term1)));
      // One student already in Second Term, and a switched off class with one student.
      const early = a.student("Okon Emem");
      const first = await enrolmentOf(tx, early.id, term1);
      await tx.insert(t.enrolment).values({ ...first, id: undefined, termId: term2, createdAt: undefined, updatedAt: undefined });
      const p4 = await added(tx, a.cls("Primary 4").id, "Offclass", "Pupil");
      await tx.update(t.schoolClass).set({ isActive: false }).where(eq(t.schoolClass.id, a.cls("Primary 4").id));

      const open = await tx.execute<{ n: number }>(sql`select count(*)::int as n from enrolment e join student s on s.id = e.student_id
        join class c on c.id = e.class_id where e.term_id = ${term1} and e.withdrawn_on is null and s.status = 'active' and c.is_active`);
      const expected = open.rows[0].n - 1;

      const carried = await setCurrentTerm(ctx, { termId: term2 });
      expect(carried).toEqual({ carried: expected, classOff: 1 });
      expect(await enrolmentOf(tx, leaver.id, term2)).toBeUndefined();
      expect(await enrolmentOf(tx, p4, term2)).toBeUndefined();
      expect(await enrolmentOf(tx, a.student("Etim Blessing").id, term2)).toMatchObject({ classId: a.cls("JSS 2 Gold").id });

      expect(await setCurrentTerm(ctx, { termId: term1 })).toEqual({ carried: 0, classOff: 0 });
      expect(await setCurrentTerm(ctx, { termId: term2 })).toMatchObject({ carried: 0 });
    });
  });
});

describe("AC-15: the checklist", () => {
  it("names the classes still missing a form master or students", async () => {
    await inRollback(async (tx) => {
      const progress = await getEnrolmentProgress(teamCtx(tx));
      expect(progress.staff).toEqual({ done: false, missing: ["Primary 4"] });
      expect(progress.students).toEqual({ done: false, missing: ["Primary 4"] });

      const teacher = await newTeacher(tx);
      await setFormTeacher(teamCtx(tx), { classId: a.cls("Primary 4").id, staffId: teacher.staffId });
      await added(tx, a.cls("Primary 4").id, "Ready", "Now");
      const done = await getEnrolmentProgress(teamCtx(tx));
      expect(done.staff.done && done.students.done).toBe(true);
    });
  });
});

describe("AC-16: our team only, inside the school", () => {
  it("refuses teachers and view as sessions, and treats another school's ids as not found", async () => {
    await inRollback(async (tx) => {
      const funke = (await tx.select().from(t.staff).where(and(eq(t.staff.schoolId, a.schoolId), eq(t.staff.fullName, "Funke Adewale"))))[0];
      const asTeacher = teacherCtx(tx, funke.id);
      const viewingAs = schoolContext({ schoolId: a.schoolId, userId: "team", db: tx, actor: { kind: "admin", readOnly: true } });
      const input = { classId: a.cls("JSS 2 Gold").id, surname: "No", otherNames: "Entry", gender: "male", confirmDuplicate: true };
      await expect(addStudent(asTeacher, input)).rejects.toBeInstanceOf(NotFound);
      await expect(addStudent(viewingAs, input)).rejects.toBeInstanceOf(NotFound);
      await expect(setFormTeacher(asTeacher, { classId: input.classId, staffId: funke.id })).rejects.toBeInstanceOf(NotFound);
      await expect(getClassRoster(asTeacher, { classId: input.classId })).rejects.toBeInstanceOf(NotFound);

      const fromB = b.student("Okon Emem");
      await expect(saveStudent(teamCtx(tx), { studentId: fromB.id, surname: "Okon", otherNames: "Emem", gender: "male" })).rejects.toBeInstanceOf(NotFound);
      await expect(addStudent(teamCtx(tx), { ...input, classId: b.cls("JSS 2 Gold").id })).rejects.toBeInstanceOf(NotFound);
      await expect(moveStudent(teamCtx(tx), { enrolmentId: (await enrolmentOf(tx, fromB.id, b.term(1).id)).id, toClassId: a.cls("Primary 4").id })).rejects.toBeInstanceOf(NotFound);
    });
  });
});
