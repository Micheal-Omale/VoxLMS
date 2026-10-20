import "server-only";

import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import {
  assessmentComponent,
  classSubject,
  enrolment,
  gradeBand,
  schoolClass,
  schoolSubject,
  score,
  scoreChange,
  section,
  staff,
  student,
  studentElective,
  term,
  user,
} from "@/db/schema";

import { assertClassAccess, assertWritable } from "./access";
import type { Executor, SchoolContext } from "./context";
import {
  Conflict,
  InvalidScore,
  NotFound,
  NotSignedIn,
  NotTakingSubject,
  ScoreAboveMaximum,
  TermClosed,
} from "./errors";
import { assertTermsOpen } from "./release";
import { assertTeam } from "./team";
import { getCurrentTerm } from "./terms";

/** What a teacher may type: up to three digits and one decimal place (spec 0003, AC-4). */
export const SCORE_INPUT = /^\d{1,3}(\.\d)?$/;

/** One canonical text form per number, so "17", "17.0" and 17 compare equal. Null is missing. */
export function canonicalScore(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(Number(value));
}

/** studentId → component key → score as text, e.g. { s1: { ca1: "17", exam: "48" } }. */
export type ScoresByStudent = Record<string, Record<string, string>>;

async function loadClassSubject(db: Executor, schoolId: string, termId: string, classSubjectId: string) {
  const [row] = await db
    .select({
      id: classSubject.id,
      classId: classSubject.classId,
      sessionId: classSubject.sessionId,
      sectionId: classSubject.sectionId,
      subjectId: classSubject.subjectId,
      isElective: classSubject.isElective,
      subjectName: schoolSubject.name,
      className: schoolClass.name,
      sectionName: section.name,
      termId: term.id,
      termNumber: term.number,
      termIsCurrent: term.isCurrent,
    })
    .from(classSubject)
    .innerJoin(schoolSubject, eq(schoolSubject.id, classSubject.subjectId))
    .innerJoin(schoolClass, eq(schoolClass.id, classSubject.classId))
    .innerJoin(section, eq(section.id, classSubject.sectionId))
    // The term must be in the same school and the same session as the subject offer.
    .innerJoin(
      term,
      and(eq(term.schoolId, classSubject.schoolId), eq(term.sessionId, classSubject.sessionId), eq(term.id, termId)),
    )
    .where(and(eq(classSubject.schoolId, schoolId), eq(classSubject.id, classSubjectId)));
  if (!row) throw new NotFound("Class subject");
  return row;
}

type Offer = Awaited<ReturnType<typeof loadClassSubject>>;

/**
 * The section's parts for the subject's session. A save locks them for share
 * while it checks maximums, so a split change can't lower a maximum mid-save
 * (spec 0006, AC-7); one of the two waits for the other.
 */
async function loadComponents(db: Executor, schoolId: string, offer: Offer, lock = false) {
  const query = db
    .select({
      id: assessmentComponent.id,
      key: assessmentComponent.key,
      label: assessmentComponent.label,
      maxScore: assessmentComponent.maxScore,
    })
    .from(assessmentComponent)
    .where(
      and(
        eq(assessmentComponent.schoolId, schoolId),
        eq(assessmentComponent.sectionId, offer.sectionId),
        eq(assessmentComponent.sessionId, offer.sessionId),
      ),
    )
    .orderBy(asc(assessmentComponent.sortOrder));
  return lock ? query.for("share") : query;
}

/** Enrolments (not withdrawn) of students taking this subject in this term. */
async function loadTakers(db: Executor, schoolId: string, offer: Offer, studentIds?: string[]) {
  const rows = await db
    .select({
      enrolmentId: enrolment.id,
      studentId: student.id,
      studentNo: student.studentNo,
      admissionNo: student.admissionNo,
      surname: student.surname,
      otherNames: student.otherNames,
    })
    .from(enrolment)
    .innerJoin(student, eq(student.id, enrolment.studentId))
    .where(
      and(
        eq(enrolment.schoolId, schoolId),
        eq(enrolment.termId, offer.termId),
        eq(enrolment.classId, offer.classId),
        isNull(enrolment.withdrawnOn),
        studentIds ? inArray(enrolment.studentId, studentIds) : undefined,
      ),
    )
    .orderBy(asc(student.surname), asc(student.otherNames));

  if (!offer.isElective || rows.length === 0) return rows;
  const registered = await db
    .select({ studentId: studentElective.studentId })
    .from(studentElective)
    .where(
      and(
        eq(studentElective.schoolId, schoolId),
        eq(studentElective.sessionId, offer.sessionId),
        eq(studentElective.subjectId, offer.subjectId),
        inArray(
          studentElective.studentId,
          rows.map((r) => r.studentId),
        ),
      ),
    );
  const ids = new Set(registered.map((r) => r.studentId));
  return rows.filter((r) => ids.has(r.studentId));
}

/** Everything the score entry screen needs for one subject of one class in one term. */
export async function getScoreSheet(ctx: SchoolContext, input: { termId: string; classSubjectId: string }) {
  const offer = await loadClassSubject(ctx.db, ctx.schoolId, input.termId, input.classSubjectId);
  await assertClassAccess(ctx, { classId: offer.classId, sessionId: offer.sessionId });
  const current = await assertTermReachable(ctx, offer);
  const [components, bands, takers] = await Promise.all([
    loadComponents(ctx.db, ctx.schoolId, offer),
    ctx.db
      .select({ grade: gradeBand.grade, minScore: gradeBand.minScore, remark: gradeBand.remark })
      .from(gradeBand)
      .where(
        and(
          eq(gradeBand.schoolId, ctx.schoolId),
          eq(gradeBand.sectionId, offer.sectionId),
          eq(gradeBand.sessionId, offer.sessionId),
        ),
      ),
    loadTakers(ctx.db, ctx.schoolId, offer),
  ]);

  const scores: ScoresByStudent = {};
  let lastSavedAt: Date | null = null;
  if (takers.length > 0) {
    const rows = await ctx.db
      .select({ enrolmentId: score.enrolmentId, componentId: score.componentId, value: score.value, updatedAt: score.updatedAt })
      .from(score)
      .where(
        and(
          eq(score.schoolId, ctx.schoolId),
          eq(score.classSubjectId, offer.id),
          inArray(
            score.enrolmentId,
            takers.map((t) => t.enrolmentId),
          ),
        ),
      );
    const studentOf = new Map(takers.map((t) => [t.enrolmentId, t.studentId]));
    const keyOf = new Map(components.map((c) => [c.id, c.key]));
    for (const row of rows) {
      const studentId = studentOf.get(row.enrolmentId)!;
      const key = keyOf.get(row.componentId)!;
      (scores[studentId] ??= {})[key] = canonicalScore(row.value)!;
      if (!lastSavedAt || row.updatedAt > lastSavedAt) lastSavedAt = row.updatedAt;
    }
  }

  return {
    subject: { classSubjectId: offer.id, classId: offer.classId, name: offer.subjectName, className: offer.className, isElective: offer.isElective },
    term: { id: offer.termId, number: offer.termNumber, isCurrent: offer.termIsCurrent },
    section: { name: offer.sectionName },
    session: { name: current.session.name },
    components: components.map((c) => ({ key: c.key, label: c.label, max: Number(c.maxScore) })),
    gradeBands: bands
      .map((b) => ({ grade: b.grade, min: Number(b.minScore), remark: b.remark }))
      .sort((a, b) => b.min - a.min),
    students: takers.map(({ studentId, studentNo, admissionNo, surname, otherNames }) => ({ studentId, studentNo, admissionNo, surname, otherNames })),
    scores,
    lastSavedAt,
  };
}

export type ScoreSheetData = Awaited<ReturnType<typeof getScoreSheet>>;

/**
 * Only this session's terms up to the current one can be opened (AC-2); a
 * later term, or a term of another session, is "not found".
 */
async function assertTermReachable(ctx: SchoolContext, offer: { sessionId: string; termNumber: number }) {
  const current = await getCurrentTerm(ctx);
  if (offer.sessionId !== current.session.id || offer.termNumber > current.term.number) throw new NotFound("Term");
  return current;
}

export type ScoreChangeInput = {
  studentId: string;
  componentKey: string;
  /** The value the teacher last saw (null if it was empty). */
  expected: string | null;
  /** The new value (null to clear). */
  value: string | null;
};

/**
 * Saves one class subject's changed scores, all or nothing (spec 0003, AC-4, AC-5, AC-8).
 * A change that matches what is stored is skipped, so re-sending a save is harmless.
 */
export async function saveScores(
  ctx: SchoolContext,
  input: { termId: string; classSubjectId: string; saveId: string; changes: ScoreChangeInput[] },
) {
  const userId = ctx.userId;
  if (!userId) throw new NotSignedIn();
  assertWritable(ctx);

  // 1. Shape checks before any database work.
  const seen = new Set<string>();
  for (const change of input.changes) {
    const pair = `${change.studentId}:${change.componentKey}`;
    if (seen.has(pair)) throw new InvalidScore(change.studentId, change.componentKey, change.value ?? "", "sent twice");
    seen.add(pair);
    if (change.value !== null && !SCORE_INPUT.test(change.value)) {
      throw new InvalidScore(change.studentId, change.componentKey, change.value, "use up to 3 digits and 1 decimal place");
    }
    if (change.expected !== null && !SCORE_INPUT.test(change.expected)) {
      throw new InvalidScore(change.studentId, change.componentKey, change.expected, "previous value is not a score");
    }
  }
  if (input.changes.length === 0) return { changed: 0, updatedAt: new Date() };

  return ctx.db.transaction(async (tx) => {
    // 2. Resolve parts through the class's section and the subject's session.
    const offer = await loadClassSubject(tx, ctx.schoolId, input.termId, input.classSubjectId);
    await assertClassAccess({ ...ctx, db: tx }, { classId: offer.classId, sessionId: offer.sessionId });
    await assertTermsOpen(tx, ctx.schoolId, [offer.termId]);
    // Only the current term takes scores (spec 0009, AC-6). The flag is read from
    // this locked row, never from the unlocked join above: setCurrentTerm updates
    // this row, so a save racing a term switch lands before it or is refused after.
    const [termRow] = await tx
      .select({ isCurrent: term.isCurrent })
      .from(term)
      .where(and(eq(term.schoolId, ctx.schoolId), eq(term.id, offer.termId)))
      .for("share");
    if (!termRow?.isCurrent) throw new TermClosed();
    const components = await loadComponents(tx, ctx.schoolId, offer, true);
    const byKey = new Map(components.map((c) => [c.key, c]));
    for (const change of input.changes) {
      const part = byKey.get(change.componentKey);
      if (!part) throw new InvalidScore(change.studentId, change.componentKey, change.value ?? "", "unknown part");
      if (change.value !== null && Number(change.value) > Number(part.maxScore)) {
        throw new ScoreAboveMaximum(change.studentId, part.label, canonicalScore(part.maxScore)!, change.value);
      }
    }

    const studentIds = [...new Set(input.changes.map((c) => c.studentId))];
    const takers = await loadTakers(tx, ctx.schoolId, offer, studentIds);
    const enrolmentOf = new Map(takers.map((t) => [t.studentId, t.enrolmentId]));
    const missing = studentIds.filter((id) => !enrolmentOf.has(id));
    if (missing.length > 0) throw new NotTakingSubject(missing);

    // 3. Lock the stored scores we are about to compare and change.
    const locked = await tx
      .select({ id: score.id, enrolmentId: score.enrolmentId, componentId: score.componentId, value: score.value })
      .from(score)
      .where(
        and(
          eq(score.schoolId, ctx.schoolId),
          eq(score.classSubjectId, offer.id),
          inArray(score.enrolmentId, [...enrolmentOf.values()]),
        ),
      )
      .for("update");
    const stored = new Map(locked.map((row) => [`${row.enrolmentId}:${row.componentId}`, row]));

    // 4. Compare with what the teacher saw; skip no-op changes.
    const conflicts = new Set<string>();
    const writes: { enrolmentId: string; componentId: string; current: (typeof locked)[number] | undefined; next: string | null }[] = [];
    for (const change of input.changes) {
      const enrolmentId = enrolmentOf.get(change.studentId)!;
      const componentId = byKey.get(change.componentKey)!.id;
      const current = stored.get(`${enrolmentId}:${componentId}`);
      const currentValue = canonicalScore(current?.value);
      const next = canonicalScore(change.value);
      if (next === currentValue) continue;
      if (canonicalScore(change.expected) !== currentValue) {
        conflicts.add(change.studentId);
        continue;
      }
      writes.push({ enrolmentId, componentId, current, next });
    }
    if (conflicts.size > 0) throw new Conflict([...conflicts]);
    if (writes.length === 0) return { changed: 0, updatedAt: new Date() };

    // 5. Write the changes and their log in this same transaction.
    const shared = { schoolId: ctx.schoolId, classSubjectId: offer.id, classId: offer.classId, sessionId: offer.sessionId, sectionId: offer.sectionId };
    const inserts = writes.filter((w) => !w.current && w.next !== null);
    if (inserts.length > 0) {
      try {
        await tx.insert(score).values(
          inserts.map((w) => ({ ...shared, enrolmentId: w.enrolmentId, componentId: w.componentId, value: w.next!, updatedBy: userId })),
        );
      } catch (error) {
        // Two first saves of the same score at once: the later one loses cleanly.
        if (isUniqueViolation(error)) {
          const ids = new Set(inserts.map((w) => w.enrolmentId));
          throw new Conflict(takers.filter((t) => ids.has(t.enrolmentId)).map((t) => t.studentId));
        }
        throw error;
      }
    }
    for (const w of writes) {
      if (!w.current) continue;
      if (w.next === null) await tx.delete(score).where(eq(score.id, w.current.id));
      else await tx.update(score).set({ value: w.next, updatedBy: userId }).where(eq(score.id, w.current.id));
    }
    await tx.insert(scoreChange).values(
      writes.map((w) => ({
        schoolId: ctx.schoolId,
        saveId: input.saveId,
        enrolmentId: w.enrolmentId,
        classSubjectId: offer.id,
        componentId: w.componentId,
        oldValue: w.current?.value ?? null,
        newValue: w.next,
        changedBy: userId,
      })),
    );
    return { changed: writes.length, updatedAt: new Date() };
  });
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: string }).code === "23505") return true;
  }
  return false;
}

export type SubjectProgressRow = {
  classSubjectId: string;
  classId: string;
  name: string;
  isElective: boolean;
  /** M: open enrolments taking the subject this term (an elective counts only its registered students). */
  takers: number;
  /** N: takers with a score for every part of the section's split. */
  complete: number;
};

/**
 * "N of M complete" for every subject of some classes in one term (spec 0009,
 * AC-1, AC-12). Counted from the scores each time it is shown, never stored.
 * With no split set, nobody is complete: a missing part is never a 0.
 */
export async function subjectProgress(db: Executor, schoolId: string, input: { termId: string; sessionId: string; classIds: string[] }) {
  if (input.classIds.length === 0) return [];
  const classIds = sql.join(
    input.classIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const result = await db.execute<SubjectProgressRow>(sql`
    select cs.id as "classSubjectId", cs.class_id as "classId", sub.name, cs.is_elective as "isElective",
      count(e.id)::int as takers,
      (count(e.id) filter (where parts.n > 0 and (
        select count(*) from score sc
        join assessment_component ac on ac.id = sc.component_id and ac.section_id = cs.section_id and ac.session_id = cs.session_id
        where sc.enrolment_id = e.id and sc.class_subject_id = cs.id
      ) = parts.n))::int as complete
    from class_subject cs
    join school_subject sub on sub.id = cs.subject_id
    cross join lateral (
      select count(*)::int as n from assessment_component ac
      where ac.school_id = cs.school_id and ac.section_id = cs.section_id and ac.session_id = cs.session_id
    ) parts
    left join enrolment e on e.school_id = cs.school_id and e.term_id = ${input.termId} and e.class_id = cs.class_id
      and e.withdrawn_on is null
      and (not cs.is_elective or exists (
        select 1 from student_elective se
        where se.school_id = cs.school_id and se.student_id = e.student_id
          and se.session_id = cs.session_id and se.subject_id = cs.subject_id
      ))
    where cs.school_id = ${schoolId} and cs.session_id = ${input.sessionId} and cs.class_id in (${classIds})
    group by cs.id, sub.name, sub.sort_order
    order by cs.is_elective, sub.sort_order, sub.name`);
  return result.rows;
}

/**
 * The Scores section of a class page (AC-1, AC-2): this session's terms up to
 * the current one for the picker (newest first), and each subject's progress
 * in the chosen term, compulsory first, then electives, in the school's order.
 */
export async function listSubjectProgress(ctx: SchoolContext, input: { classId: string; termId?: string }) {
  const current = await getCurrentTerm(ctx);
  const [cls] = await ctx.db
    .select({ id: schoolClass.id, name: schoolClass.name })
    .from(schoolClass)
    .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
  if (!cls) throw new NotFound("Class");
  await assertClassAccess(ctx, { classId: cls.id, sessionId: current.session.id });

  const terms = await ctx.db
    .select({ id: term.id, number: term.number, isCurrent: term.isCurrent })
    .from(term)
    .where(and(eq(term.schoolId, ctx.schoolId), eq(term.sessionId, current.session.id), lte(term.number, current.term.number)))
    .orderBy(desc(term.number));
  const chosen = input.termId ? terms.find((t) => t.id === input.termId) : terms.find((t) => t.isCurrent);
  if (!chosen) throw new NotFound("Term");

  const subjects = await subjectProgress(ctx.db, ctx.schoolId, { termId: chosen.id, sessionId: current.session.id, classIds: [cls.id] });
  return { cls, session: current.session, terms, term: chosen, subjects };
}

/**
 * Our team's Scores page (AC-12): the current term's active classes by
 * section, with subjects done out of subjects anyone takes, and the
 * unfinished ones with their counts.
 */
export async function getScoreProgress(ctx: SchoolContext) {
  assertTeam(ctx.actor);
  const current = await getCurrentTerm(ctx);
  const [sections, classes] = await Promise.all([
    ctx.db.select({ id: section.id, name: section.name }).from(section).where(eq(section.schoolId, ctx.schoolId)).orderBy(asc(section.stage)),
    ctx.db
      .select({ id: schoolClass.id, name: schoolClass.name, sectionId: schoolClass.sectionId })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.isActive, true)))
      .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)),
  ]);
  const rows = await subjectProgress(ctx.db, ctx.schoolId, {
    termId: current.term.id,
    sessionId: current.session.id,
    classIds: classes.map((c) => c.id),
  });

  return {
    term: current.term,
    session: current.session,
    sections: sections
      .map((s) => ({
        id: s.id,
        name: s.name,
        classes: classes
          .filter((c) => c.sectionId === s.id)
          .map((c) => {
            const taken = rows.filter((r) => r.classId === c.id && r.takers > 0);
            const unfinished = taken.filter((r) => r.complete < r.takers);
            return {
              id: c.id,
              name: c.name,
              subjects: taken.length,
              done: taken.length - unfinished.length,
              unfinished: unfinished.map(({ classSubjectId, name, complete, takers }) => ({ classSubjectId, name, complete, takers })),
            };
          }),
      }))
      .filter((s) => s.classes.length > 0),
  };
}

/**
 * Every change to one student's scores in one subject and term (AC-11), per
 * part, newest first. Names are looked up when read: our team as "VoxLMS team
 * (name)", school staff by their title and name in this school.
 */
export async function getScoreHistory(ctx: SchoolContext, input: { termId: string; classSubjectId: string; studentId: string }) {
  const offer = await loadClassSubject(ctx.db, ctx.schoolId, input.termId, input.classSubjectId);
  await assertClassAccess(ctx, { classId: offer.classId, sessionId: offer.sessionId });
  await assertTermReachable(ctx, offer);
  const [enrolled] = await ctx.db
    .select({ id: enrolment.id })
    .from(enrolment)
    .where(
      and(
        eq(enrolment.schoolId, ctx.schoolId),
        eq(enrolment.studentId, input.studentId),
        eq(enrolment.termId, offer.termId),
        eq(enrolment.classId, offer.classId),
      ),
    );
  if (!enrolled) throw new NotFound("Student");

  const [components, changes] = await Promise.all([
    loadComponents(ctx.db, ctx.schoolId, offer),
    ctx.db
      .select({
        componentId: scoreChange.componentId,
        oldValue: scoreChange.oldValue,
        newValue: scoreChange.newValue,
        changedAt: scoreChange.changedAt,
        userName: user.name,
        userRole: user.role,
        staffTitle: staff.title,
        staffName: staff.fullName,
      })
      .from(scoreChange)
      .leftJoin(user, eq(user.id, scoreChange.changedBy))
      .leftJoin(staff, and(eq(staff.schoolId, scoreChange.schoolId), eq(staff.userId, scoreChange.changedBy)))
      .where(
        and(
          eq(scoreChange.schoolId, ctx.schoolId),
          eq(scoreChange.enrolmentId, enrolled.id),
          eq(scoreChange.classSubjectId, offer.id),
        ),
      )
      .orderBy(desc(scoreChange.changedAt), desc(scoreChange.id)),
  ]);

  return components.map((c) => ({
    key: c.key,
    label: c.label,
    changes: changes
      .filter((ch) => ch.componentId === c.id)
      .map((ch) => ({
        oldValue: canonicalScore(ch.oldValue),
        newValue: canonicalScore(ch.newValue),
        changedAt: ch.changedAt,
        by: changedByName(ch),
      })),
  }));
}

export type ScoreHistory = Awaited<ReturnType<typeof getScoreHistory>>;

export function changedByName(row: { userName: string | null; userRole: string | null; staffTitle: string | null; staffName: string | null }) {
  if (row.userRole === "admin") return `VoxLMS team (${row.userName ?? "unknown"})`;
  if (row.staffName) return [row.staffTitle, row.staffName].filter(Boolean).join(" ");
  return row.userName ?? "Someone no longer on the staff";
}
