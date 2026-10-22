import "server-only";

import { and, asc, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { account, classTeacher, school, schoolClass, section, staff, user } from "@/db/schema";
import { type TeacherInput, teacherProblem, tidy } from "@/lib/enrolment-rules";
import { normaliseNigerianPhone } from "@/lib/phone";
import type { RequestMeta } from "@/server/auth/audit";
import { createAuth } from "@/server/auth/config";
import { type AuthDeps, createLoginForStaff, setLoginEnabled } from "@/server/auth/service";

import type { Executor, SchoolContext } from "./context";
import { resolveSessions } from "./curriculum";
import { NotFound } from "./errors";
import { assertTeam, type FormResult, type NeedsConfirm, violatedConstraint } from "./team";
import { getCurrentTerm } from "./terms";

// Teachers and their form classes (spec 0008, AC-1 to AC-4). Our team only.

/** Who did it, for the login audit events (spec 0004). */
export type ActorMeta = { actorUserId: string | null; meta?: RequestMeta };

/** Login operations bound to one transaction, so a staff row and its login are saved together. */
const authOn = (db: Executor): AuthDeps => ({ auth: createAuth(db, { withNextCookies: false }), db });

const displayName = (title: string | null, fullName: string) => [title, fullName].filter(Boolean).join(" ");

/** Refuses a phone already used by staff in this school; a leaver is pointed to "Mark as active again". */
async function staffPhoneProblem(db: Executor, schoolId: string, phone: string, exceptStaffId?: string) {
  const [holder] = await db
    .select({ id: staff.id, title: staff.title, fullName: staff.fullName, status: staff.status })
    .from(staff)
    .where(and(eq(staff.schoolId, schoolId), eq(staff.phone, phone), exceptStaffId ? ne(staff.id, exceptStaffId) : undefined));
  if (!holder) return null;
  const who = displayName(holder.title, holder.fullName);
  return {
    ok: false as const,
    field: "phone",
    error:
      holder.status === "left"
        ? `${who} has that number and has left the school. If they are back, find them in the list and choose “Mark as active again”.`
        : `${who} already has that number at this school.`,
  };
}

export type ExistingLogin = { name: string; schools: string[]; off: boolean };
export type AddTeacherResult =
  | { ok: true; staffId: string; userId: string; login: "new" | "existing_waiting" | "existing_active" | "existing_off" }
  | { ok: false; field: string; error: string }
  | NeedsConfirm<{ existing: ExistingLogin }>;

/**
 * Adds a teacher and their login in one step (AC-1). Nothing is saved until
 * the phone checks pass and, for a phone that already has a login, our team
 * has confirmed it is the same person.
 */
export async function addTeacher(
  ctx: SchoolContext,
  input: TeacherInput & { phone: string; confirmSamePerson: boolean; role?: "teacher" | "principal" },
  by: ActorMeta,
): Promise<AddTeacherResult> {
  assertTeam(ctx.actor);
  const problem = teacherProblem(input);
  if (problem) return problem;
  const phone = normaliseNigerianPhone(input.phone);
  if (!phone) return { ok: false, field: "phone", error: "That isn't a Nigerian mobile number. Type it like 0803 123 4567." };
  const clash = await staffPhoneProblem(ctx.db, ctx.schoolId, phone);
  if (clash) return clash;

  const role = input.role === "principal" ? "principal" : "teacher";

  const [existing] = await ctx.db.select({ id: user.id, name: user.name, banned: user.banned }).from(user).where(eq(user.username, phone.slice(1)));
  if (existing && !input.confirmSamePerson) {
    const schools = await ctx.db
      .select({ name: school.name })
      .from(staff)
      .innerJoin(school, eq(school.id, staff.schoolId))
      .where(eq(staff.userId, existing.id))
      .orderBy(asc(school.name));
    return {
      ok: false,
      field: "phone",
      needsConfirm: true,
      error: "This phone number already has a login.",
      existing: { name: existing.name, schools: schools.map((s) => s.name), off: existing.banned === true },
    };
  }

  try {
    return await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(staff)
        .values({ schoolId: ctx.schoolId, title: tidy(input.title) || null, fullName: tidy(input.fullName), phone, role })
        .returning({ id: staff.id });
      const login = await createLoginForStaff(authOn(tx), {
        schoolId: ctx.schoolId,
        staffId: created.id,
        confirmSamePerson: true,
        actorUserId: by.actorUserId,
        meta: by.meta,
      });
      if (!login.ok) throw new Error(`Login not created: ${login.reason}`);
      if (!login.reused) return { ok: true as const, staffId: created.id, userId: login.userId, login: "new" as const };
      const [withPassword] = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, login.userId), eq(account.providerId, "credential"), isNotNull(account.password)));
      const state = existing?.banned ? "existing_off" : withPassword ? "existing_active" : "existing_waiting";
      return { ok: true as const, staffId: created.id, userId: login.userId, login: state };
    });
  } catch (error) {
    // Two saves of the same phone at once: the database is the final judge.
    if (violatedConstraint(error)?.constraint === "staff_school_phone_key") {
      return (await staffPhoneProblem(ctx.db, ctx.schoolId, phone)) ?? { ok: false, field: "phone", error: "That number was just added. Refresh the page." };
    }
    throw error;
  }
}

/**
 * Fixes a teacher's title and name (AC-2). The phone is edited here only when
 * they have no login; otherwise it moves with the login ("Change phone").
 */
export async function saveTeacher(ctx: SchoolContext, input: TeacherInput & { staffId: string; phone?: string | null }): Promise<FormResult> {
  assertTeam(ctx.actor);
  const problem = teacherProblem(input);
  if (problem) return problem;
  const title = tidy(input.title) || null;
  const fullName = tidy(input.fullName);
  return ctx.db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: staff.id, userId: staff.userId, phone: staff.phone })
      .from(staff)
      .where(and(eq(staff.schoolId, ctx.schoolId), eq(staff.id, input.staffId)))
      .for("update");
    if (!member) throw new NotFound("Staff");

    let phone = member.phone;
    if (input.phone && tidy(input.phone)) {
      const typed = normaliseNigerianPhone(input.phone);
      if (!typed) return { ok: false as const, field: "phone", error: "That isn't a Nigerian mobile number. Type it like 0803 123 4567." };
      if (typed !== member.phone) {
        if (member.userId) return { ok: false as const, field: "phone", error: "This teacher has a login, so change their number from the login menu (“Change phone number”)." };
        const clash = await staffPhoneProblem(tx, ctx.schoolId, typed, member.id);
        if (clash) return clash;
        phone = typed;
      }
    }
    await tx.update(staff).set({ title, fullName, phone }).where(eq(staff.id, member.id));
    // The name they see after signing in follows the fix (never a team member's own login).
    if (member.userId) {
      await tx.update(user).set({ name: displayName(title, fullName) }).where(and(eq(user.id, member.userId), ne(user.role, "admin")));
    }
    return { ok: true as const };
  });
}

/** Switches a staff member between teacher and principal. A principal sees every class but changes nothing (assertWritable). */
export async function setStaffRole(ctx: SchoolContext, input: { staffId: string; role: "teacher" | "principal" }): Promise<FormResult> {
  assertTeam(ctx.actor);
  const updated = await ctx.db
    .update(staff)
    .set({ role: input.role })
    .where(and(eq(staff.schoolId, ctx.schoolId), eq(staff.id, input.staffId)))
    .returning({ id: staff.id });
  if (updated.length === 0) throw new NotFound("Staff");
  return { ok: true as const };
}

/** The session "this session" means for form classes: the current term's, else the newest. */
async function workingSession(ctx: SchoolContext) {
  const { session } = await resolveSessions(ctx);
  return session;
}

/**
 * Marks a teacher as left, or active again (AC-3). Leaving removes them as
 * form master of this session's classes and switches their login off unless
 * they are still active at another school. Coming back restores the record only.
 */
export async function setStaffLeft(
  ctx: SchoolContext,
  input: { staffId: string; left: boolean },
  by: { actorUserId: string; meta?: RequestMeta },
): Promise<FormResult<{ unassigned: string[]; loginOff: boolean }>> {
  assertTeam(ctx.actor);
  const session = await workingSession(ctx);
  return ctx.db.transaction(async (tx) => {
    const [member] = await tx
      .select({ id: staff.id, userId: staff.userId, status: staff.status })
      .from(staff)
      .where(and(eq(staff.schoolId, ctx.schoolId), eq(staff.id, input.staffId)))
      .for("update");
    if (!member) throw new NotFound("Staff");

    if (!input.left) {
      await tx.update(staff).set({ status: "active" }).where(eq(staff.id, member.id));
      return { ok: true as const, unassigned: [], loginOff: false };
    }

    await tx.update(staff).set({ status: "left" }).where(eq(staff.id, member.id));
    const unassigned = session
      ? await tx
          .delete(classTeacher)
          .where(and(eq(classTeacher.schoolId, ctx.schoolId), eq(classTeacher.sessionId, session.id), eq(classTeacher.staffId, member.id)))
          .returning({ classId: classTeacher.classId })
      : [];
    const names =
      unassigned.length === 0
        ? []
        : (
            await tx
              .select({ name: schoolClass.name })
              .from(schoolClass)
              .where(inArray(schoolClass.id, unassigned.map((u) => u.classId)))
              .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name))
          ).map((c) => c.name);

    let loginOff = false;
    if (member.userId && member.userId !== by.actorUserId) {
      const [elsewhere] = await tx
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.userId, member.userId), eq(staff.status, "active"), ne(staff.schoolId, ctx.schoolId)));
      const [login] = await tx.select({ banned: user.banned, role: user.role }).from(user).where(eq(user.id, member.userId));
      if (!elsewhere && login && login.role !== "admin" && !login.banned) {
        await setLoginEnabled(authOn(tx), { userId: member.userId, enabled: false, actorUserId: by.actorUserId, meta: by.meta });
        loginOff = true;
      }
    }
    return { ok: true as const, unassigned: names, loginOff };
  });
}

/**
 * Sets a class's form master (or class teacher) for the current session, or
 * none (AC-4). Only active staff of this school can be chosen.
 */
export async function setFormTeacher(ctx: SchoolContext, input: { classId: string; staffId: string | null }): Promise<FormResult> {
  assertTeam(ctx.actor);
  const { session } = await getCurrentTerm(ctx);
  return ctx.db.transaction(async (tx) => {
    const [cls] = await tx
      .select({ id: schoolClass.id, name: schoolClass.name })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
    if (!cls) throw new NotFound("Class");
    if (input.staffId === null) {
      await tx.delete(classTeacher).where(and(eq(classTeacher.sessionId, session.id), eq(classTeacher.classId, cls.id)));
      return { ok: true as const };
    }
    // Shared lock, read after locking: a teacher marked as left meanwhile is refused.
    const [member] = await tx
      .select({ id: staff.id, title: staff.title, fullName: staff.fullName, status: staff.status })
      .from(staff)
      .where(and(eq(staff.schoolId, ctx.schoolId), eq(staff.id, input.staffId)))
      .for("share");
    if (!member) throw new NotFound("Staff");
    if (member.status !== "active") {
      return { ok: false as const, field: "formTeacher", error: `${displayName(member.title, member.fullName)} has left the school, so can’t head ${cls.name}.` };
    }
    // Chosen by hand, so an import's undo never removes it (spec 0013, AC-15).
    await tx
      .insert(classTeacher)
      .values({ schoolId: ctx.schoolId, sessionId: session.id, classId: cls.id, staffId: member.id })
      .onConflictDoUpdate({ target: [classTeacher.sessionId, classTeacher.classId], set: { staffId: member.id, importRunId: null } });
    return { ok: true as const };
  });
}

/** The classes each staff member heads in the working session, for the Staff page (AC-1, AC-3). */
export async function listStaffClasses(ctx: SchoolContext) {
  assertTeam(ctx.actor);
  const session = await workingSession(ctx);
  if (!session) return { session: null, classes: [] };
  const classes = await ctx.db
    .select({ staffId: classTeacher.staffId, classId: schoolClass.id, name: schoolClass.name, teacherTitle: section.teacherTitle })
    .from(classTeacher)
    .innerJoin(schoolClass, eq(schoolClass.id, classTeacher.classId))
    .innerJoin(section, eq(section.id, schoolClass.sectionId))
    .where(and(eq(classTeacher.schoolId, ctx.schoolId), eq(classTeacher.sessionId, session.id)))
    .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name));
  return { session, classes };
}
