import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  academicSession,
  enrolment,
  guardian,
  importRun,
  type ImportCounts,
  schoolClass,
  student,
  studentGuardian,
  term,
} from "@/db/schema";
import { type Gender, normaliseAdmissionNo, type Relationship } from "@/lib/enrolment-rules";
import { type ClassOption, classKey, classProblem, matchClass } from "@/lib/import/classes";
import { type ColumnMap, mapColumns } from "@/lib/import/columns";
import type { Grid } from "@/lib/import/grid";
import { parentNameKey, studentNameKey } from "@/lib/import/names";
import { parseStudentRows } from "@/lib/import/students";
import { termLabel } from "@/lib/term-label";

import { assertWritable } from "./access";
import type { Executor, SchoolContext } from "./context";
import { DataError, NoCurrentTerm, NotSignedIn } from "./errors";
import { assertTermsOpen } from "./release";
import { allocateStudentNumbers, lockCurrentTerm, registerName } from "./students";
import { assertTeam, violatedConstraint } from "./team";

// Excel import of students with their parents (spec 0013). One planner
// decides every row's outcome; Preview shows its plan and Confirm runs it
// again inside its transaction, saving only when nothing changed meanwhile.
// Import only adds: it never changes an existing student or parent.

export type StudentOutcome = "add" | "here" | "probably" | "problem";

export type PlannedParent = {
  block: string;
  fullName: string;
  phone: string;
  relationship: Relationship;
  isPrimary: boolean;
  match:
    | { kind: "existing"; guardianId: string; fullName: string }
    /** sharedWithRow: an earlier row of the file that brings in the same new parent (siblings). */
    | { kind: "new"; key: string; sharedWithRow: number | null };
  note: string | null;
};

export type PlannedStudent = {
  row: number;
  outcome: StudentOutcome;
  surname: string;
  otherNames: string;
  gender: Gender | null;
  classText: string;
  classId: string | null;
  className: string | null;
  admissionNo: string | null;
  house: string | null;
  parents: PlannedParent[];
  /** Why it is a problem, already here, or probably here, in plain words. */
  reasons: string[];
  notes: string[];
};

export type StudentPlan = {
  kind: "students";
  sheet: string;
  headerRow: number;
  columns: ColumnMap<"students">["used"];
  ignored: string[];
  termId: string;
  termLabel: string;
  /** The school's active classes, shown once when a row names a class it doesn't have. */
  classNames: string[];
  counts: { add: number; here: number; probably: number; problems: number };
  rows: PlannedStudent[];
  /** A hash of every row's number and outcome (and what it links to), so Confirm saves exactly this. */
  planHash: string;
};

export class TermChanged extends DataError {
  constructor() {
    super("The current term changed since the preview");
  }
}

/** Records changed since the preview; carries the fresh one. */
export class PlanChanged extends DataError {
  constructor(public readonly plan: StudentPlan) {
    super("Records changed since the preview");
  }
}

/** A unique key clashed at the database: someone saved a record while we were importing. */
export class ImportClash extends DataError {
  constructor() {
    super("Someone changed this school's records while the import was saving");
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const normalisedAdmission = sql<string>`upper(regexp_replace(${student.admissionNo}, '\\s', '', 'g'))`;

/** The current term, share locked when planning inside Confirm's transaction. */
async function planTerm(db: Executor, schoolId: string, lock: boolean) {
  const current = lock
    ? await lockCurrentTerm(db, schoolId)
    : (
        await db
          .select({ id: term.id, sessionId: term.sessionId, number: term.number })
          .from(term)
          .where(and(eq(term.schoolId, schoolId), eq(term.isCurrent, true)))
      )[0];
  if (!current) throw new NoCurrentTerm();
  const [session] = await db.select({ name: academicSession.name }).from(academicSession).where(eq(academicSession.id, current.sessionId));
  return { id: current.id, sessionId: current.sessionId, label: termLabel(current.number, session.name) };
}

/**
 * Every row's outcome for this school (AC-4 to AC-8): will add, already here,
 * probably here, or a problem. The database is read in a few set based
 * queries, never one per row. With `lock`, inside Confirm's transaction, the
 * term, the classes and the parents it may link are share locked first.
 */
export async function planStudentImport(ctx: SchoolContext, grid: Grid, options: { lock?: boolean } = {}): Promise<StudentPlan> {
  assertTeam(ctx.actor);
  const lock = options.lock === true;
  const map = mapColumns("students", grid.header);
  const parsed = parseStudentRows(grid, map);
  const current = await planTerm(ctx.db, ctx.schoolId, lock);

  const classQuery = ctx.db
    .select({ id: schoolClass.id, name: schoolClass.name, arm: schoolClass.arm, isActive: schoolClass.isActive, sortOrder: schoolClass.sortOrder })
    .from(schoolClass)
    .where(eq(schoolClass.schoolId, ctx.schoolId))
    .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name));
  const classes: (ClassOption & { sortOrder: number })[] = lock ? await classQuery.for("share") : await classQuery;

  const admissionNos = [...new Set(parsed.flatMap((r) => (r.admissionNo && !r.repeatedAdmissionNo ? [normaliseAdmissionNo(r.admissionNo)] : [])))];
  const phones = [...new Set(parsed.flatMap((r) => r.parents.map((p) => p.phone)))];

  const [holders, enrolled, phoneParents] = await Promise.all([
    admissionNos.length === 0
      ? []
      : ctx.db
          .select({ norm: normalisedAdmission, surname: student.surname, otherNames: student.otherNames, status: student.status, className: schoolClass.name })
          .from(student)
          .leftJoin(enrolment, and(eq(enrolment.studentId, student.id), eq(enrolment.termId, current.id)))
          .leftJoin(schoolClass, eq(schoolClass.id, enrolment.classId))
          .where(and(eq(student.schoolId, ctx.schoolId), inArray(normalisedAdmission, admissionNos))),
    // Everyone enrolled this term, open or withdrawn, for "probably here" (AC-6).
    ctx.db
      .select({ surname: student.surname, otherNames: student.otherNames, classId: enrolment.classId, className: schoolClass.name })
      .from(enrolment)
      .innerJoin(student, eq(student.id, enrolment.studentId))
      .innerJoin(schoolClass, eq(schoolClass.id, enrolment.classId))
      .where(and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.termId, current.id))),
    phones.length === 0 ? [] : guardiansByPhone(ctx.db, ctx.schoolId, phones, lock),
  ]);

  const holderOf = new Map(holders.map((h) => [h.norm, h]));
  const enrolledByName = new Map<string, typeof enrolled>();
  for (const e of enrolled) {
    const key = studentNameKey(e.surname, e.otherNames);
    enrolledByName.set(key, [...(enrolledByName.get(key) ?? []), e]);
  }
  const parentsByPhone = new Map<string, typeof phoneParents>();
  for (const p of phoneParents) parentsByPhone.set(p.phone, [...(parentsByPhone.get(p.phone) ?? []), p]);

  /** Earlier rows of the file by name and class, whatever their outcome (AC-6). */
  const earlierRows = new Map<string, number>();
  /** The first row bringing in each new parent, among rows that may be saved (AC-7). */
  const firstRowOfParent = new Map<string, number>();
  /** The first name seen on the file for each new parent's phone, for "same phone as". */
  const fileNameOfPhone = new Map<string, { key: string; fullName: string; row: number }>();

  const rows: PlannedStudent[] = parsed.map((p) => {
    const reasons: string[] = [];
    const notes = [...p.notes];
    const match = p.classText ? matchClass(p.classText, classes) : null;
    const cls = match?.kind === "match" ? match.cls : null;
    const nameKey = studentNameKey(p.surname, p.otherNames);
    const classSlot = cls ? cls.id : `text:${classKey(p.classText)}`;
    const earlier = earlierRows.get(`${nameKey}@${classSlot}`);
    if (!earlierRows.has(`${nameKey}@${classSlot}`)) earlierRows.set(`${nameKey}@${classSlot}`, p.row);

    let outcome: StudentOutcome;
    const holder = p.admissionNo && !p.repeatedAdmissionNo ? holderOf.get(normaliseAdmissionNo(p.admissionNo)) : undefined;
    if (p.repeatedAdmissionNo) {
      outcome = "problem";
      reasons.push(...p.problems);
    } else if (holder) {
      // Already here: skipped entirely, and that student is not changed (AC-6).
      outcome = "here";
      reasons.push(`${p.admissionNo} already belongs to ${registerName(holder)}.`);
      if (holder.status !== "active") notes.push(`${registerName(holder)} has left the school; not changed.`);
      else if (!holder.className) notes.push(`${registerName(holder)} isn’t in a class this term; not added to one.`);
      else if (cls && holder.className !== cls.name) notes.push(`${registerName(holder)} is in ${holder.className}; not moved.`);
    } else {
      const problems = [...p.problems];
      const wrongClass = p.classText && match ? classProblem(p.classText, match) : null;
      if (wrongClass) problems.push(wrongClass);
      const sameName = enrolledByName.get(nameKey) ?? [];
      if (problems.length > 0) {
        outcome = "problem";
        reasons.push(...problems);
      } else if (!p.admissionNo && (sameName.length > 0 || earlier !== undefined)) {
        outcome = "probably";
        if (sameName.length > 0) reasons.push(`Probably ${registerName(sameName[0])} in ${sameName[0].className}.`);
        else reasons.push(`Probably the same as row ${earlier}.`);
      } else {
        outcome = "add";
        const inClass = sameName.find((s) => s.classId === cls?.id);
        if (inClass) notes.push(`There is already ${/^[AEIOU]/i.test(inClass.surname) ? "an" : "a"} ${registerName(inClass)} in ${inClass.className}, with another admission number.`);
      }
    }

    const mayBeSaved = outcome === "add" || outcome === "probably";
    const parents: PlannedParent[] = p.parents.map((parent) => {
      const samePhone = parentsByPhone.get(parent.phone) ?? [];
      const nameKeyOf = parentNameKey(parent.fullName);
      const existing = samePhone.find((g) => parentNameKey(g.fullName) === nameKeyOf);
      if (existing) return { ...parent, match: { kind: "existing", guardianId: existing.id, fullName: existing.fullName }, note: null };
      let note: string | null = null;
      const other = samePhone[0];
      if (other) note = `Same phone as ${other.fullName}${other.child ? ` (parent of ${registerName(other.child)})` : ""}.`;
      const seen = fileNameOfPhone.get(parent.phone);
      if (!note && seen && seen.key !== parent.key) note = `Same phone as ${seen.fullName} on row ${seen.row}.`;
      if (mayBeSaved && !seen) fileNameOfPhone.set(parent.phone, { key: parent.key, fullName: parent.fullName, row: p.row });
      const first = firstRowOfParent.get(parent.key);
      if (mayBeSaved && first === undefined) firstRowOfParent.set(parent.key, p.row);
      return { ...parent, match: { kind: "new", key: parent.key, sharedWithRow: first ?? null }, note };
    });

    return {
      row: p.row,
      outcome,
      surname: p.surname,
      otherNames: p.otherNames,
      gender: p.gender,
      classText: p.classText,
      classId: cls?.id ?? null,
      className: cls?.name ?? (match?.kind === "off" ? match.cls.name : null),
      admissionNo: p.admissionNo,
      house: p.house,
      parents,
      reasons,
      notes,
    };
  });

  const counts = { add: 0, here: 0, probably: 0, problems: 0 };
  for (const r of rows) {
    if (r.outcome === "add") counts.add++;
    else if (r.outcome === "here") counts.here++;
    else if (r.outcome === "probably") counts.probably++;
    else counts.problems++;
  }
  const fingerprint = rows.map((r) => [r.row, r.outcome, r.classId, r.parents.map((p) => (p.match.kind === "existing" ? p.match.guardianId : p.match.key))]);
  return {
    kind: "students",
    sheet: grid.sheet,
    headerRow: grid.headerRow,
    columns: map.used,
    ignored: map.ignored,
    termId: current.id,
    termLabel: current.label,
    classNames: classes.filter((c) => c.isActive).map((c) => c.name),
    counts,
    rows,
    planHash: sha256(JSON.stringify([current.id, fingerprint])),
  };
}

/** Parents here with these phones, oldest first (AC-7), each with one child's name for the note. */
async function guardiansByPhone(db: Executor, schoolId: string, phones: string[], lock: boolean) {
  const query = db
    .select({ id: guardian.id, fullName: guardian.fullName, phone: guardian.phone })
    .from(guardian)
    .where(and(eq(guardian.schoolId, schoolId), inArray(guardian.phone, phones)))
    .orderBy(asc(guardian.createdAt), asc(guardian.id));
  const parents = lock ? await query.for("share") : await query;
  if (parents.length === 0) return [];
  const children = await db
    .selectDistinctOn([studentGuardian.guardianId], { guardianId: studentGuardian.guardianId, surname: student.surname, otherNames: student.otherNames })
    .from(studentGuardian)
    .innerJoin(student, eq(student.id, studentGuardian.studentId))
    .where(inArray(studentGuardian.guardianId, parents.map((p) => p.id)))
    .orderBy(studentGuardian.guardianId, asc(student.surname), asc(student.otherNames));
  return parents.map((p) => ({ ...p, child: children.find((c) => c.guardianId === p.id) ?? null }));
}

export type SkippedRow = { row: number; outcome: Exclude<StudentOutcome, "add">; name: string; reason: string };
export type CommitResult = { runId: string | null; counts: ImportCounts; skipped: SkippedRow[] };

const BATCH = 500;

async function insertInBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH));
}

/**
 * Saves the import (AC-9) in one transaction: plans again after taking the
 * locks, refuses if the term or any row's outcome changed since the preview,
 * then adds every "will add" row and every ticked "probably here" row with
 * its enrolment and parents, and records the run. All or nothing.
 */
export async function commitStudentImport(
  ctx: SchoolContext,
  input: { grid: Grid; fileName: string; termId: string; planHash: string; addAnyway: number[] },
): Promise<CommitResult> {
  assertTeam(ctx.actor);
  assertWritable(ctx);
  const userId = ctx.userId;
  if (!userId) throw new NotSignedIn();
  try {
    return await ctx.db.transaction(async (tx) => {
      const plan = await planStudentImport({ ...ctx, db: tx }, input.grid, { lock: true });
      if (plan.termId !== input.termId) throw new TermChanged();
      await assertTermsOpen(tx, ctx.schoolId, [plan.termId]);
      if (plan.planHash !== input.planHash) throw new PlanChanged(plan);

      const ticked = new Set(input.addAnyway);
      const saving = plan.rows.filter((r) => r.outcome === "add" || (r.outcome === "probably" && ticked.has(r.row)));
      const skipped: SkippedRow[] = plan.rows
        .filter((r): r is PlannedStudent & { outcome: SkippedRow["outcome"] } => r.outcome !== "add" && !saving.includes(r))
        .map((r) => ({ row: r.row, outcome: r.outcome, name: [r.surname.toUpperCase(), r.otherNames].filter(Boolean).join(" "), reason: r.reasons.join(" ") }));

      // New parents once each, however many children bring them in (AC-7).
      const newParents = new Map<string, { id: string; fullName: string; phone: string }>();
      const linked = new Set<string>();
      for (const r of saving) {
        for (const p of r.parents) {
          if (p.match.kind === "existing") linked.add(p.match.guardianId);
          else if (!newParents.has(p.match.key)) newParents.set(p.match.key, { id: randomUUID(), fullName: p.fullName, phone: p.phone });
        }
      }
      const counts: ImportCounts = {
        added: saving.length,
        alreadyHere: plan.counts.here,
        probablyHereSkipped: plan.counts.probably - saving.filter((r) => r.outcome === "probably").length,
        problems: plan.counts.problems,
        parentsCreated: newParents.size,
        parentsLinked: linked.size,
        formMastersSet: 0,
        needsConfirmSkipped: 0,
      };
      // Nothing to write: no run is recorded (AC-9).
      if (saving.length === 0) return { runId: null, counts, skipped };

      const sectionOf = new Map(
        (await tx.select({ id: schoolClass.id, sectionId: schoolClass.sectionId }).from(schoolClass).where(eq(schoolClass.schoolId, ctx.schoolId))).map((c) => [c.id, c.sectionId]),
      );
      const [run] = await tx
        .insert(importRun)
        .values({ schoolId: ctx.schoolId, kind: "students", fileName: input.fileName, termId: plan.termId, createdBy: userId, counts })
        .returning({ id: importRun.id });

      await insertInBatches([...newParents.values()], (batch) =>
        tx.insert(guardian).values(batch.map((p) => ({ id: p.id, schoolId: ctx.schoolId, fullName: p.fullName, phone: p.phone, importRunId: run.id }))),
      );

      // Last, because it holds the school row lock until the transaction ends.
      const numbers = await allocateStudentNumbers({ ...ctx, db: tx }, { count: saving.length });
      const [{ sessionId }] = await tx.select({ sessionId: term.sessionId }).from(term).where(eq(term.id, plan.termId));
      const students = saving.map((r, i) => ({ id: randomUUID(), row: r, studentNo: numbers[i] }));
      await insertInBatches(students, (batch) =>
        tx.insert(student).values(
          batch.map(({ id, row, studentNo }) => ({
            id,
            schoolId: ctx.schoolId,
            studentNo,
            admissionNo: row.admissionNo,
            surname: row.surname,
            otherNames: row.otherNames,
            gender: row.gender!,
            house: row.house,
            importRunId: run.id,
          })),
        ),
      );
      await insertInBatches(students, (batch) =>
        tx.insert(enrolment).values(
          batch.map(({ id, row }) => ({
            schoolId: ctx.schoolId,
            studentId: id,
            termId: plan.termId,
            sessionId,
            classId: row.classId!,
            sectionId: sectionOf.get(row.classId!)!,
          })),
        ),
      );
      const links = students.flatMap(({ id, row }) =>
        row.parents.map((p) => ({
          schoolId: ctx.schoolId,
          studentId: id,
          guardianId: p.match.kind === "existing" ? p.match.guardianId : newParents.get(p.match.key)!.id,
          relationship: p.relationship,
          isPrimary: p.isPrimary,
        })),
      );
      await insertInBatches(links, (batch) => tx.insert(studentGuardian).values(batch));

      // Belt and braces: every child has at most two parents and exactly one primary.
      const ids = students.map((s) => s.id);
      const broken = await tx
        .select({ studentId: studentGuardian.studentId })
        .from(studentGuardian)
        .where(inArray(studentGuardian.studentId, ids))
        .groupBy(studentGuardian.studentId)
        .having(sql`count(*) > 2 or count(*) filter (where ${studentGuardian.isPrimary}) <> 1`);
      if (broken.length > 0) throw new Error("Import would break the parent rules");

      return { runId: run.id, counts, skipped };
    });
  } catch (error) {
    if (violatedConstraint(error)?.code === "23505") throw new ImportClash();
    throw error;
  }
}
