import "server-only";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { enrolment, guardian, schoolClass, student, studentGuardian, term } from "@/db/schema";
import { normaliseNigerianPhone } from "@/lib/phone";

import { assertNotTeacher, assertWritable } from "./access";
import type { Executor, SchoolContext } from "./context";
import { DataError, NotFound } from "./errors";
import { assertTeam, type FormResult, type NeedsConfirm, tidy } from "./team";

export class TooManyGuardians extends DataError {
  constructor() {
    super("A student can have at most two parents or guardians");
  }
}

export class AlreadyLinked extends DataError {
  constructor() {
    super("This parent is already linked to this student");
  }
}

export type Relationship = "mother" | "father" | "guardian";
const RELATIONSHIPS: Relationship[] = ["mother", "father", "guardian"];

/**
 * Links a parent to a child (spec 0003, AC-9; spec 0008, AC-8): at most two
 * per child, and the first one linked becomes primary. Runs in the caller's
 * transaction (ctx.db), so a refused link leaves nothing behind. The child and
 * the parent are locked so two links at once can't both pass.
 */
export async function linkGuardian(ctx: SchoolContext, input: { studentId: string; guardianId: string; relationship: Relationship }) {
  assertNotTeacher(ctx, "Student");
  assertWritable(ctx);
  const [child] = await ctx.db
    .select({ id: student.id })
    .from(student)
    .where(and(eq(student.schoolId, ctx.schoolId), eq(student.id, input.studentId)))
    .for("update");
  if (!child) throw new NotFound("Student");
  const [parent] = await ctx.db
    .select({ id: guardian.id })
    .from(guardian)
    .where(and(eq(guardian.schoolId, ctx.schoolId), eq(guardian.id, input.guardianId)))
    .for("update");
  if (!parent) throw new NotFound("Guardian");

  const links = await ctx.db.select({ guardianId: studentGuardian.guardianId }).from(studentGuardian).where(eq(studentGuardian.studentId, child.id));
  if (links.some((l) => l.guardianId === parent.id)) throw new AlreadyLinked();
  if (links.length >= 2) throw new TooManyGuardians();

  await ctx.db.insert(studentGuardian).values({
    schoolId: ctx.schoolId,
    studentId: child.id,
    guardianId: parent.id,
    relationship: input.relationship,
    isPrimary: links.length === 0,
  });
}

/** Each child's class in the current term, for "parent of Okafor Chidi (JSS 1 Gold)". */
async function childrenOf(db: Executor, schoolId: string, guardianIds: string[]) {
  if (guardianIds.length === 0) return [];
  return db
    .select({
      guardianId: studentGuardian.guardianId,
      studentId: student.id,
      surname: student.surname,
      otherNames: student.otherNames,
      className: schoolClass.name,
    })
    .from(studentGuardian)
    .innerJoin(student, eq(student.id, studentGuardian.studentId))
    .leftJoin(term, and(eq(term.schoolId, student.schoolId), eq(term.isCurrent, true)))
    .leftJoin(enrolment, and(eq(enrolment.studentId, student.id), eq(enrolment.termId, term.id)))
    .leftJoin(schoolClass, eq(schoolClass.id, enrolment.classId))
    .where(and(eq(studentGuardian.schoolId, schoolId), inArray(studentGuardian.guardianId, guardianIds)))
    .orderBy(asc(student.surname), asc(student.otherNames));
}

export type GuardianMatch = { guardianId: string; fullName: string; children: { studentId: string; name: string; className: string | null }[] };

/** Parents in this school who already have this phone, with their children (AC-8). */
export async function findGuardiansByPhone(ctx: SchoolContext, input: { phone: string; exceptStudentId?: string }): Promise<GuardianMatch[] | null> {
  assertTeam(ctx.actor);
  const phone = normaliseNigerianPhone(input.phone);
  if (!phone) return null;
  const parents = await ctx.db
    .select({ id: guardian.id, fullName: guardian.fullName })
    .from(guardian)
    .where(and(eq(guardian.schoolId, ctx.schoolId), eq(guardian.phone, phone)))
    .orderBy(asc(guardian.fullName));
  const children = await childrenOf(ctx.db, ctx.schoolId, parents.map((p) => p.id));
  return parents
    .map((p) => ({
      guardianId: p.id,
      fullName: p.fullName,
      children: children
        .filter((c) => c.guardianId === p.id)
        .map((c) => ({ studentId: c.studentId, name: `${c.surname} ${c.otherNames}`, className: c.className })),
    }))
    .filter((p) => !p.children.some((c) => c.studentId === input.exceptStudentId));
}

type GuardianFields = { fullName: string; phone: string; relationship: Relationship };

function guardianProblem(input: Partial<GuardianFields>, need: { details: boolean }): { ok: false; field: string; error: string } | null {
  if (!RELATIONSHIPS.includes(input.relationship as Relationship)) return { ok: false, field: "relationship", error: "Choose mother, father or guardian." };
  if (!need.details) return null;
  const name = tidy(input.fullName);
  if (name.length < 3 || name.length > 80) return { ok: false, field: "fullName", error: "Type the parent's full name, 3 to 80 characters." };
  if (!normaliseNigerianPhone(input.phone ?? "")) return { ok: false, field: "phone", error: "That isn't a Nigerian mobile number. Type it like 0803 123 4567." };
  return null;
}

const tooMany = { ok: false as const, field: "parent", error: "A student can have at most two parents or guardians. Remove one first." };

export type AddGuardianResult = FormResult<{ guardianId: string }> | NeedsConfirm<{ matches: GuardianMatch[] }>;

/**
 * Adds a parent to a student (AC-8): a new parent, or, with linkTo, a parent
 * already in the school (siblings). A phone that already belongs to a parent
 * here is offered first ("Same person?"); newParent saves a separate parent anyway.
 */
export async function addGuardian(
  ctx: SchoolContext,
  input: Partial<GuardianFields> & { studentId: string; linkTo?: string | null; newParent?: boolean },
): Promise<AddGuardianResult> {
  assertTeam(ctx.actor);
  const problem = guardianProblem(input, { details: !input.linkTo });
  if (problem) return problem;
  const relationship = input.relationship as Relationship;

  if (!input.linkTo && !input.newParent) {
    const matches = (await findGuardiansByPhone(ctx, { phone: input.phone!, exceptStudentId: input.studentId })) ?? [];
    if (matches.length > 0) {
      return { ok: false, field: "phone", needsConfirm: true, error: "A parent at this school already has this phone number.", matches };
    }
  }

  try {
    return await ctx.db.transaction(async (tx) => {
      let guardianId = input.linkTo ?? null;
      if (!guardianId) {
        const [created] = await tx
          .insert(guardian)
          .values({ schoolId: ctx.schoolId, fullName: tidy(input.fullName), phone: normaliseNigerianPhone(input.phone!)! })
          .returning({ id: guardian.id });
        guardianId = created.id;
      }
      await linkGuardian({ ...ctx, db: tx }, { studentId: input.studentId, guardianId, relationship });
      return { ok: true as const, guardianId };
    });
  } catch (error) {
    if (error instanceof TooManyGuardians) return tooMany;
    if (error instanceof AlreadyLinked) return { ok: false, field: "parent", error: "This parent is already linked to this student." };
    throw error;
  }
}

/**
 * Fixes a parent's name and phone for every child they are linked to, and,
 * with studentId, how they are related to that child (AC-8).
 */
export async function saveGuardian(
  ctx: SchoolContext,
  input: GuardianFields & { guardianId: string; studentId: string },
): Promise<FormResult> {
  assertTeam(ctx.actor);
  const problem = guardianProblem(input, { details: true });
  if (problem) return problem;
  return ctx.db.transaction(async (tx) => {
    const [link] = await tx
      .select({ guardianId: studentGuardian.guardianId })
      .from(studentGuardian)
      .where(and(eq(studentGuardian.schoolId, ctx.schoolId), eq(studentGuardian.guardianId, input.guardianId), eq(studentGuardian.studentId, input.studentId)));
    if (!link) throw new NotFound("Guardian");
    await tx
      .update(guardian)
      .set({ fullName: tidy(input.fullName), phone: normaliseNigerianPhone(input.phone)! })
      .where(and(eq(guardian.schoolId, ctx.schoolId), eq(guardian.id, input.guardianId)));
    await tx
      .update(studentGuardian)
      .set({ relationship: input.relationship })
      .where(and(eq(studentGuardian.guardianId, input.guardianId), eq(studentGuardian.studentId, input.studentId)));
    return { ok: true as const };
  });
}

/**
 * Removes a parent from one student (AC-8). The other parent becomes primary
 * when the primary goes; a parent left with no children is deleted.
 */
export async function unlinkGuardian(ctx: SchoolContext, input: { studentId: string; guardianId: string }): Promise<FormResult<{ deleted: boolean }>> {
  assertTeam(ctx.actor);
  return ctx.db.transaction(async (tx) => unlinkIn(tx, ctx.schoolId, input));
}

/** The unlink itself, inside a caller's transaction (also used when a student is removed). */
export async function unlinkIn(tx: Executor, schoolId: string, input: { studentId: string; guardianId: string }) {
  const [child] = await tx
    .select({ id: student.id })
    .from(student)
    .where(and(eq(student.schoolId, schoolId), eq(student.id, input.studentId)))
    .for("update");
  if (!child) throw new NotFound("Student");
  const [parent] = await tx
    .select({ id: guardian.id })
    .from(guardian)
    .where(and(eq(guardian.schoolId, schoolId), eq(guardian.id, input.guardianId)))
    .for("update");
  if (!parent) throw new NotFound("Guardian");
  const [removed] = await tx
    .delete(studentGuardian)
    .where(and(eq(studentGuardian.studentId, child.id), eq(studentGuardian.guardianId, parent.id)))
    .returning({ isPrimary: studentGuardian.isPrimary });
  if (!removed) throw new NotFound("Guardian");
  if (removed.isPrimary) {
    await tx.update(studentGuardian).set({ isPrimary: true }).where(eq(studentGuardian.studentId, child.id));
  }
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(studentGuardian).where(eq(studentGuardian.guardianId, parent.id));
  if (n === 0) await tx.delete(guardian).where(eq(guardian.id, parent.id));
  return { ok: true as const, deleted: n === 0 };
}

/** Makes one of a student's parents the primary one (AC-8). */
export async function makePrimaryGuardian(ctx: SchoolContext, input: { studentId: string; guardianId: string }): Promise<FormResult> {
  assertTeam(ctx.actor);
  return ctx.db.transaction(async (tx) => {
    const [child] = await tx
      .select({ id: student.id })
      .from(student)
      .where(and(eq(student.schoolId, ctx.schoolId), eq(student.id, input.studentId)))
      .for("update");
    if (!child) throw new NotFound("Student");
    const [link] = await tx
      .select({ guardianId: studentGuardian.guardianId })
      .from(studentGuardian)
      .where(and(eq(studentGuardian.studentId, child.id), eq(studentGuardian.guardianId, input.guardianId)));
    if (!link) throw new NotFound("Guardian");
    // The one primary index is not deferrable: clear the old primary first.
    await tx.update(studentGuardian).set({ isPrimary: false }).where(and(eq(studentGuardian.studentId, child.id), ne(studentGuardian.guardianId, link.guardianId)));
    await tx.update(studentGuardian).set({ isPrimary: true }).where(and(eq(studentGuardian.studentId, child.id), eq(studentGuardian.guardianId, link.guardianId)));
    return { ok: true as const };
  });
}

export type ParentOf = {
  studentId: string;
  guardianId: string;
  fullName: string;
  phone: string;
  relationship: Relationship;
  isPrimary: boolean;
  /** The parent's other children, for "Also parent of …". */
  alsoParentOf: { name: string; className: string | null }[];
};

/** Every parent of these students, with their other children (for the student panel). */
export async function parentsOf(ctx: SchoolContext, studentIds: string[]): Promise<ParentOf[]> {
  if (studentIds.length === 0) return [];
  const links = await ctx.db
    .select({
      studentId: studentGuardian.studentId,
      guardianId: guardian.id,
      fullName: guardian.fullName,
      phone: guardian.phone,
      relationship: studentGuardian.relationship,
      isPrimary: studentGuardian.isPrimary,
    })
    .from(studentGuardian)
    .innerJoin(guardian, eq(guardian.id, studentGuardian.guardianId))
    .where(and(eq(studentGuardian.schoolId, ctx.schoolId), inArray(studentGuardian.studentId, studentIds)))
    .orderBy(sql`${studentGuardian.isPrimary} desc`, asc(studentGuardian.createdAt));
  const children = await childrenOf(ctx.db, ctx.schoolId, [...new Set(links.map((l) => l.guardianId))]);
  return links.map((l) => ({
    ...l,
    alsoParentOf: children
      .filter((c) => c.guardianId === l.guardianId && c.studentId !== l.studentId)
      .map((c) => ({ name: `${c.surname} ${c.otherNames}`, className: c.className })),
  }));
}
