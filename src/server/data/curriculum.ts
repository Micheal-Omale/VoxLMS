import "server-only";

import { and, asc, count, eq, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";

import {
  academicSession,
  assessmentComponent,
  classSubject,
  classTeacher,
  enrolment,
  gradeBand,
  school,
  schoolClass,
  schoolSubject,
  score,
  scoreChange,
  section,
  standardLevel,
  standardSubject,
  studentElective,
  term,
} from "@/db/schema";
import { className, classSortOrder, parseArms } from "@/lib/class-name";
import { SHORT_NAME, suggestShortName } from "@/lib/subject-short-name";

import type { Executor, SchoolContext } from "./context";
import { NotFound } from "./errors";
import { assertTeam, type FormResult } from "./team";

// Subjects, classes and what each class offers (spec 0006). Our team only.
// Every rule that protects saved scores is checked inside the save's transaction.

/** A class offers at most this many subjects in a session (spec 0006, AC-4). */
export const MAX_CLASS_SUBJECTS = 20;

const STAGE_NAME = { nursery: "Nursery", primary: "Primary", junior_secondary: "Junior Secondary", senior_secondary: "Senior Secondary" } as const;

const tidy = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Serialises order changes and bulk adds for one school (both renumber within it). */
async function lockSchool(db: Executor, schoolId: string) {
  const [row] = await db.select({ id: school.id }).from(school).where(eq(school.id, schoolId)).for("no key update");
  if (!row) throw new NotFound("School");
}

// ---------- Sessions ----------

/**
 * The session a setup page edits: the one asked for, else the current term's,
 * else the newest. Also the session just before it, for "Copy from" (AC-9).
 */
export async function resolveSessions(ctx: SchoolContext, requestedId?: string | null) {
  const [sessions, [current]] = await Promise.all([
    ctx.db
      .select({ id: academicSession.id, name: academicSession.name, startsOn: academicSession.startsOn })
      .from(academicSession)
      .where(eq(academicSession.schoolId, ctx.schoolId))
      .orderBy(asc(academicSession.startsOn)),
    ctx.db
      .select({ termId: term.id, sessionId: term.sessionId, number: term.number })
      .from(term)
      .where(and(eq(term.schoolId, ctx.schoolId), eq(term.isCurrent, true))),
  ]);
  const session =
    sessions.find((s) => s.id === requestedId) ?? sessions.find((s) => s.id === current?.sessionId) ?? sessions.at(-1) ?? null;
  const earlier = session ? (sessions.filter((s) => s.startsOn < session.startsOn).at(-1) ?? null) : null;
  return { sessions, session, earlier, currentTerm: current ?? null };
}

async function requireSession(db: Executor, schoolId: string, sessionId: string) {
  const [row] = await db
    .select({ id: academicSession.id, name: academicSession.name, startsOn: academicSession.startsOn })
    .from(academicSession)
    .where(and(eq(academicSession.schoolId, schoolId), eq(academicSession.id, sessionId)));
  if (!row) throw new NotFound("Session");
  return row;
}

/** How much of a session is set up; the copy banner shows only when none of it is (AC-9). */
export async function sessionSetupCounts(ctx: SchoolContext, sessionId: string) {
  const [[offers], [parts], [bands]] = await Promise.all([
    ctx.db.select({ n: count() }).from(classSubject).where(and(eq(classSubject.schoolId, ctx.schoolId), eq(classSubject.sessionId, sessionId))),
    ctx.db
      .select({ n: count() })
      .from(assessmentComponent)
      .where(and(eq(assessmentComponent.schoolId, ctx.schoolId), eq(assessmentComponent.sessionId, sessionId))),
    ctx.db.select({ n: count() }).from(gradeBand).where(and(eq(gradeBand.schoolId, ctx.schoolId), eq(gradeBand.sessionId, sessionId))),
  ]);
  return { offers: offers.n, parts: parts.n, bands: bands.n };
}

/** The earlier session to offer "Copy from", or null when there is nothing to offer. */
export async function copySourceFor(ctx: SchoolContext, session: { id: string } | null, earlier: { id: string; name: string } | null) {
  if (!session || !earlier) return null;
  const [mine, theirs] = await Promise.all([sessionSetupCounts(ctx, session.id), sessionSetupCounts(ctx, earlier.id)]);
  const empty = mine.offers === 0 && mine.parts === 0 && mine.bands === 0;
  const something = theirs.offers + theirs.parts + theirs.bands > 0;
  return empty && something ? earlier : null;
}

// ---------- Subjects ----------

export async function getSubjectsSetup(ctx: SchoolContext) {
  assertTeam(ctx.actor);
  const { session } = await resolveSessions(ctx);
  const [subjects, standards, offers, electives] = await Promise.all([
    ctx.db
      .select({
        id: schoolSubject.id,
        name: schoolSubject.name,
        shortName: schoolSubject.shortName,
        standardSubjectId: schoolSubject.standardSubjectId,
        standardName: standardSubject.name,
        isActive: schoolSubject.isActive,
      })
      .from(schoolSubject)
      .leftJoin(standardSubject, eq(standardSubject.id, schoolSubject.standardSubjectId))
      .where(eq(schoolSubject.schoolId, ctx.schoolId))
      .orderBy(asc(schoolSubject.sortOrder), asc(schoolSubject.name)),
    ctx.db.select({ id: standardSubject.id, code: standardSubject.code, name: standardSubject.name }).from(standardSubject).orderBy(asc(standardSubject.name)),
    ctx.db
      .select({ subjectId: classSubject.subjectId, sessionId: classSubject.sessionId, n: count() })
      .from(classSubject)
      .where(eq(classSubject.schoolId, ctx.schoolId))
      .groupBy(classSubject.subjectId, classSubject.sessionId),
    ctx.db
      .select({ subjectId: studentElective.subjectId, n: count() })
      .from(studentElective)
      .where(eq(studentElective.schoolId, ctx.schoolId))
      .groupBy(studentElective.subjectId),
  ]);
  const linked = new Set(subjects.map((s) => s.standardSubjectId));
  return {
    session,
    subjects: subjects.map((s) => ({
      ...s,
      offeredNow: offers.find((o) => o.subjectId === s.id && o.sessionId === session?.id)?.n ?? 0,
      inUse: offers.some((o) => o.subjectId === s.id) || electives.some((e) => e.subjectId === s.id),
    })),
    standards: standards.map((s) => ({ ...s, added: linked.has(s.id) })),
  };
}

/** Adds ticked standard subjects at the end of the school's order (AC-1, AC-2). */
export async function addStandardSubjects(ctx: SchoolContext, input: { standardSubjectIds: string[] }): Promise<FormResult<{ added: number }>> {
  assertTeam(ctx.actor);
  const ids = [...new Set(input.standardSubjectIds)];
  if (ids.length === 0) return { ok: false, field: "standard", error: "Tick at least one subject to add." };
  return ctx.db.transaction(async (tx) => {
    await lockSchool(tx, ctx.schoolId);
    const standards = await tx.select().from(standardSubject).where(inArray(standardSubject.id, ids));
    if (standards.length !== ids.length) throw new NotFound("Standard subject");
    standards.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    const existing = await tx
      .select({ name: schoolSubject.name, shortName: schoolSubject.shortName, standardSubjectId: schoolSubject.standardSubjectId, sortOrder: schoolSubject.sortOrder })
      .from(schoolSubject)
      .where(eq(schoolSubject.schoolId, ctx.schoolId));
    const linked = new Set(existing.map((e) => e.standardSubjectId));
    const names = new Set(existing.map((e) => e.name.toLowerCase()));
    const shorts = new Set(existing.map((e) => e.shortName));
    let order = Math.max(0, ...existing.map((e) => e.sortOrder));
    const rows = [];
    for (const s of standards) {
      if (linked.has(s.id)) continue;
      if (names.has(s.name.toLowerCase())) {
        return { ok: false as const, field: "standard", error: `The school already has a subject called ${s.name}. Untick it, or rename the school's own ${s.name} first.` };
      }
      const shortName = suggestShortName(s.name, shorts, s.code);
      shorts.add(shortName);
      names.add(s.name.toLowerCase());
      rows.push({ schoolId: ctx.schoolId, name: s.name, shortName, standardSubjectId: s.id, sortOrder: ++order });
    }
    if (rows.length > 0) await tx.insert(schoolSubject).values(rows);
    return { ok: true as const, added: rows.length };
  });
}

export type SubjectInput = { id?: string | null; name: string; shortName: string; standardSubjectId?: string | null };

/** Adds a subject of the school's own, or renames one (AC-1). */
export async function saveSubject(ctx: SchoolContext, input: SubjectInput): Promise<FormResult<{ subjectId: string }>> {
  assertTeam(ctx.actor);
  const name = tidy(input.name);
  const shortName = tidy(input.shortName).toUpperCase();
  if (name.length < 2 || name.length > 40) return { ok: false, field: "name", error: "Type the subject’s name, like English Studies (up to 40 characters)." };
  if (!SHORT_NAME.test(shortName)) return { ok: false, field: "shortName", error: "Use 2 to 5 capital letters or digits, like ENG." };
  return ctx.db.transaction(async (tx) => {
    await lockSchool(tx, ctx.schoolId);
    const existing = await tx
      .select({ id: schoolSubject.id, name: schoolSubject.name, shortName: schoolSubject.shortName, sortOrder: schoolSubject.sortOrder })
      .from(schoolSubject)
      .where(eq(schoolSubject.schoolId, ctx.schoolId));
    if (input.id && !existing.some((e) => e.id === input.id)) throw new NotFound("Subject");
    const others = existing.filter((e) => e.id !== input.id);
    if (others.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false as const, field: "name", error: `Another subject is already called ${name}.` };
    }
    const sameShort = others.find((e) => e.shortName === shortName);
    if (sameShort) return { ok: false as const, field: "shortName", error: `${shortName} is already the short name of ${sameShort.name}.` };
    const standardSubjectId = input.standardSubjectId || null;
    if (standardSubjectId) {
      const [found] = await tx.select({ id: standardSubject.id }).from(standardSubject).where(eq(standardSubject.id, standardSubjectId));
      if (!found) throw new NotFound("Standard subject");
    }
    if (input.id) {
      await tx.update(schoolSubject).set({ name, shortName, standardSubjectId }).where(and(eq(schoolSubject.schoolId, ctx.schoolId), eq(schoolSubject.id, input.id)));
      return { ok: true as const, subjectId: input.id };
    }
    const [created] = await tx
      .insert(schoolSubject)
      .values({ schoolId: ctx.schoolId, name, shortName, standardSubjectId, sortOrder: Math.max(0, ...existing.map((e) => e.sortOrder)) + 1 })
      .returning({ id: schoolSubject.id });
    return { ok: true as const, subjectId: created.id };
  });
}

/** Swaps an active subject with its neighbour in the school's order (AC-2). */
export async function moveSubject(ctx: SchoolContext, input: { id: string; direction: "up" | "down" }): Promise<FormResult> {
  assertTeam(ctx.actor);
  return ctx.db.transaction(async (tx) => {
    await lockSchool(tx, ctx.schoolId);
    const active = await tx
      .select({ id: schoolSubject.id, sortOrder: schoolSubject.sortOrder })
      .from(schoolSubject)
      .where(and(eq(schoolSubject.schoolId, ctx.schoolId), eq(schoolSubject.isActive, true)))
      .orderBy(asc(schoolSubject.sortOrder), asc(schoolSubject.name));
    const at = active.findIndex((s) => s.id === input.id);
    if (at === -1) throw new NotFound("Subject");
    const to = input.direction === "up" ? at - 1 : at + 1;
    if (to < 0 || to >= active.length) return { ok: true as const };
    [active[at], active[to]] = [active[to], active[at]];
    for (const [i, s] of active.entries()) {
      if (s.sortOrder !== i + 1) await tx.update(schoolSubject).set({ sortOrder: i + 1 }).where(eq(schoolSubject.id, s.id));
    }
    return { ok: true as const };
  });
}

/**
 * Deletes a subject nothing uses; switches off one that is used (AC-8). A used
 * subject can't be switched off while a class offers it in the current session
 * or a later one.
 */
export async function removeSubject(ctx: SchoolContext, input: { id: string }): Promise<FormResult<{ outcome: "deleted" | "switched_off" }>> {
  assertTeam(ctx.actor);
  return ctx.db.transaction(async (tx) => {
    const [subject] = await tx
      .select({ id: schoolSubject.id, name: schoolSubject.name })
      .from(schoolSubject)
      .where(and(eq(schoolSubject.schoolId, ctx.schoolId), eq(schoolSubject.id, input.id)))
      .for("update");
    if (!subject) throw new NotFound("Subject");
    const [[offers], [electives]] = await Promise.all([
      tx.select({ n: count() }).from(classSubject).where(eq(classSubject.subjectId, subject.id)),
      tx.select({ n: count() }).from(studentElective).where(eq(studentElective.subjectId, subject.id)),
    ]);
    if (offers.n === 0 && electives.n === 0) {
      await tx.delete(schoolSubject).where(eq(schoolSubject.id, subject.id));
      return { ok: true as const, outcome: "deleted" as const };
    }
    const { session } = await resolveSessions({ ...ctx, db: tx });
    if (session) {
      const live = await tx
        .select({ name: academicSession.name, n: count() })
        .from(classSubject)
        .innerJoin(academicSession, eq(academicSession.id, classSubject.sessionId))
        .where(and(eq(classSubject.subjectId, subject.id), gte(academicSession.startsOn, session.startsOn)))
        .groupBy(academicSession.name, academicSession.startsOn)
        .orderBy(asc(academicSession.startsOn));
      if (live.length > 0) {
        return {
          ok: false as const,
          field: "subject",
          error: `${subject.name} is offered by ${plural(live[0].n, "class", "classes")} in ${live[0].name}. Take it off those classes first, then switch it off.`,
        };
      }
    }
    await tx.update(schoolSubject).set({ isActive: false }).where(eq(schoolSubject.id, subject.id));
    return { ok: true as const, outcome: "switched_off" as const };
  });
}

/** Switches a subject back on, at the end of the school's order. */
export async function restoreSubject(ctx: SchoolContext, input: { id: string }): Promise<FormResult> {
  assertTeam(ctx.actor);
  return ctx.db.transaction(async (tx) => {
    await lockSchool(tx, ctx.schoolId);
    const [{ top }] = await tx
      .select({ top: sql<number>`coalesce(max(${schoolSubject.sortOrder}), 0)::int` })
      .from(schoolSubject)
      .where(eq(schoolSubject.schoolId, ctx.schoolId));
    const [updated] = await tx
      .update(schoolSubject)
      .set({ isActive: true, sortOrder: top + 1 })
      .where(and(eq(schoolSubject.schoolId, ctx.schoolId), eq(schoolSubject.id, input.id), eq(schoolSubject.isActive, false)))
      .returning({ id: schoolSubject.id });
    if (!updated) throw new NotFound("Subject");
    return { ok: true as const };
  });
}

// ---------- Classes ----------

export async function getClassesSetup(ctx: SchoolContext, input: { sessionId?: string | null } = {}) {
  assertTeam(ctx.actor);
  const { sessions, session, earlier, currentTerm } = await resolveSessions(ctx, input.sessionId);
  const sections = await ctx.db
    .select({ id: section.id, stage: section.stage, name: section.name })
    .from(section)
    .where(eq(section.schoolId, ctx.schoolId))
    .orderBy(asc(section.stage));
  const stages = sections.map((s) => s.stage);
  const [levels, classes, subjects, offers, enrolled, enrolledEver, teachers, copyFrom] = await Promise.all([
    stages.length === 0
      ? []
      : ctx.db.select().from(standardLevel).where(inArray(standardLevel.stage, stages)).orderBy(asc(standardLevel.sortOrder)),
    ctx.db
      .select({
        id: schoolClass.id,
        name: schoolClass.name,
        arm: schoolClass.arm,
        sectionId: schoolClass.sectionId,
        levelId: schoolClass.standardLevelId,
        isActive: schoolClass.isActive,
      })
      .from(schoolClass)
      .where(eq(schoolClass.schoolId, ctx.schoolId))
      .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)),
    ctx.db
      .select({ id: schoolSubject.id, name: schoolSubject.name, shortName: schoolSubject.shortName, isActive: schoolSubject.isActive })
      .from(schoolSubject)
      .where(eq(schoolSubject.schoolId, ctx.schoolId))
      .orderBy(asc(schoolSubject.sortOrder), asc(schoolSubject.name)),
    session
      ? ctx.db
          .select({ classId: classSubject.classId, subjectId: classSubject.subjectId, isElective: classSubject.isElective })
          .from(classSubject)
          .where(and(eq(classSubject.schoolId, ctx.schoolId), eq(classSubject.sessionId, session.id)))
      : [],
    currentTerm
      ? ctx.db
          .select({ classId: enrolment.classId, n: count() })
          .from(enrolment)
          .where(and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.termId, currentTerm.termId), isNull(enrolment.withdrawnOn)))
          .groupBy(enrolment.classId)
      : [],
    ctx.db.selectDistinct({ classId: enrolment.classId }).from(enrolment).where(eq(enrolment.schoolId, ctx.schoolId)),
    ctx.db.selectDistinct({ classId: classTeacher.classId }).from(classTeacher).where(eq(classTeacher.schoolId, ctx.schoolId)),
    copySourceFor(ctx, session, earlier),
  ]);
  const used = new Set([...enrolledEver, ...teachers].map((r) => r.classId));
  return {
    sessions,
    session,
    copyFrom,
    currentSessionId: currentTerm?.sessionId ?? null,
    sections,
    levels: levels.filter((l) => l.stage !== "nursery").map((l) => ({ id: l.id, name: l.name, stage: l.stage, sortOrder: l.sortOrder })),
    subjects,
    classes: classes.map((c) => ({
      ...c,
      studentsNow: enrolled.find((e) => e.classId === c.id)?.n ?? 0,
      inUse: used.has(c.id),
      offer: offers.filter((o) => o.classId === c.id).map((o) => ({ subjectId: o.subjectId, isElective: o.isElective })),
    })),
  };
}

/** Creates every level × arm class in one go; names that exist are skipped (AC-3). */
export async function createClasses(
  ctx: SchoolContext,
  input: { levelIds: string[]; arms: string[] | string },
): Promise<FormResult<{ created: string[]; skipped: string[] }>> {
  assertTeam(ctx.actor);
  const levelIds = [...new Set(input.levelIds)];
  const arms = parseArms(Array.isArray(input.arms) ? input.arms.join(",") : input.arms);
  if (levelIds.length === 0) return { ok: false, field: "levels", error: "Tick at least one level, like JSS 1." };
  if (arms.some((a) => a.length > 20)) return { ok: false, field: "arms", error: "Keep each arm to 20 characters, like Gold or Science." };
  if (arms.length > 12) return { ok: false, field: "arms", error: "Add at most 12 arms at a time." };
  return ctx.db.transaction(async (tx) => {
    await lockSchool(tx, ctx.schoolId);
    const levels = await tx.select().from(standardLevel).where(inArray(standardLevel.id, levelIds)).orderBy(asc(standardLevel.sortOrder));
    if (levels.length !== levelIds.length) throw new NotFound("Level");
    const sections = await tx.select({ id: section.id, stage: section.stage }).from(section).where(eq(section.schoolId, ctx.schoolId));
    const existing = await tx
      .select({ name: schoolClass.name, levelId: schoolClass.standardLevelId, arm: schoolClass.arm })
      .from(schoolClass)
      .where(eq(schoolClass.schoolId, ctx.schoolId));
    const taken = new Set(existing.map((c) => c.name.toLowerCase()));
    const created: string[] = [];
    const skipped: string[] = [];
    const rows = [];
    for (const level of levels) {
      const home = sections.find((s) => s.stage === level.stage);
      if (!home) {
        return { ok: false as const, field: "levels", error: `The school has no ${STAGE_NAME[level.stage]} section, so ${level.name} can’t be added. Add the section first.` };
      }
      let position = existing.filter((c) => c.levelId === level.id && c.arm !== null).length;
      for (const arm of arms.length > 0 ? arms : [null]) {
        const name = className(level.name, arm);
        if (taken.has(name.toLowerCase())) {
          skipped.push(name);
          continue;
        }
        taken.add(name.toLowerCase());
        created.push(name);
        rows.push({
          schoolId: ctx.schoolId,
          sectionId: home.id,
          stage: level.stage,
          standardLevelId: level.id,
          arm,
          name,
          sortOrder: classSortOrder(level.sortOrder, arm ? ++position : 0),
        });
      }
    }
    if (rows.length > 0) await tx.insert(schoolClass).values(rows);
    return { ok: true as const, created, skipped };
  });
}

/** Renames a class; its level and section never change (AC-3). */
export async function saveClass(ctx: SchoolContext, input: { id: string; name: string; arm?: string | null }): Promise<FormResult> {
  assertTeam(ctx.actor);
  const name = tidy(input.name);
  const arm = tidy(input.arm) || null;
  if (name.length < 2 || name.length > 40) return { ok: false, field: "name", error: "Type the class name, like JSS 2 Gold (up to 40 characters)." };
  if (arm && arm.length > 20) return { ok: false, field: "arm", error: "Keep the arm to 20 characters." };
  return ctx.db.transaction(async (tx) => {
    const all = await tx.select({ id: schoolClass.id, name: schoolClass.name }).from(schoolClass).where(eq(schoolClass.schoolId, ctx.schoolId));
    if (!all.some((c) => c.id === input.id)) throw new NotFound("Class");
    if (all.some((c) => c.id !== input.id && c.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false as const, field: "name", error: `Another class is already called ${name}.` };
    }
    await tx.update(schoolClass).set({ name, arm }).where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.id)));
    return { ok: true as const };
  });
}

/**
 * Deletes a class nothing uses (no students or form teacher in any session),
 * with its subject offers; switches off one that is used (AC-8).
 */
export async function removeClass(ctx: SchoolContext, input: { id: string }): Promise<FormResult<{ outcome: "deleted" | "switched_off" }>> {
  assertTeam(ctx.actor);
  return ctx.db.transaction(async (tx) => {
    const [cls] = await tx
      .select({ id: schoolClass.id, name: schoolClass.name })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.id)))
      .for("update");
    if (!cls) throw new NotFound("Class");
    const [[enrolments], [teachers]] = await Promise.all([
      tx.select({ n: count() }).from(enrolment).where(eq(enrolment.classId, cls.id)),
      tx.select({ n: count() }).from(classTeacher).where(eq(classTeacher.classId, cls.id)),
    ]);
    if (enrolments.n === 0 && teachers.n === 0) {
      await tx.delete(classSubject).where(and(eq(classSubject.schoolId, ctx.schoolId), eq(classSubject.classId, cls.id)));
      await tx.delete(schoolClass).where(eq(schoolClass.id, cls.id));
      return { ok: true as const, outcome: "deleted" as const };
    }
    const [now] = await tx
      .select({ n: count() })
      .from(enrolment)
      .innerJoin(term, and(eq(term.id, enrolment.termId), eq(term.isCurrent, true)))
      .where(and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.classId, cls.id), isNull(enrolment.withdrawnOn)));
    if (now.n > 0) {
      return { ok: false as const, field: "class", error: `${plural(now.n, "student")} ${now.n === 1 ? "is" : "are"} in ${cls.name} this term. Move them to another class first.` };
    }
    await tx.update(schoolClass).set({ isActive: false }).where(eq(schoolClass.id, cls.id));
    return { ok: true as const, outcome: "switched_off" as const };
  });
}

export async function restoreClass(ctx: SchoolContext, input: { id: string }): Promise<FormResult> {
  assertTeam(ctx.actor);
  const [updated] = await ctx.db
    .update(schoolClass)
    .set({ isActive: true })
    .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.id)))
    .returning({ id: schoolClass.id });
  if (!updated) throw new NotFound("Class");
  return { ok: true };
}

// ---------- What each class offers ----------

export type OfferChange = { subjectId: string; offered: boolean; isElective?: boolean };
type Desired = Map<string, { isElective?: boolean }>;
type TargetClass = { id: string; name: string; sectionId: string };

/**
 * Writes the wanted offer for each class, all or nothing (AC-4, AC-7). Refuses
 * removing a subject or making it elective where it has scores, a switched off
 * subject added, and more than 20 subjects in a class.
 */
async function writeOffers(
  tx: Executor,
  schoolId: string,
  session: { id: string; name: string },
  classes: TargetClass[],
  wanted: (classId: string, current: Map<string, { id: string; isElective: boolean }>) => Desired,
): Promise<FormResult<{ changed: number }>> {
  const classIds = classes.map((c) => c.id);
  // Locking the offer rows makes a score save for one of them wait until this finishes.
  const currentRows = await tx
    .select({ id: classSubject.id, classId: classSubject.classId, subjectId: classSubject.subjectId, isElective: classSubject.isElective })
    .from(classSubject)
    .where(and(eq(classSubject.schoolId, schoolId), eq(classSubject.sessionId, session.id), inArray(classSubject.classId, classIds)))
    .for("update");

  const plans = classes.map((cls) => {
    const current = new Map(currentRows.filter((r) => r.classId === cls.id).map((r) => [r.subjectId, { id: r.id, isElective: r.isElective }]));
    return { cls, current, desired: wanted(cls.id, current) };
  });

  const subjectIds = [...new Set(plans.flatMap((p) => [...p.desired.keys(), ...p.current.keys()]))];
  const subjects =
    subjectIds.length === 0
      ? []
      : await tx
          .select({ id: schoolSubject.id, name: schoolSubject.name, isActive: schoolSubject.isActive })
          .from(schoolSubject)
          .where(and(eq(schoolSubject.schoolId, schoolId), inArray(schoolSubject.id, subjectIds)))
          .for("share");
  if (subjects.length !== subjectIds.length) throw new NotFound("Subject");
  const subjectName = (id: string) => subjects.find((s) => s.id === id)!.name;

  const inserts: (typeof classSubject.$inferInsert)[] = [];
  const updates: { id: string; isElective: boolean }[] = [];
  const deletes: { id: string; cls: TargetClass; subjectId: string }[] = [];
  const flips: { id: string; cls: TargetClass; subjectId: string }[] = [];
  const problems: string[] = [];

  for (const { cls, current, desired } of plans) {
    if (desired.size > MAX_CLASS_SUBJECTS) {
      problems.push(`${cls.name} would have ${desired.size} subjects. A class offers at most ${MAX_CLASS_SUBJECTS}.`);
    }
    for (const [subjectId, want] of desired) {
      const have = current.get(subjectId);
      if (!have) {
        if (!subjects.find((s) => s.id === subjectId)!.isActive) {
          problems.push(`${subjectName(subjectId)} is switched off. Switch it back on before giving it to a class.`);
          continue;
        }
        inserts.push({ schoolId, sessionId: session.id, classId: cls.id, sectionId: cls.sectionId, subjectId, isElective: want.isElective ?? false });
      } else if (want.isElective !== undefined && want.isElective !== have.isElective) {
        updates.push({ id: have.id, isElective: want.isElective });
        if (want.isElective) flips.push({ id: have.id, cls, subjectId });
      }
    }
    for (const [subjectId, have] of current) if (!desired.has(subjectId)) deletes.push({ id: have.id, cls, subjectId });
  }

  // Saved scores that a removal or a compulsory → elective change would strand.
  const guarded = [...deletes, ...flips];
  if (guarded.length > 0) {
    const ids = guarded.map((g) => g.id);
    const [scored, logged] = await Promise.all([
      tx.select({ id: score.classSubjectId, n: count() }).from(score).where(inArray(score.classSubjectId, ids)).groupBy(score.classSubjectId),
      deletes.length === 0
        ? []
        : tx.selectDistinct({ id: scoreChange.classSubjectId }).from(scoreChange).where(inArray(scoreChange.classSubjectId, deletes.map((d) => d.id))),
    ]);
    for (const d of deletes) {
      const n = scored.find((s) => s.id === d.id)?.n ?? 0;
      if (n > 0) problems.push(`${d.cls.name}: ${subjectName(d.subjectId)} has ${plural(n, "saved score")}. Clear them first, or keep the subject.`);
      else if (logged.some((l) => l.id === d.id)) {
        problems.push(`${d.cls.name}: scores were entered for ${subjectName(d.subjectId)} and later cleared. Their history is kept, so the subject stays.`);
      }
    }
    for (const f of flips) {
      const n = scored.find((s) => s.id === f.id)?.n ?? 0;
      if (n > 0) problems.push(`${f.cls.name}: ${subjectName(f.subjectId)} has ${plural(n, "saved score")}, so it can’t become an elective.`);
    }
  }
  if (problems.length > 0) return { ok: false, field: "offer", error: `Nothing was saved. ${problems.join(" ")}` };

  if (deletes.length > 0) await tx.delete(classSubject).where(inArray(classSubject.id, deletes.map((d) => d.id)));
  for (const u of updates) await tx.update(classSubject).set({ isElective: u.isElective }).where(eq(classSubject.id, u.id));
  if (inserts.length > 0) await tx.insert(classSubject).values(inserts);
  return { ok: true, changed: inserts.length + updates.length + deletes.length };
}

function checkChanges(changes: OfferChange[]): FormResult | null {
  const seen = new Set<string>();
  for (const c of changes) {
    if (typeof c?.subjectId !== "string" || typeof c.offered !== "boolean") return { ok: false, field: "offer", error: "That change couldn’t be read. Reload the page and try again." };
    if (seen.has(c.subjectId)) return { ok: false, field: "offer", error: "A subject was changed twice. Reload the page and try again." };
    seen.add(c.subjectId);
  }
  return null;
}

/**
 * Sets a level's subjects for a session across every active arm (AC-4). Only
 * the subjects sent are touched, so an arm's own difference survives.
 */
export async function saveLevelOffer(
  ctx: SchoolContext,
  input: { levelId: string; sessionId: string; changes: OfferChange[] },
): Promise<FormResult<{ changed: number }>> {
  assertTeam(ctx.actor);
  const problem = checkChanges(input.changes);
  if (problem && !problem.ok) return problem;
  if (input.changes.length === 0) return { ok: true, changed: 0 };
  return ctx.db.transaction(async (tx) => {
    const session = await requireSession(tx, ctx.schoolId, input.sessionId);
    const [level] = await tx.select({ id: standardLevel.id, name: standardLevel.name }).from(standardLevel).where(eq(standardLevel.id, input.levelId));
    if (!level) throw new NotFound("Level");
    const arms = await tx
      .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.standardLevelId, level.id), eq(schoolClass.isActive, true)))
      .orderBy(asc(schoolClass.sortOrder))
      .for("update");
    if (arms.length === 0) return { ok: false as const, field: "offer", error: `${level.name} has no classes yet. Add its classes first.` };
    return writeOffers(tx, ctx.schoolId, session, arms, (_classId, current) => {
      const desired: Desired = new Map([...current].map(([id, row]) => [id, { isElective: row.isElective }]));
      for (const c of input.changes) {
        if (c.offered) desired.set(c.subjectId, { isElective: c.isElective });
        else desired.delete(c.subjectId);
      }
      return desired;
    });
  });
}

/** Replaces one class's subjects for a session, so it can differ from its level (AC-4). */
export async function saveClassOffer(
  ctx: SchoolContext,
  input: { classId: string; sessionId: string; subjects: { subjectId: string; isElective: boolean }[] },
): Promise<FormResult<{ changed: number }>> {
  assertTeam(ctx.actor);
  const problem = checkChanges(input.subjects.map((s) => ({ subjectId: s?.subjectId, offered: true, isElective: s?.isElective })));
  if (problem && !problem.ok) return problem;
  return ctx.db.transaction(async (tx) => {
    const session = await requireSession(tx, ctx.schoolId, input.sessionId);
    const [cls] = await tx
      .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)))
      .for("update");
    if (!cls) throw new NotFound("Class");
    return writeOffers(tx, ctx.schoolId, session, [cls], () => new Map(input.subjects.map((s) => [s.subjectId, { isElective: s.isElective === true }])));
  });
}

// ---------- Copy from an earlier session ----------

/**
 * Copies an earlier session's class subjects (active classes and subjects only),
 * score splits and grade scales into another session. Fills only what is empty;
 * never overwrites (AC-9).
 */
export async function copySessionSetup(
  ctx: SchoolContext,
  input: { fromSessionId: string; toSessionId: string },
): Promise<FormResult<{ classes: number; splits: number; scales: number }>> {
  assertTeam(ctx.actor);
  if (input.fromSessionId === input.toSessionId) return { ok: false, field: "copy", error: "Choose a different session to copy from." };
  return ctx.db.transaction(async (tx) => {
    const [from, to] = [await requireSession(tx, ctx.schoolId, input.fromSessionId), await requireSession(tx, ctx.schoolId, input.toSessionId)];
    // One copy (or split or scale save) per section at a time.
    const sections = await tx.select({ id: section.id }).from(section).where(eq(section.schoolId, ctx.schoolId)).for("no key update");

    const filled = await tx.selectDistinct({ classId: classSubject.classId }).from(classSubject).where(and(eq(classSubject.schoolId, ctx.schoolId), eq(classSubject.sessionId, to.id)));
    const offers = await tx
      .select({ classId: classSubject.classId, sectionId: classSubject.sectionId, subjectId: classSubject.subjectId, isElective: classSubject.isElective })
      .from(classSubject)
      .innerJoin(schoolClass, and(eq(schoolClass.id, classSubject.classId), eq(schoolClass.isActive, true)))
      .innerJoin(schoolSubject, and(eq(schoolSubject.id, classSubject.subjectId), eq(schoolSubject.isActive, true)))
      .where(
        and(
          eq(classSubject.schoolId, ctx.schoolId),
          eq(classSubject.sessionId, from.id),
          filled.length > 0 ? notInArray(classSubject.classId, filled.map((f) => f.classId)) : undefined,
        ),
      );
    if (offers.length > 0) await tx.insert(classSubject).values(offers.map((o) => ({ ...o, schoolId: ctx.schoolId, sessionId: to.id })));

    let splits = 0;
    let scales = 0;
    for (const { id: sectionId } of sections) {
      const inSection = (sessionId: string) => ({
        parts: and(eq(assessmentComponent.schoolId, ctx.schoolId), eq(assessmentComponent.sectionId, sectionId), eq(assessmentComponent.sessionId, sessionId)),
        bands: and(eq(gradeBand.schoolId, ctx.schoolId), eq(gradeBand.sectionId, sectionId), eq(gradeBand.sessionId, sessionId)),
      });
      const [[hasParts], [hasBands]] = await Promise.all([
        tx.select({ n: count() }).from(assessmentComponent).where(inSection(to.id).parts),
        tx.select({ n: count() }).from(gradeBand).where(inSection(to.id).bands),
      ]);
      if (hasParts.n === 0) {
        const parts = await tx.select().from(assessmentComponent).where(inSection(from.id).parts);
        if (parts.length > 0) {
          await tx.insert(assessmentComponent).values(parts.map(({ key, label, maxScore, sortOrder }) => ({ schoolId: ctx.schoolId, sectionId, sessionId: to.id, key, label, maxScore, sortOrder })));
          splits++;
        }
      }
      if (hasBands.n === 0) {
        const bands = await tx.select().from(gradeBand).where(inSection(from.id).bands);
        if (bands.length > 0) {
          await tx.insert(gradeBand).values(bands.map(({ grade, minScore, remark }) => ({ schoolId: ctx.schoolId, sectionId, sessionId: to.id, grade, minScore, remark })));
          scales++;
        }
      }
    }
    const classes = new Set(offers.map((o) => o.classId)).size;
    if (classes + splits + scales === 0) {
      return { ok: false as const, field: "copy", error: `Nothing to copy: ${to.name} already has its own setup, or ${from.name} has none.` };
    }
    return { ok: true as const, classes, splits, scales };
  });
}

// ---------- The setup checklist (AC-10) ----------

export async function getCurriculumProgress(ctx: SchoolContext) {
  assertTeam(ctx.actor);
  const { session } = await resolveSessions(ctx);
  const [subjects, classes, sections, totals, scales] = await Promise.all([
    ctx.db.select({ n: count() }).from(schoolSubject).where(and(eq(schoolSubject.schoolId, ctx.schoolId), eq(schoolSubject.isActive, true))),
    ctx.db
      .select({ id: schoolClass.id, offers: sql<number>`count(${classSubject.id})::int` })
      .from(schoolClass)
      .leftJoin(classSubject, and(eq(classSubject.classId, schoolClass.id), eq(classSubject.sessionId, session?.id ?? sql`null`)))
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.isActive, true)))
      .groupBy(schoolClass.id),
    ctx.db.select({ id: section.id, name: section.name }).from(section).where(eq(section.schoolId, ctx.schoolId)).orderBy(asc(section.stage)),
    session
      ? ctx.db
          .select({ sectionId: assessmentComponent.sectionId, total: sql<number>`sum(${assessmentComponent.maxScore})::int` })
          .from(assessmentComponent)
          .where(and(eq(assessmentComponent.schoolId, ctx.schoolId), eq(assessmentComponent.sessionId, session.id)))
          .groupBy(assessmentComponent.sectionId)
      : [],
    session
      ? ctx.db
          .select({ sectionId: gradeBand.sectionId, n: count() })
          .from(gradeBand)
          .where(and(eq(gradeBand.schoolId, ctx.schoolId), eq(gradeBand.sessionId, session.id)))
          .groupBy(gradeBand.sectionId)
      : [],
  ]);
  const bare = classes.filter((c) => c.offers === 0).length;
  const unready = sections.filter((s) => totals.find((x) => x.sectionId === s.id)?.total !== 100 || !scales.some((x) => x.sectionId === s.id));
  return {
    session,
    subjects: { done: subjects[0].n > 0, count: subjects[0].n },
    classes: { done: classes.length > 0 && bare === 0, count: classes.length, withoutSubjects: bare },
    grading: { done: session !== null && sections.length > 0 && unready.length === 0, sections: sections.length, unready: unready.map((s) => s.name) },
  };
}
