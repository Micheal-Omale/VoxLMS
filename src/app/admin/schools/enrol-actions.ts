"use server";

import { refresh } from "next/cache";

import { requestMeta } from "@/server/auth/request-meta";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { NoCurrentTerm, NotFound, TermReleased } from "@/server/data";
import type { SchoolContext } from "@/server/data/context";
import { addGuardian, makePrimaryGuardian, type Relationship, saveGuardian, unlinkGuardian } from "@/server/data/guardians";
import { addTeacher, saveTeacher, setFormTeacher, setStaffLeft, setStaffRole } from "@/server/data/staff";
import { sqlState } from "@/server/data/team";
import {
  addStudent,
  moveStudent,
  removeStudent,
  removeStudentPhoto,
  saveClassElectives,
  saveStudent,
  setStudentLeft,
} from "@/server/data/students";

// Our team's enrolment actions (spec 0008). Each checks the caller is on our
// team (viewing as someone is not, so every write is refused, AC-16); the data
// functions check it again, keep every id inside the school, and validate
// everything sent.

type Refusal = { ok: false; field: string; error: string };

const WHAT: Record<string, string> = {
  Staff: "That teacher",
  Class: "That class",
  Student: "That student",
  Guardian: "That parent",
  Subject: "That subject",
};

async function run<T extends { ok: boolean }>(schoolId: string, fn: (ctx: SchoolContext, userId: string) => Promise<T>): Promise<T | Refusal> {
  const { ctx, viewer } = await requireTeamSchoolContext(String(schoolId));
  try {
    const result = await fn(ctx, viewer.userId);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof TermReleased) return { ok: false, field: "term", error: error.message };
    if (error instanceof NoCurrentTerm) return { ok: false, field: "term", error: "This school has no current term. Set one on the Session and terms page first." };
    if (error instanceof NotFound) return { ok: false, field: "id", error: `${WHAT[error.what] ?? "That record"} is no longer in this school. Refresh the page.` };
    // An id that isn't even an id (a tampered form) is "not found" too (AC-16).
    if (sqlState(error) === "22P02") return { ok: false, field: "id", error: "That record is no longer in this school. Refresh the page." };
    throw error;
  }
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const orNull = (value: unknown) => (typeof value === "string" && value ? value : null);

// ---------- Staff (AC-1 to AC-4) ----------

export async function addTeacherAction(schoolId: string, input: { title?: string; fullName: string; phone: string; confirmSamePerson?: boolean; role?: "teacher" | "principal" }) {
  return run(schoolId, async (ctx, userId) =>
    addTeacher(
      ctx,
      {
        title: str(input?.title),
        fullName: str(input?.fullName),
        phone: str(input?.phone),
        confirmSamePerson: input?.confirmSamePerson === true,
        role: input?.role === "principal" ? "principal" : "teacher",
      },
      { actorUserId: userId, meta: await requestMeta() },
    ),
  );
}

export async function setStaffRoleAction(schoolId: string, staffId: string, role: "teacher" | "principal") {
  return run(schoolId, (ctx) => setStaffRole(ctx, { staffId: String(staffId), role }));
}

export async function saveTeacherAction(schoolId: string, staffId: string, input: { title?: string; fullName: string; phone?: string }) {
  return run(schoolId, (ctx) => saveTeacher(ctx, { staffId: String(staffId), title: str(input?.title), fullName: str(input?.fullName), phone: orNull(input?.phone) }));
}

export async function setStaffLeftAction(schoolId: string, staffId: string, left: boolean) {
  return run(schoolId, async (ctx, userId) => setStaffLeft(ctx, { staffId: String(staffId), left: left === true }, { actorUserId: userId, meta: await requestMeta() }));
}

export async function setFormTeacherAction(schoolId: string, classId: string, staffId: string | null) {
  return run(schoolId, (ctx) => setFormTeacher(ctx, { classId: String(classId), staffId: orNull(staffId) }));
}

// ---------- Students (AC-5 to AC-12) ----------

type StudentInput = { surname: string; otherNames: string; gender: string; admissionNo?: string; house?: string };
const studentFields = (input: StudentInput) => ({
  surname: str(input?.surname),
  otherNames: str(input?.otherNames),
  gender: str(input?.gender),
  admissionNo: str(input?.admissionNo),
  house: str(input?.house),
});

export async function addStudentAction(schoolId: string, classId: string, input: StudentInput & { confirmDuplicate?: boolean }) {
  return run(schoolId, (ctx) => addStudent(ctx, { classId: String(classId), ...studentFields(input), confirmDuplicate: input?.confirmDuplicate === true }));
}

export async function saveStudentAction(schoolId: string, studentId: string, input: StudentInput) {
  return run(schoolId, (ctx) => saveStudent(ctx, { studentId: String(studentId), ...studentFields(input) }));
}

export async function removeStudentPhotoAction(schoolId: string, studentId: string) {
  return run(schoolId, (ctx) => removeStudentPhoto(ctx, { studentId: String(studentId) }));
}

export async function moveStudentAction(schoolId: string, enrolmentId: string, toClassId: string) {
  return run(schoolId, (ctx) => moveStudent(ctx, { enrolmentId: String(enrolmentId), toClassId: String(toClassId) }));
}

export async function setStudentLeftAction(schoolId: string, studentId: string, leftOn: string | null) {
  return run(schoolId, (ctx) => setStudentLeft(ctx, { studentId: String(studentId), leftOn: orNull(leftOn) }));
}

export async function removeStudentAction(schoolId: string, studentId: string) {
  return run(schoolId, (ctx) => removeStudent(ctx, { studentId: String(studentId) }));
}

export async function saveClassElectivesAction(schoolId: string, classId: string, ticks: { studentId: string; subjectId: string }[]) {
  return run(schoolId, (ctx) =>
    saveClassElectives(ctx, {
      classId: String(classId),
      ticks: Array.isArray(ticks) ? ticks.map((t) => ({ studentId: str(t?.studentId), subjectId: str(t?.subjectId) })) : [],
    }),
  );
}

// ---------- Parents (AC-8) ----------

type ParentInput = { fullName?: string; phone?: string; relationship: string };

export async function addGuardianAction(schoolId: string, studentId: string, input: ParentInput & { linkTo?: string | null; newParent?: boolean }) {
  return run(schoolId, (ctx) =>
    addGuardian(ctx, {
      studentId: String(studentId),
      fullName: str(input?.fullName),
      phone: str(input?.phone),
      relationship: str(input?.relationship) as Relationship,
      linkTo: orNull(input?.linkTo),
      newParent: input?.newParent === true,
    }),
  );
}

export async function saveGuardianAction(schoolId: string, studentId: string, guardianId: string, input: ParentInput) {
  return run(schoolId, (ctx) =>
    saveGuardian(ctx, {
      studentId: String(studentId),
      guardianId: String(guardianId),
      fullName: str(input?.fullName),
      phone: str(input?.phone),
      relationship: str(input?.relationship) as Relationship,
    }),
  );
}

export async function unlinkGuardianAction(schoolId: string, studentId: string, guardianId: string) {
  return run(schoolId, (ctx) => unlinkGuardian(ctx, { studentId: String(studentId), guardianId: String(guardianId) }));
}

export async function makePrimaryGuardianAction(schoolId: string, studentId: string, guardianId: string) {
  return run(schoolId, (ctx) => makePrimaryGuardian(ctx, { studentId: String(studentId), guardianId: String(guardianId) }));
}
