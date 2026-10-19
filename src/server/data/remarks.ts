import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { enrolment, headRemarkBand, school, schoolClass, section, staff, term, termReport, user } from "@/db/schema";
import {
  fromHundredths,
  headRemarkFor,
  type HeadRemark,
  REMARK_MAX,
  type RemarkBand,
  remarkBandsProblem,
  resolveHeadRemark,
  tidyRemark,
  toHundredths,
} from "@/lib/remarks";

import { assertClassAccess, assertWritable } from "./access";
import { type Executor, readSnapshot, type SchoolContext } from "./context";
import { Conflict, InvalidRemark, NotFound, NotInClass, NotSignedIn, TermClosed } from "./errors";
import { type ClassResults, loadClassResults } from "./results";
import { changedByName } from "./scores";
import { getSignerForSection } from "./setup";
import { assertTermsOpen } from "./release";
import { assertTeam, type FormResult } from "./team";
import { getCurrentTerm } from "./terms";

// Remarks (spec 0011): the teacher's and the head's comment for each student
// in a term, kept in `term_report`. The automatic head's comment is worked out
// on every read from the school's bands and the same snapshot's results, never
// stored; `head_remark` holds only text a person typed.

/** A school's bands, highest lowest average first, each lowest average in its shortest text ("70", "62.5"). */
async function loadBands(db: Executor, schoolId: string): Promise<RemarkBand[]> {
  const rows = await db
    .select({ minAverage: headRemarkBand.minAverage, remark: headRemarkBand.remark })
    .from(headRemarkBand)
    .where(eq(headRemarkBand.schoolId, schoolId));
  return rows
    .map((b) => ({ hundredths: toHundredths(b.minAverage)!, remark: b.remark }))
    .sort((a, b) => b.hundredths - a.hundredths)
    .map((b) => ({ minAverage: fromHundredths(b.hundredths), remark: b.remark }));
}

export type RemarkRow = {
  studentId: string;
  teacherRemark: string | null;
  head: HeadRemark;
  /** The automatic comment this student would get now, typed or not; null while results are incomplete. */
  automatic: string | null;
  /** Who last saved this student's comments, and when; null if never saved. */
  lastChange: { by: string; at: Date } | null;
};

/**
 * Each open enrolment's comments for a class and term (AC-11), surname first.
 * Runs every read on the `ctx.db` it is given without opening a transaction,
 * and takes that same snapshot's `loadClassResults` output, so the head's
 * comment always matches the figures printed beside it.
 */
export async function loadClassRemarks(ctx: SchoolContext, input: { classId: string; termId: string; results: ClassResults }) {
  const { results } = input;
  if (results.cls.id !== input.classId || results.term.id !== input.termId) throw new Error("loadClassRemarks needs the results of the same class and term");
  const current = await getCurrentTerm(ctx);
  const [cls] = await ctx.db
    .select({ id: schoolClass.id, sectionId: schoolClass.sectionId, teacherTitle: section.teacherTitle })
    .from(schoolClass)
    .innerJoin(section, eq(section.id, schoolClass.sectionId))
    .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
  if (!cls) throw new NotFound("Class");
  await assertClassAccess(ctx, { classId: cls.id, sessionId: current.session.id });

  const [bands, signer, saved] = await Promise.all([
    loadBands(ctx.db, ctx.schoolId),
    // Who signs comes only from getSignerForSection (spec 0007). It is our team's
    // function; the class access check above has already let this caller in.
    getSignerForSection({ ...ctx, actor: { kind: "system" } }, cls.sectionId),
    ctx.db
      .select({
        studentId: enrolment.studentId,
        teacherRemark: termReport.teacherRemark,
        headRemark: termReport.headRemark,
        updatedAt: termReport.updatedAt,
        userName: user.name,
        userRole: user.role,
        staffTitle: staff.title,
        staffName: staff.fullName,
      })
      .from(termReport)
      .innerJoin(enrolment, and(eq(enrolment.schoolId, termReport.schoolId), eq(enrolment.id, termReport.enrolmentId)))
      .leftJoin(user, eq(user.id, termReport.updatedBy))
      .leftJoin(staff, and(eq(staff.schoolId, termReport.schoolId), eq(staff.userId, termReport.updatedBy)))
      .where(
        and(
          eq(termReport.schoolId, ctx.schoolId),
          eq(enrolment.termId, input.termId),
          eq(enrolment.classId, cls.id),
          isNull(enrolment.withdrawnOn),
        ),
      ),
  ]);

  const byStudent = new Map(saved.map((r) => [r.studentId, r]));
  // The results hold exactly the open enrolments (spec 0010); here in register order.
  const students = [...results.students].sort(
    (a, b) => a.surname.localeCompare(b.surname) || a.otherNames.localeCompare(b.otherNames) || a.studentNo - b.studentNo,
  );
  const rows: RemarkRow[] = students.map((s) => {
    const row = byStudent.get(s.studentId);
    return {
      studentId: s.studentId,
      teacherRemark: row?.teacherRemark ?? null,
      head: resolveHeadRemark(row?.headRemark ?? null, s.average, bands),
      automatic: s.average === null ? null : (headRemarkFor(s.average, bands) ?? null),
      lastChange: row ? { by: changedByName(row), at: row.updatedAt } : null,
    };
  });

  // hasSigner and teacherTitle feed the Report cards section's readiness (spec 0012, AC-1, AC-2).
  return { signerTitle: signer?.title ?? "Principal", hasSigner: signer !== null, teacherTitle: cls.teacherTitle, rows };
}

export type ClassRemarks = Awaited<ReturnType<typeof loadClassRemarks>>;

/** A class's results and comments from one consistent read (AC-11). No `termId` means the current term. */
export function getClassRemarks(ctx: SchoolContext, input: { classId: string; termId?: string }) {
  return readSnapshot(ctx, async (snapshot) => {
    const results = await loadClassResults(snapshot, input);
    const remarks = await loadClassRemarks(snapshot, { classId: input.classId, termId: results.term.id, results });
    return { results, remarks };
  });
}

export type RemarkField = "teacher" | "head";

export type RemarkChangeInput = {
  studentId: string;
  field: RemarkField;
  /** The saved text the person typed over (null if there was none). */
  expected: string | null;
  /** The new text (null to clear; for the head's comment, back to automatic). */
  value: string | null;
};

const COLUMN = { teacher: "teacherRemark", head: "headRemark" } as const;

/**
 * Saves a class's changed comments for a term, all or nothing (AC-5 to AC-8),
 * mirroring `saveScores`. A change that matches what is stored is skipped, so
 * re-sending a save is harmless.
 */
export async function saveRemarks(
  ctx: SchoolContext,
  input: { termId: string; classId: string; saveId: string; changes: RemarkChangeInput[] },
) {
  const userId = ctx.userId;
  if (!userId) throw new NotSignedIn();
  assertWritable(ctx);

  // 1. Shape checks before any database work. The server never trusts the browser's tidy.
  const seen = new Set<string>();
  const changes = input.changes.map((change) => {
    const pair = `${change.studentId}:${change.field}`;
    if (change.field !== "teacher" && change.field !== "head") throw new InvalidRemark(change.studentId, String(change.field), "unknown comment");
    if (seen.has(pair)) throw new InvalidRemark(change.studentId, change.field, "sent twice");
    seen.add(pair);
    const value = tidyRemark(change.value);
    if (value !== null && value.length > REMARK_MAX) throw new InvalidRemark(change.studentId, change.field, `longer than ${REMARK_MAX} characters`);
    return { ...change, value, expected: tidyRemark(change.expected) };
  });
  if (changes.length === 0) return { changed: 0, updatedAt: new Date() };

  return ctx.db.transaction(async (tx) => {
    // 2. The class and term, both within the school.
    const [cls] = await tx
      .select({ id: schoolClass.id })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
    if (!cls) throw new NotFound("Class");
    // Only the current term takes comments (spec 0009, AC-6): the flag is read from
    // this share locked row, so a save racing a term switch lands first or is refused.
    const [termRow] = await tx
      .select({ isCurrent: term.isCurrent, sessionId: term.sessionId })
      .from(term)
      .where(and(eq(term.schoolId, ctx.schoolId), eq(term.id, input.termId)))
      .for("share");
    if (!termRow) throw new NotFound("Term");
    await assertTermsOpen(tx, ctx.schoolId, [input.termId]);
    await assertClassAccess({ ...ctx, db: tx }, { classId: cls.id, sessionId: termRow.sessionId });
    if (!termRow.isCurrent) throw new TermClosed();

    // 3. Every named student must still be an open enrolment of the class this term.
    const studentIds = [...new Set(changes.map((c) => c.studentId))];
    const enrolled = await tx
      .select({ id: enrolment.id, studentId: enrolment.studentId })
      .from(enrolment)
      .where(
        and(
          eq(enrolment.schoolId, ctx.schoolId),
          eq(enrolment.termId, input.termId),
          eq(enrolment.classId, cls.id),
          isNull(enrolment.withdrawnOn),
          inArray(enrolment.studentId, studentIds),
        ),
      );
    const enrolmentOf = new Map(enrolled.map((e) => [e.studentId, e.id]));
    const missing = studentIds.filter((id) => !enrolmentOf.has(id));
    if (missing.length > 0) throw new NotInClass(missing);

    // 4. Lock the stored comments we are about to compare and change.
    const locked = await tx
      .select({ id: termReport.id, enrolmentId: termReport.enrolmentId, teacherRemark: termReport.teacherRemark, headRemark: termReport.headRemark })
      .from(termReport)
      .where(and(eq(termReport.schoolId, ctx.schoolId), inArray(termReport.enrolmentId, [...enrolmentOf.values()])))
      .for("update");
    const stored = new Map(locked.map((row) => [row.enrolmentId, row]));

    // 5. Compare with what the person saw; skip no-op changes.
    const conflicts = new Set<string>();
    const writes = new Map<string, { teacherRemark?: string | null; headRemark?: string | null }>();
    for (const change of changes) {
      const enrolmentId = enrolmentOf.get(change.studentId)!;
      const column = COLUMN[change.field];
      const current = tidyRemark(stored.get(enrolmentId)?.[column]);
      if (change.value === current) continue;
      if (change.expected !== current) {
        conflicts.add(change.studentId);
        continue;
      }
      writes.set(enrolmentId, { ...writes.get(enrolmentId), [column]: change.value });
    }
    if (conflicts.size > 0) throw new Conflict([...conflicts]);
    if (writes.size === 0) return { changed: 0, updatedAt: new Date() };

    // 6. Write. A typed head's comment is kept as typed even if it equals today's automatic text.
    const inserts = [...writes].filter(([enrolmentId]) => !stored.has(enrolmentId));
    if (inserts.length > 0) {
      try {
        await tx.insert(termReport).values(inserts.map(([enrolmentId, set]) => ({ schoolId: ctx.schoolId, enrolmentId, ...set, updatedBy: userId })));
      } catch (error) {
        // Two first saves for the same student at once: the later one loses cleanly.
        if (isUniqueViolation(error)) {
          const ids = new Set(inserts.map(([enrolmentId]) => enrolmentId));
          throw new Conflict(enrolled.filter((e) => ids.has(e.id)).map((e) => e.studentId));
        }
        throw error;
      }
    }
    for (const [enrolmentId, set] of writes) {
      const row = stored.get(enrolmentId);
      if (row) await tx.update(termReport).set({ ...set, updatedBy: userId }).where(eq(termReport.id, row.id));
    }
    const changed = [...writes.values()].reduce((n, set) => n + Object.keys(set).length, 0);
    return { changed, updatedAt: new Date() };
  });
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: string }).code === "23505") return true;
  }
  return false;
}

/** Our team's view of a school's principal's comment bands, highest first (AC-10). */
export async function getRemarkBands(ctx: SchoolContext): Promise<RemarkBand[]> {
  assertTeam(ctx.actor);
  return loadBands(ctx.db, ctx.schoolId);
}

/**
 * Replaces a school's bands as one set (AC-10). A broken rule names the band
 * and saves nothing. Nothing references a band, so the set is rewritten; the
 * automatic comments follow on the next read, in every term.
 */
export async function saveRemarkBands(ctx: SchoolContext, input: { bands: RemarkBand[] }): Promise<FormResult> {
  assertTeam(ctx.actor);
  if (!Array.isArray(input.bands) || input.bands.some((b) => typeof b?.minAverage !== "string" || typeof b.remark !== "string")) {
    return { ok: false, field: "bands", error: "Those bands couldn’t be read. Reload the page and try again." };
  }
  const problem = remarkBandsProblem(input.bands);
  if (problem) return { ok: false, field: problem.index === null ? "bands" : `band-${problem.index}`, error: problem.error };
  const bands = input.bands.map((b) => ({ minAverage: fromHundredths(toHundredths(b.minAverage)!), remark: tidyRemark(b.remark)! }));

  return ctx.db.transaction(async (tx) => {
    // Locks the school, so two band saves for it run one at a time.
    const [found] = await tx.select({ id: school.id }).from(school).where(eq(school.id, ctx.schoolId)).for("no key update");
    if (!found) throw new NotFound("School");
    await tx.delete(headRemarkBand).where(eq(headRemarkBand.schoolId, ctx.schoolId));
    await tx.insert(headRemarkBand).values(bands.map((b) => ({ schoolId: ctx.schoolId, ...b })));
    return { ok: true as const };
  });
}
