import "server-only";

import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  academicSession,
  asset,
  classSubject,
  classTeacher,
  enrolment,
  rating,
  resultPin,
  school,
  schoolClass,
  schoolSubject,
  score,
  scoreChange,
  section,
  staff,
  student,
  studentElective,
  studentGuardian,
  term,
  termReport,
} from "@/db/schema";
import { normaliseAdmissionNo, readStudent, type StudentFields } from "@/lib/enrolment-rules";
import { formatStudentNo } from "@/lib/student-number";

import { assertNotTeacher, assertWritable } from "./access";
import type { Executor, SchoolContext } from "./context";
import { DataError, NoCurrentTerm, NotFound } from "./errors";
import { parentsOf, unlinkIn } from "./guardians";
import { assertTermsOpen } from "./release";
import { readJpegSize } from "./setup";
import { assertTeam, type FormResult, lagosToday, type NeedsConfirm, plural, violatedConstraint } from "./team";

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

// Enrolling students class by class (spec 0008, AC-4 to AC-13). Our team only;
// the admin lists always work on the current term.

type StudentRef = { surname: string; otherNames: string };

/** As on the school register: OKAFOR Chinedu. */
export const registerName = (s: StudentRef) => `${s.surname.toUpperCase()} ${s.otherNames}`;

const ADMISSION_KEY = "student_school_admission_norm_key";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The student who already has this admission number, if any. */
async function admissionHolder(db: Executor, schoolId: string, admissionNo: string, exceptStudentId?: string) {
  const [holder] = await db
    .select({ surname: student.surname, otherNames: student.otherNames })
    .from(student)
    .where(
      and(
        eq(student.schoolId, schoolId),
        sql`upper(regexp_replace(${student.admissionNo}, '\\s', '', 'g')) = ${normaliseAdmissionNo(admissionNo)}`,
        exceptStudentId ? ne(student.id, exceptStudentId) : undefined,
      ),
    );
  return holder ?? null;
}

const admissionTaken = (admissionNo: string, holder: StudentRef) => ({
  ok: false as const,
  field: "admissionNo",
  error: `${admissionNo} already belongs to ${registerName(holder)}.`,
});

/**
 * The current term, share locked inside the caller's transaction (AC-13): a
 * term switch waits for this save, or this save waits and reads the new term.
 */
export async function lockCurrentTerm(tx: Executor, schoolId: string) {
  // A switch that commits while we wait hides the old row; reading again finds the new one.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [row] = await tx
      .select({ id: term.id, sessionId: term.sessionId, number: term.number, startsOn: term.startsOn })
      .from(term)
      .where(and(eq(term.schoolId, schoolId), eq(term.isCurrent, true)))
      .for("share");
    if (row) return row;
  }
  throw new NoCurrentTerm();
}

async function currentTermOrNull(ctx: SchoolContext) {
  const [row] = await ctx.db
    .select({ id: term.id, number: term.number, startsOn: term.startsOn, sessionId: term.sessionId, sessionName: academicSession.name })
    .from(term)
    .innerJoin(academicSession, eq(academicSession.id, term.sessionId))
    .where(and(eq(term.schoolId, ctx.schoolId), eq(term.isCurrent, true)));
  return row ?? null;
}

// ---------- The Students page ----------

/** Every active class by section, with its students this term and its form master (AC-4). */
export async function getStudentsOverview(ctx: SchoolContext) {
  assertTeam(ctx.actor);
  const current = await currentTermOrNull(ctx);
  const [sections, classes, counts, heads] = await Promise.all([
    ctx.db
      .select({ id: section.id, name: section.name, teacherTitle: section.teacherTitle })
      .from(section)
      .where(eq(section.schoolId, ctx.schoolId))
      .orderBy(asc(section.stage)),
    ctx.db
      .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.isActive, true)))
      .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)),
    current
      ? ctx.db
          .select({ classId: enrolment.classId, n: count() })
          .from(enrolment)
          .where(and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.termId, current.id), isNull(enrolment.withdrawnOn)))
          .groupBy(enrolment.classId)
      : [],
    current
      ? ctx.db
          .select({ classId: classTeacher.classId, title: staff.title, fullName: staff.fullName })
          .from(classTeacher)
          .innerJoin(staff, eq(staff.id, classTeacher.staffId))
          .where(and(eq(classTeacher.schoolId, ctx.schoolId), eq(classTeacher.sessionId, current.sessionId)))
      : [],
  ]);
  return {
    currentTerm: current,
    sections: sections
      .map((s) => ({
        ...s,
        classes: classes
          .filter((c) => c.sectionId === s.id)
          .map((c) => {
            const head = heads.find((h) => h.classId === c.id);
            return {
              id: c.id,
              name: c.name,
              students: counts.find((x) => x.classId === c.id)?.n ?? 0,
              formTeacher: head ? [head.title, head.fullName].filter(Boolean).join(" ") : null,
            };
          }),
      }))
      .filter((s) => s.classes.length > 0),
  };
}

/**
 * One class's list for the current term (AC-4 to AC-12): open and left
 * enrolments, each student's parents and electives, and what each may still
 * have done to them (move, remove). A class is a few dozen students at most.
 */
export async function getClassRoster(ctx: SchoolContext, input: { classId: string }) {
  assertTeam(ctx.actor);
  const [cls] = await ctx.db
    .select({
      id: schoolClass.id,
      name: schoolClass.name,
      isActive: schoolClass.isActive,
      sectionId: schoolClass.sectionId,
      sectionName: section.name,
      teacherTitle: section.teacherTitle,
      schoolCode: school.code,
    })
    .from(schoolClass)
    .innerJoin(section, eq(section.id, schoolClass.sectionId))
    .innerJoin(school, eq(school.id, schoolClass.schoolId))
    .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
  if (!cls) throw new NotFound("Class");
  const current = await currentTermOrNull(ctx);
  const teachers = await ctx.db
    .select({ id: staff.id, title: staff.title, fullName: staff.fullName })
    .from(staff)
    .where(and(eq(staff.schoolId, ctx.schoolId), eq(staff.status, "active")))
    .orderBy(asc(staff.fullName));
  const named = (t: { title: string | null; fullName: string }) => [t.title, t.fullName].filter(Boolean).join(" ");
  if (!current) return { cls, term: null, formTeacher: null, teachers: teachers.map((t) => ({ id: t.id, name: named(t) })), students: [], electiveSubjects: [], otherClasses: [] };

  const [head, rows, electiveSubjects, otherClasses] = await Promise.all([
    ctx.db
      .select({ staffId: classTeacher.staffId, title: staff.title, fullName: staff.fullName })
      .from(classTeacher)
      .innerJoin(staff, eq(staff.id, classTeacher.staffId))
      .where(and(eq(classTeacher.schoolId, ctx.schoolId), eq(classTeacher.sessionId, current.sessionId), eq(classTeacher.classId, cls.id))),
    ctx.db
      .select({
        enrolmentId: enrolment.id,
        withdrawnOn: enrolment.withdrawnOn,
        studentId: student.id,
        studentNo: student.studentNo,
        admissionNo: student.admissionNo,
        surname: student.surname,
        otherNames: student.otherNames,
        gender: student.gender,
        house: student.house,
        photoAssetId: student.photoAssetId,
        leftOn: student.leftOn,
      })
      .from(enrolment)
      .innerJoin(student, eq(student.id, enrolment.studentId))
      .where(and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.termId, current.id), eq(enrolment.classId, cls.id)))
      .orderBy(asc(student.surname), asc(student.otherNames)),
    ctx.db
      .select({ id: schoolSubject.id, name: schoolSubject.name, shortName: schoolSubject.shortName })
      .from(classSubject)
      .innerJoin(schoolSubject, eq(schoolSubject.id, classSubject.subjectId))
      .where(and(eq(classSubject.schoolId, ctx.schoolId), eq(classSubject.sessionId, current.sessionId), eq(classSubject.classId, cls.id), eq(classSubject.isElective, true)))
      .orderBy(asc(schoolSubject.sortOrder), asc(schoolSubject.name)),
    ctx.db
      .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.isActive, true), ne(schoolClass.id, cls.id)))
      .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)),
  ]);

  const studentIds = rows.map((r) => r.studentId);
  const enrolmentIds = rows.map((r) => r.enrolmentId);
  const [parents, electives, scoresNow, ratingsNow, records] = await Promise.all([
    parentsOf(ctx, studentIds),
    studentIds.length === 0
      ? []
      : ctx.db
          .select({ studentId: studentElective.studentId, subjectId: studentElective.subjectId, name: schoolSubject.name })
          .from(studentElective)
          .innerJoin(schoolSubject, eq(schoolSubject.id, studentElective.subjectId))
          .where(and(eq(studentElective.sessionId, current.sessionId), inArray(studentElective.studentId, studentIds)))
          .orderBy(asc(schoolSubject.sortOrder)),
    enrolmentIds.length === 0
      ? []
      : ctx.db.select({ enrolmentId: score.enrolmentId, n: count() }).from(score).where(inArray(score.enrolmentId, enrolmentIds)).groupBy(score.enrolmentId),
    enrolmentIds.length === 0
      ? []
      : ctx.db.select({ enrolmentId: rating.enrolmentId, n: count() }).from(rating).where(inArray(rating.enrolmentId, enrolmentIds)).groupBy(rating.enrolmentId),
    studentsWithRecords(ctx.db, studentIds),
  ]);

  return {
    cls,
    term: current,
    formTeacher: head[0] ? { staffId: head[0].staffId, name: named(head[0]) } : null,
    teachers: teachers.map((t) => ({ id: t.id, name: named(t) })),
    electiveSubjects,
    otherClasses,
    students: rows.map((r) => ({
      ...r,
      studentNo: formatStudentNo(cls.schoolCode, r.studentNo),
      scores: scoresNow.find((s) => s.enrolmentId === r.enrolmentId)?.n ?? 0,
      ratings: ratingsNow.find((s) => s.enrolmentId === r.enrolmentId)?.n ?? 0,
      canRemove: !records.has(r.studentId),
      parents: parents.filter((p) => p.studentId === r.studentId),
      electives: electives.filter((e) => e.studentId === r.studentId).map((e) => ({ subjectId: e.subjectId, name: e.name })),
    })),
  };
}

export type ClassRoster = Awaited<ReturnType<typeof getClassRoster>>;

/** Students with any results record in any term: scores, score history, remarks, ratings or PIN slips (AC-12, spec 0014 AC-4). */
export async function studentsWithRecords(db: Executor, studentIds: string[]) {
  if (studentIds.length === 0) return new Set<string>();
  const holders = await Promise.all(
    [score, scoreChange, termReport, rating, resultPin].map((table) =>
      db
        .selectDistinct({ studentId: enrolment.studentId })
        .from(table)
        .innerJoin(enrolment, eq(enrolment.id, table.enrolmentId))
        .where(inArray(enrolment.studentId, studentIds)),
    ),
  );
  return new Set(holders.flat().map((h) => h.studentId));
}

// ---------- Adding and fixing students ----------

export type AddStudentResult = FormResult<{ studentId: string; studentNo: string }> | NeedsConfirm;

/**
 * Adds one student to a class for the current term (AC-5, AC-6): the next
 * student number, then an enrolment. A name already in the class this term
 * asks "Add anyway?" first; a taken admission number is refused, naming the holder.
 */
export async function addStudent(
  ctx: SchoolContext,
  input: StudentFields & { classId: string; confirmDuplicate: boolean },
): Promise<AddStudentResult> {
  assertTeam(ctx.actor);
  const fields = readStudent({ ...input, house: null });
  if (!fields.ok) return fields;
  try {
    return await ctx.db.transaction(async (tx): Promise<AddStudentResult> => {
      const current = await lockCurrentTerm(tx, ctx.schoolId);
      await assertTermsOpen(tx, ctx.schoolId, [current.id]);
      const [cls] = await tx
        .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId, isActive: schoolClass.isActive })
        .from(schoolClass)
        .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)))
        .for("share");
      if (!cls) throw new NotFound("Class");
      if (!cls.isActive) return { ok: false, field: "class", error: `${cls.name} is switched off. Switch it back on from the Classes page first.` };

      if (fields.admissionNo) {
        const holder = await admissionHolder(tx, ctx.schoolId, fields.admissionNo);
        if (holder) return admissionTaken(fields.admissionNo, holder);
      }
      if (!input.confirmDuplicate) {
        const [same] = await tx
          .select({ surname: student.surname, otherNames: student.otherNames })
          .from(enrolment)
          .innerJoin(student, eq(student.id, enrolment.studentId))
          .where(
            and(
              eq(enrolment.termId, current.id),
              eq(enrolment.classId, cls.id),
              isNull(enrolment.withdrawnOn),
              sql`lower(${student.surname}) = lower(${fields.surname})`,
              sql`lower(${student.otherNames}) = lower(${fields.otherNames})`,
            ),
          );
        if (same) {
          const name = registerName(same);
          return { ok: false, field: "surname", needsConfirm: true, error: `There is already ${/^[AEIOU]/.test(name) ? "an" : "a"} ${name} in ${cls.name}. Add anyway?` };
        }
      }

      const [studentNo] = await allocateStudentNumbers({ ...ctx, db: tx }, { count: 1 });
      const [created] = await tx
        .insert(student)
        .values({
          schoolId: ctx.schoolId,
          studentNo,
          admissionNo: fields.admissionNo,
          surname: fields.surname,
          otherNames: fields.otherNames,
          gender: fields.gender,
        })
        .returning({ id: student.id });
      await tx.insert(enrolment).values({
        schoolId: ctx.schoolId,
        studentId: created.id,
        termId: current.id,
        sessionId: current.sessionId,
        classId: cls.id,
        sectionId: cls.sectionId,
      });
      const [{ code }] = await tx.select({ code: school.code }).from(school).where(eq(school.id, ctx.schoolId));
      return { ok: true, studentId: created.id, studentNo: formatStudentNo(code, studentNo) };
    });
  } catch (error) {
    if (fields.admissionNo && violatedConstraint(error)?.constraint === ADMISSION_KEY) return admissionClash(ctx, fields.admissionNo);
    throw error;
  }
}

/** Two saves of the same admission number at once: the database refused one; say who has it. */
async function admissionClash(ctx: SchoolContext, admissionNo: string, exceptStudentId?: string) {
  const holder = await admissionHolder(ctx.db, ctx.schoolId, admissionNo, exceptStudentId);
  return holder ? admissionTaken(admissionNo, holder) : { ok: false as const, field: "admissionNo", error: `${admissionNo} was just given to another student. Refresh the page.` };
}

/** Fixes a student's details (AC-7), with the admission number rules of AC-6. */
export async function saveStudent(ctx: SchoolContext, input: StudentFields & { studentId: string }): Promise<FormResult> {
  assertTeam(ctx.actor);
  const fields = readStudent(input);
  if (!fields.ok) return fields;
  try {
    return await ctx.db.transaction(async (tx) => {
      const [found] = await tx
        .select({ id: student.id })
        .from(student)
        .where(and(eq(student.schoolId, ctx.schoolId), eq(student.id, input.studentId)))
        .for("update");
      if (!found) throw new NotFound("Student");
      if (fields.admissionNo) {
        const holder = await admissionHolder(tx, ctx.schoolId, fields.admissionNo, found.id);
        if (holder) return admissionTaken(fields.admissionNo, holder);
      }
      const { surname, otherNames, gender, admissionNo, house } = fields;
      await tx.update(student).set({ surname, otherNames, gender, admissionNo, house }).where(eq(student.id, found.id));
      return { ok: true as const };
    });
  } catch (error) {
    if (fields.admissionNo && violatedConstraint(error)?.constraint === ADMISSION_KEY) return admissionClash(ctx, fields.admissionNo, input.studentId);
    throw error;
  }
}

// ---------- Photos ----------

export const MAX_PHOTO_BYTES = 100 * 1024;

/**
 * Saves a student's passport photo (AC-7): a JPEG the browser has already
 * cropped to 3 by 4 and shrunk. Replaces and deletes the old one.
 */
export async function saveStudentPhoto(ctx: SchoolContext, input: { studentId: string; bytes: Uint8Array }): Promise<FormResult<{ assetId: string }>> {
  assertTeam(ctx.actor);
  if (input.bytes.byteLength > MAX_PHOTO_BYTES) return { ok: false, field: "file", error: "That photo is too large. Use one under 100 KB." };
  const size = readJpegSize(input.bytes);
  if (!size || size.width < 120 || size.height < 120 || size.width > 800 || size.height > 800) {
    return { ok: false, field: "file", error: "That file isn't a photo we can use. Try a JPG or PNG photo." };
  }
  return ctx.db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ id: student.id, previous: student.photoAssetId })
      .from(student)
      .where(and(eq(student.schoolId, ctx.schoolId), eq(student.id, input.studentId)))
      .for("update");
    if (!owner) throw new NotFound("Student");
    const [created] = await tx
      .insert(asset)
      .values({ schoolId: ctx.schoolId, kind: "student_photo", mimeType: "image/jpeg", bytes: Buffer.from(input.bytes), ...size })
      .returning({ id: asset.id });
    await tx.update(student).set({ photoAssetId: created.id }).where(eq(student.id, owner.id));
    if (owner.previous) await tx.delete(asset).where(and(eq(asset.schoolId, ctx.schoolId), eq(asset.id, owner.previous)));
    return { ok: true as const, assetId: created.id };
  });
}

export async function removeStudentPhoto(ctx: SchoolContext, input: { studentId: string }): Promise<FormResult> {
  assertTeam(ctx.actor);
  return ctx.db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ id: student.id, previous: student.photoAssetId })
      .from(student)
      .where(and(eq(student.schoolId, ctx.schoolId), eq(student.id, input.studentId)))
      .for("update");
    if (!owner) throw new NotFound("Student");
    if (owner.previous) {
      await tx.update(student).set({ photoAssetId: null }).where(eq(student.id, owner.id));
      await tx.delete(asset).where(and(eq(asset.schoolId, ctx.schoolId), eq(asset.id, owner.previous)));
    }
    return { ok: true as const };
  });
}

// ---------- Move, left, remove ----------

/** Score rows in a subject this session for one student, in any class or term (AC-9, AC-10). */
async function sessionScoresBySubject(db: Executor, input: { studentIds: string[]; sessionId: string; subjectIds: string[] }) {
  if (input.studentIds.length === 0 || input.subjectIds.length === 0) return [];
  return db
    .select({ studentId: enrolment.studentId, subjectId: classSubject.subjectId, n: count() })
    .from(score)
    .innerJoin(enrolment, eq(enrolment.id, score.enrolmentId))
    .innerJoin(classSubject, eq(classSubject.id, score.classSubjectId))
    .where(and(eq(score.sessionId, input.sessionId), inArray(enrolment.studentId, input.studentIds), inArray(classSubject.subjectId, input.subjectIds)))
    .groupBy(enrolment.studentId, classSubject.subjectId);
}

/**
 * Moves a student's current term enrolment to another active class (AC-10),
 * only while it has no scores. The enrolment is locked first, so a score saved
 * meanwhile waits and then fails its link to the old class.
 */
export async function moveStudent(ctx: SchoolContext, input: { enrolmentId: string; toClassId: string }): Promise<FormResult<{ className: string; removedElectives: string[] }>> {
  assertTeam(ctx.actor);
  return ctx.db.transaction(async (tx) => {
    const current = await lockCurrentTerm(tx, ctx.schoolId);
    await assertTermsOpen(tx, ctx.schoolId, [current.id]);
    const [row] = await tx
      .select({
        id: enrolment.id,
        termId: enrolment.termId,
        classId: enrolment.classId,
        sectionId: enrolment.sectionId,
        withdrawnOn: enrolment.withdrawnOn,
        studentId: student.id,
        surname: student.surname,
        otherNames: student.otherNames,
      })
      .from(enrolment)
      .innerJoin(student, eq(student.id, enrolment.studentId))
      .where(and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.id, input.enrolmentId)))
      .for("update", { of: enrolment });
    if (!row) throw new NotFound("Student");
    const who = registerName(row);
    if (row.termId !== current.id) return { ok: false as const, field: "class", error: "Only this term’s class can be changed." };
    if (row.withdrawnOn) return { ok: false as const, field: "class", error: `${who} has left. Undo that first.` };

    const [target] = await tx
      .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId, isActive: schoolClass.isActive })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.toClassId)))
      .for("share");
    if (!target) throw new NotFound("Class");
    if (target.id === row.classId) return { ok: false as const, field: "class", error: `${who} is already in ${target.name}.` };
    if (!target.isActive) return { ok: false as const, field: "class", error: `${target.name} is switched off.` };

    const [[scored], [rated]] = await Promise.all([
      tx.select({ n: count() }).from(score).where(eq(score.enrolmentId, row.id)),
      tx.select({ n: count() }).from(rating).where(eq(rating.enrolmentId, row.id)),
    ]);
    if (scored.n > 0) {
      return { ok: false as const, field: "class", error: `${who} has ${plural(scored.n, "score")} this term, so can’t change class. Clear those scores first.` };
    }
    if (target.sectionId !== row.sectionId && rated.n > 0) {
      return { ok: false as const, field: "class", error: `${who} has ${plural(rated.n, "rating")} this term, which belong to this section. ${target.name} is in another section.` };
    }

    // The class link is composite (class and section), so both change together.
    await tx.update(enrolment).set({ classId: target.id, sectionId: target.sectionId }).where(eq(enrolment.id, row.id));

    // Electives the new class doesn't offer go, unless they already have scores this session.
    const [registered, offered] = await Promise.all([
      tx
        .select({ id: studentElective.id, subjectId: studentElective.subjectId, name: schoolSubject.name })
        .from(studentElective)
        .innerJoin(schoolSubject, eq(schoolSubject.id, studentElective.subjectId))
        .where(and(eq(studentElective.studentId, row.studentId), eq(studentElective.sessionId, current.sessionId)))
        .for("update", { of: studentElective }),
      tx
        .select({ subjectId: classSubject.subjectId })
        .from(classSubject)
        .where(and(eq(classSubject.classId, target.id), eq(classSubject.sessionId, current.sessionId), eq(classSubject.isElective, true))),
    ]);
    const stray = registered.filter((r) => !offered.some((o) => o.subjectId === r.subjectId));
    const scoredIn = await sessionScoresBySubject(tx, { studentIds: [row.studentId], sessionId: current.sessionId, subjectIds: stray.map((s) => s.subjectId) });
    const drop = stray.filter((s) => !scoredIn.some((x) => x.subjectId === s.subjectId));
    if (drop.length > 0) await tx.delete(studentElective).where(inArray(studentElective.id, drop.map((d) => d.id)));
    return { ok: true as const, className: target.name, removedElectives: drop.map((d) => d.name) };
  });
}

/**
 * Marks a student as left from a date, withdrawing this term's enrolment
 * (AC-11); leftOn null is Undo, which restores both.
 */
export async function setStudentLeft(ctx: SchoolContext, input: { studentId: string; leftOn: string | null }): Promise<FormResult> {
  assertTeam(ctx.actor);
  return ctx.db.transaction(async (tx) => {
    const current = await lockCurrentTerm(tx, ctx.schoolId);
    await assertTermsOpen(tx, ctx.schoolId, [current.id]);
    if (input.leftOn !== null) {
      if (!ISO_DATE.test(input.leftOn)) return { ok: false as const, field: "leftOn", error: "Choose the date they left." };
      if (input.leftOn > lagosToday()) return { ok: false as const, field: "leftOn", error: "The date they left can’t be in the future." };
      if (input.leftOn < current.startsOn) return { ok: false as const, field: "leftOn", error: "Choose a date in this term. Earlier terms stay as they were." };
    }
    const [found] = await tx
      .select({ id: student.id, status: student.status, surname: student.surname, otherNames: student.otherNames })
      .from(student)
      .where(and(eq(student.schoolId, ctx.schoolId), eq(student.id, input.studentId)))
      .for("update");
    if (!found) throw new NotFound("Student");
    const leaving = input.leftOn !== null;
    if (leaving && found.status !== "active") return { ok: false as const, field: "leftOn", error: `${registerName(found)} is already marked as left.` };
    if (!leaving && found.status !== "left") return { ok: true as const };

    await tx
      .update(student)
      .set(leaving ? { status: "left", leftOn: input.leftOn } : { status: "active", leftOn: null })
      .where(eq(student.id, found.id));
    await tx
      .update(enrolment)
      .set({ withdrawnOn: input.leftOn })
      .where(and(eq(enrolment.studentId, found.id), eq(enrolment.termId, current.id)));
    return { ok: true as const };
  });
}

class HasRecords extends DataError {}

/**
 * Deletes a student added by mistake (AC-12): only with no scores, score
 * history, remarks or ratings in any term. Enrolments, electives, parent
 * links, parents left with no children, and the photo go with them.
 */
export async function removeStudent(ctx: SchoolContext, input: { studentId: string }): Promise<FormResult> {
  assertTeam(ctx.actor);
  const refused = { ok: false as const, field: "student", error: "This student already has results records, so can only be marked as left." };
  try {
    return await ctx.db.transaction(async (tx) => {
      const [found] = await tx
        .select({ id: student.id, photo: student.photoAssetId })
        .from(student)
        .where(and(eq(student.schoolId, ctx.schoolId), eq(student.id, input.studentId)))
        .for("update");
      if (!found) throw new NotFound("Student");
      // Locked, so a score saved meanwhile waits and then fails its link.
      const enrolled = await tx.select({ id: enrolment.id, termId: enrolment.termId }).from(enrolment).where(eq(enrolment.studentId, found.id)).for("update");
      await assertTermsOpen(tx, ctx.schoolId, enrolled.map((e) => e.termId));
      if ((await studentsWithRecords(tx, [found.id])).size > 0) throw new HasRecords();

      const links = await tx.select({ guardianId: studentGuardian.guardianId }).from(studentGuardian).where(eq(studentGuardian.studentId, found.id));
      for (const link of links) await unlinkIn(tx, ctx.schoolId, { studentId: found.id, guardianId: link.guardianId });
      await tx.delete(studentElective).where(eq(studentElective.studentId, found.id));
      await tx.delete(enrolment).where(eq(enrolment.studentId, found.id));
      await tx.delete(student).where(eq(student.id, found.id));
      if (found.photo) await tx.delete(asset).where(and(eq(asset.schoolId, ctx.schoolId), eq(asset.id, found.photo)));
      return { ok: true as const };
    });
  } catch (error) {
    // A record that slipped in during the delete is refused by its foreign key.
    if (error instanceof HasRecords || violatedConstraint(error)?.code === "23503") return refused;
    throw error;
  }
}

// ---------- Electives ----------

/**
 * Registers a class's electives for this session from its tick grid (AC-9).
 * Only this class's elective subjects are touched. Unticking one the student
 * has scores in this session refuses the whole save.
 */
export async function saveClassElectives(
  ctx: SchoolContext,
  input: { classId: string; ticks: { studentId: string; subjectId: string }[] },
): Promise<FormResult<{ added: number; removed: number }>> {
  assertTeam(ctx.actor);
  if (!Array.isArray(input.ticks) || input.ticks.some((t) => typeof t?.studentId !== "string" || typeof t?.subjectId !== "string")) {
    return { ok: false, field: "electives", error: "That save couldn’t be read. Reload the page and try again." };
  }
  return ctx.db.transaction(async (tx) => {
    const current = await lockCurrentTerm(tx, ctx.schoolId);
    await assertTermsOpen(tx, ctx.schoolId, [current.id]);
    const [cls] = await tx
      .select({ id: schoolClass.id, name: schoolClass.name })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
    if (!cls) throw new NotFound("Class");
    const [subjects, students] = await Promise.all([
      tx
        .select({ id: classSubject.subjectId, name: schoolSubject.name })
        .from(classSubject)
        .innerJoin(schoolSubject, eq(schoolSubject.id, classSubject.subjectId))
        .where(and(eq(classSubject.classId, cls.id), eq(classSubject.sessionId, current.sessionId), eq(classSubject.isElective, true)))
        .for("share", { of: classSubject }),
      tx
        .select({ id: student.id, surname: student.surname, otherNames: student.otherNames })
        .from(enrolment)
        .innerJoin(student, eq(student.id, enrolment.studentId))
        .where(and(eq(enrolment.termId, current.id), eq(enrolment.classId, cls.id), isNull(enrolment.withdrawnOn))),
    ]);
    if (subjects.length === 0) return { ok: false as const, field: "electives", error: `${cls.name} has no electives in this session.` };
    const subjectIds = subjects.map((s) => s.id);
    const studentIds = students.map((s) => s.id);
    for (const t of input.ticks) {
      if (!studentIds.includes(t.studentId)) throw new NotFound("Student");
      if (!subjectIds.includes(t.subjectId)) throw new NotFound("Subject");
    }
    const key = (t: { studentId: string; subjectId: string }) => `${t.studentId}:${t.subjectId}`;
    const wanted = new Set(input.ticks.map(key));

    const existing =
      studentIds.length === 0
        ? []
        : await tx
            .select({ id: studentElective.id, studentId: studentElective.studentId, subjectId: studentElective.subjectId })
            .from(studentElective)
            .where(and(eq(studentElective.sessionId, current.sessionId), inArray(studentElective.studentId, studentIds), inArray(studentElective.subjectId, subjectIds)))
            .for("update");
    const have = new Set(existing.map(key));
    const removals = existing.filter((e) => !wanted.has(key(e)));
    const additions = [...wanted].filter((k) => !have.has(k)).map((k) => {
      const [studentId, subjectId] = k.split(":");
      return { studentId, subjectId };
    });

    const scored = await sessionScoresBySubject(tx, {
      studentIds: [...new Set(removals.map((r) => r.studentId))],
      sessionId: current.sessionId,
      subjectIds: [...new Set(removals.map((r) => r.subjectId))],
    });
    const problems = removals.flatMap((r) => {
      const n = scored.find((s) => s.studentId === r.studentId && s.subjectId === r.subjectId)?.n ?? 0;
      if (n === 0) return [];
      const who = students.find((s) => s.id === r.studentId)!;
      return [`${registerName(who)} has ${plural(n, "score")} in ${subjects.find((s) => s.id === r.subjectId)!.name}.`];
    });
    if (problems.length > 0) return { ok: false as const, field: "electives", error: `Nothing was saved. ${problems.join(" ")} Clear those scores first, or keep the tick.` };

    if (removals.length > 0) await tx.delete(studentElective).where(inArray(studentElective.id, removals.map((r) => r.id)));
    if (additions.length > 0) {
      await tx.insert(studentElective).values(additions.map((a) => ({ schoolId: ctx.schoolId, sessionId: current.sessionId, ...a })));
    }
    return { ok: true as const, added: additions.length, removed: removals.length };
  });
}

// ---------- The setup checklist (AC-15) ----------

/** Staff: every active class has a form master this session. Students: every active class has someone this term. */
export async function getEnrolmentProgress(ctx: SchoolContext) {
  assertTeam(ctx.actor);
  const current = await currentTermOrNull(ctx);
  const classes = await ctx.db
    .select({ id: schoolClass.id, name: schoolClass.name })
    .from(schoolClass)
    .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.isActive, true)))
    .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name));
  if (!current) return { currentTerm: null, classes: classes.length, staff: { done: false, missing: [] }, students: { done: false, missing: [] } };
  const [headed, filled] = await Promise.all([
    ctx.db
      .select({ classId: classTeacher.classId })
      .from(classTeacher)
      .where(and(eq(classTeacher.schoolId, ctx.schoolId), eq(classTeacher.sessionId, current.sessionId))),
    ctx.db
      .selectDistinct({ classId: enrolment.classId })
      .from(enrolment)
      .where(and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.termId, current.id), isNull(enrolment.withdrawnOn))),
  ]);
  const noHead = classes.filter((c) => !headed.some((h) => h.classId === c.id)).map((c) => c.name);
  const empty = classes.filter((c) => !filled.some((f) => f.classId === c.id)).map((c) => c.name);
  return {
    currentTerm: current,
    classes: classes.length,
    staff: { done: classes.length > 0 && noHead.length === 0, missing: noHead },
    students: { done: classes.length > 0 && empty.length === 0, missing: empty },
  };
}

