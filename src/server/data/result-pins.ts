import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { academicSession, enrolment, resultPin, resultPinRun, school, schoolClass, student, term, user } from "@/db/schema";
import { byRegister, cardName, reportCardReadiness } from "@/lib/report-card";
import { formatSerial, groupPin, makePin, normalizePin, type PinSlip, slipFileName } from "@/lib/result-pin";
import { termLabel } from "@/lib/term-label";
import { pinHash, pinKey } from "@/server/result-pin/crypto";

import { assertNotTeacher, assertWritable } from "./access";
import { type Executor, readSnapshot, type SchoolContext } from "./context";
import { NoCurrentTerm, NothingToPrint, NotFound, NotSignedIn, SlipAlreadyReplaced } from "./errors";
import { loadClassRemarks } from "./remarks";
import { loadClassResults } from "./results";
import type { FormResult } from "./team";

// Result PIN slips and the term release (spec 0014). Our team only. The plain
// PINs exist only between making them here and the slip PDF the route sends.

const LAGOS_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Africa/Lagos",
});

/** "5 December 2026 at 14:02" (Lagos time). */
export const lagosDateTime = (d: Date) => {
  const parts = Object.fromEntries(LAGOS_TIME.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month} ${parts.year} at ${parts.hour}:${parts.minute}`;
};

function assertTeamWriter(ctx: SchoolContext): string {
  assertNotTeacher(ctx, "Results online");
  assertWritable(ctx);
  if (!ctx.userId) throw new NotSignedIn();
  return ctx.userId;
}

/** The current term and every earlier term of the school, newest first (AC-1). */
async function listReleasableTerms(ctx: SchoolContext) {
  const current = await ctx.db
    .select({ startsOn: term.startsOn })
    .from(term)
    .where(and(eq(term.schoolId, ctx.schoolId), eq(term.isCurrent, true)));
  if (!current[0]) throw new NoCurrentTerm();
  const rows = await ctx.db
    .select({
      id: term.id,
      number: term.number,
      isCurrent: term.isCurrent,
      sessionName: academicSession.name,
      releasedAt: term.resultsReleasedAt,
      releasedBy: user.name,
    })
    .from(term)
    .innerJoin(academicSession, eq(academicSession.id, term.sessionId))
    .leftJoin(user, eq(user.id, term.resultsReleasedBy))
    .where(and(eq(term.schoolId, ctx.schoolId), lte(term.startsOn, current[0].startsOn)))
    .orderBy(desc(term.startsOn));
  return rows.map((r) => ({ ...r, label: termLabel(r.number, r.sessionName) }));
}

/**
 * Whether a class's results can show to parents, with the reason in plain
 * words when not (AC-2, AC-12 step 7). The same check the report card PDF makes.
 */
export async function classReadiness(ctx: SchoolContext, input: { classId: string; termId: string }): Promise<{ ready: true } | { ready: false; reason: string }> {
  let results;
  try {
    results = await loadClassResults(ctx, input);
  } catch (error) {
    // Results reach back only within the current session (spec 0010).
    if (error instanceof NotFound) return { ready: false, reason: "results from an earlier session can't be shown yet" };
    throw error;
  }
  const remarks = await loadClassRemarks(ctx, { classId: input.classId, termId: results.term.id, results });
  const readiness = reportCardReadiness({ results, remarks, hasSigner: remarks.hasSigner });
  if (readiness.ready) return { ready: true };
  const r = readiness.reason;
  if (r.kind === "incomplete") {
    const n = r.students.length + r.more;
    return { ready: false, reason: `${n} ${n === 1 ? "student" : "students"} missing scores` };
  }
  const words = { no_split: "no score split", no_students: "no students", no_subjects: "no subjects", no_signer: "no principal’s name" };
  return { ready: false, reason: words[r.kind] };
}

/** The Results online page (AC-1, AC-2, AC-5), from one consistent read. */
export async function getResultsOnline(ctx: SchoolContext, input: { termId?: string }) {
  assertNotTeacher(ctx, "Results online");
  return readSnapshot(ctx, async (snap) => {
    const terms = await listReleasableTerms(snap);
    const chosen = input.termId ? terms.find((t) => t.id === input.termId) : terms.find((t) => t.isCurrent);
    if (!chosen) throw new NotFound("Term");

    const open = and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.termId, chosen.id), isNull(enrolment.withdrawnOn));
    const [classes, slips] = await Promise.all([
      snap.db
        .select({ id: schoolClass.id, name: schoolClass.name, students: count() })
        .from(enrolment)
        .innerJoin(schoolClass, eq(schoolClass.id, enrolment.classId))
        .where(open)
        .groupBy(schoolClass.id, schoolClass.name, schoolClass.sortOrder)
        .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)),
      snap.db
        .select({
          classId: enrolment.classId,
          live: count(),
          checked: sql<number>`count(*) filter (where ${resultPin.viewCount} > 0)`.mapWith(Number),
        })
        .from(resultPin)
        .innerJoin(enrolment, eq(enrolment.id, resultPin.enrolmentId))
        .where(and(open, isNull(resultPin.replacedAt)))
        .groupBy(enrolment.classId),
    ]);

    const rows = [];
    for (const c of classes) {
      const s = slips.find((x) => x.classId === c.id);
      const live = s?.live ?? 0;
      rows.push({
        ...c,
        live,
        checked: s?.checked ?? 0,
        withoutSlip: c.students - live,
        readiness: await classReadiness(snap, { classId: c.id, termId: chosen.id }),
      });
    }
    return {
      terms: terms.map((t) => ({ id: t.id, label: t.label, isCurrent: t.isCurrent })),
      term: chosen,
      released: chosen.releasedAt ? { at: lagosDateTime(chosen.releasedAt), by: chosen.releasedBy ?? "our team" } : null,
      classes: rows,
    };
  });
}

export type ResultsOnline = Awaited<ReturnType<typeof getResultsOnline>>;

/** Checks the term is the current term or an earlier one, taking its row `FOR UPDATE` unless `lock` is false. */
async function lockReleasableTerm(tx: Executor, ctx: SchoolContext, termId: string, lock = true) {
  const [current] = await tx
    .select({ startsOn: term.startsOn })
    .from(term)
    .where(and(eq(term.schoolId, ctx.schoolId), eq(term.isCurrent, true)));
  const query = tx
    .select({ id: term.id, startsOn: term.startsOn, number: term.number, releasedAt: term.resultsReleasedAt })
    .from(term)
    .where(and(eq(term.schoolId, ctx.schoolId), eq(term.id, termId)));
  const [row] = lock ? await query.for("update") : await query;
  if (!current || !row || row.startsOn > current.startsOn) throw new NotFound("Term");
  return row;
}

/** Releases a term to parents (AC-2). Releasing a released term changes nothing. */
export async function releaseTerm(ctx: SchoolContext, input: { termId: string }): Promise<FormResult> {
  const by = assertTeamWriter(ctx);
  await ctx.db.transaction(async (tx) => {
    const row = await lockReleasableTerm(tx, ctx, input.termId);
    if (row.releasedAt) return;
    await tx.update(term).set({ resultsReleasedAt: sql`now()`, resultsReleasedBy: by }).where(eq(term.id, row.id));
    console.info("results released", { schoolId: ctx.schoolId, termId: row.id, by });
  });
  return { ok: true };
}

/** Withdraws a release (AC-3). Slips are not touched. Withdrawing an unreleased term changes nothing. */
export async function withdrawRelease(ctx: SchoolContext, input: { termId: string }): Promise<FormResult> {
  const by = assertTeamWriter(ctx);
  await ctx.db.transaction(async (tx) => {
    const row = await lockReleasableTerm(tx, ctx, input.termId);
    if (!row.releasedAt) return;
    await tx.update(term).set({ resultsReleasedAt: null, resultsReleasedBy: null }).where(eq(term.id, row.id));
    console.info("results release withdrawn", { schoolId: ctx.schoolId, termId: row.id, by });
  });
  return { ok: true };
}

/** Reserves `n` serials in one short statement; returns the first (AC-9). */
export async function reserveSerials(db: Executor, schoolId: string, n: number) {
  const [row] = await db
    .update(school)
    .set({ pinSerialCounter: sql`${school.pinSerialCounter} + ${n}` })
    .where(eq(school.id, schoolId))
    .returning({ last: school.pinSerialCounter });
  if (!row) throw new NotFound("School");
  return row.last - n + 1;
}

export type SlipRequest =
  | { do: "class"; classId: string; termId: string }
  | { do: "one"; enrolmentId: string }
  | { do: "replace"; pinId: string }
  | { do: "remake"; runId: string };

type Target = { enrolmentId: string; surname: string; otherNames: string; studentNo: number; oldPinId: string | null };

type Plan = { classId: string; termId: string; kind: "class" | "replace" | "remake" };

const targetColumns = {
  enrolmentId: enrolment.id,
  surname: student.surname,
  otherNames: student.otherNames,
  studentNo: student.studentNo,
};

/** Who gets a slip, read again inside the print transaction (AC-6, AC-11). */
async function findTargets(db: Executor, ctx: SchoolContext, request: SlipRequest): Promise<{ plan: Plan; targets: Target[] }> {
  const live = (enrolmentIds: string[]) =>
    enrolmentIds.length === 0
      ? Promise.resolve([] as { enrolmentId: string }[])
      : db
          .select({ enrolmentId: resultPin.enrolmentId })
          .from(resultPin)
          .where(and(inArray(resultPin.enrolmentId, enrolmentIds), isNull(resultPin.replacedAt)));

  if (request.do === "class" || request.do === "one") {
    const where =
      request.do === "class"
        ? and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.classId, request.classId), eq(enrolment.termId, request.termId))
        : and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.id, request.enrolmentId));
    const rows = await db
      .select({ ...targetColumns, classId: enrolment.classId, termId: enrolment.termId })
      .from(enrolment)
      .innerJoin(student, eq(student.id, enrolment.studentId))
      .where(and(where, isNull(enrolment.withdrawnOn)));
    if (request.do === "one" && rows.length === 0) throw new NotFound("Student");
    if (request.do === "class") {
      const [found] = await db
        .select({ id: schoolClass.id })
        .from(schoolClass)
        .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, request.classId)));
      if (!found) throw new NotFound("Class");
      await lockReleasableTerm(db, ctx, request.termId, false);
    }
    const has = new Set((await live(rows.map((r) => r.enrolmentId))).map((r) => r.enrolmentId));
    const targets = rows.filter((r) => !has.has(r.enrolmentId)).map((r) => ({ ...r, oldPinId: null }));
    const plan = request.do === "class" ? { classId: request.classId, termId: request.termId, kind: "class" as const } : { classId: rows[0].classId, termId: rows[0].termId, kind: "class" as const };
    if (targets.length === 0) throw new NothingToPrint(request.do === "one" ? "This student already has a slip." : "Every student has a slip.");
    return { plan, targets };
  }

  const pinRows = await db
    .select({ ...targetColumns, oldPinId: resultPin.id, replacedAt: resultPin.replacedAt, classId: enrolment.classId, termId: enrolment.termId })
    .from(resultPin)
    .innerJoin(enrolment, eq(enrolment.id, resultPin.enrolmentId))
    .innerJoin(student, eq(student.id, enrolment.studentId))
    .where(
      and(
        eq(resultPin.schoolId, ctx.schoolId),
        request.do === "replace" ? eq(resultPin.id, request.pinId) : eq(resultPin.runId, request.runId),
      ),
    )
    .for("update", { of: resultPin });
  if (pinRows.length === 0) throw new NotFound(request.do === "replace" ? "Slip" : "Print run");
  const targets = pinRows.filter((r) => r.replacedAt === null);
  if (request.do === "replace" && targets.length === 0) throw new SlipAlreadyReplaced();
  if (targets.length === 0) throw new NothingToPrint("Every slip from this print has been replaced.");
  return { plan: { classId: pinRows[0].classId, termId: pinRows[0].termId, kind: request.do }, targets };
}

/** A plain count of who would get a slip, read before the print transaction to size the serials. */
async function countTargets(ctx: SchoolContext, request: SlipRequest) {
  return (await findTargets(ctx.db, ctx, request)).targets.length;
}

export type MadeSlips = { fileName: string; slips: PinSlip[]; runId: string; kind: Plan["kind"]; classId: string; termId: string };

/** Distinct new PINs whose hashes are not in the database yet (AC-7). */
async function freshPins(tx: Executor, n: number, key: Buffer, schoolCode: string) {
  const made = new Map<string, Buffer>();
  while (made.size < n) {
    const batch = Array.from({ length: n - made.size }, () => makePin(schoolCode, randomBytes));
    const hashes = batch.map((pin) => pinHash(normalizePin(pin), key));
    const taken = await tx.select({ hash: resultPin.pinHash }).from(resultPin).where(inArray(resultPin.pinHash, hashes));
    const takenHex = new Set(taken.map((t) => Buffer.from(t.hash).toString("hex")));
    batch.forEach((pin, i) => {
      if (!takenHex.has(hashes[i].toString("hex")) && !made.has(pin)) made.set(pin, hashes[i]);
    });
  }
  return [...made.entries()];
}

/**
 * Makes slips and hands them to `render` inside one transaction (AC-6, AC-11,
 * slip route steps 3 to 5). `render` must throw when the PDF is wrong, so no
 * PIN outlives a file that was never made.
 */
export async function makeSlips<T>(ctx: SchoolContext, request: SlipRequest, host: string, render: (made: MadeSlips) => Promise<T>): Promise<T> {
  const by = assertTeamWriter(ctx);
  const key = pinKey();
  const expected = await countTargets(ctx, request);
  let next = await reserveSerials(ctx.db, ctx.schoolId, expected);
  let reserved = expected;

  return ctx.db.transaction(async (tx) => {
    // Two prints of one class run one after the other; no enrolment or school row is held.
    const { plan: first } = await findTargets(tx, ctx, request);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pins:${first.classId}:${first.termId}`}, 0))`);
    const { plan, targets } = await findTargets(tx, ctx, request);
    targets.sort(byRegister);
    if (targets.length > reserved) {
      next = await reserveSerials(ctx.db, ctx.schoolId, targets.length);
      reserved = targets.length;
    }

    const [info] = await tx
      .select({ schoolName: school.name, code: school.code, className: schoolClass.name, termNumber: term.number, sessionName: academicSession.name })
      .from(school)
      .innerJoin(schoolClass, and(eq(schoolClass.schoolId, school.id), eq(schoolClass.id, plan.classId)))
      .innerJoin(term, and(eq(term.schoolId, school.id), eq(term.id, plan.termId)))
      .innerJoin(academicSession, eq(academicSession.id, term.sessionId))
      .where(eq(school.id, ctx.schoolId));
    if (!info) throw new NotFound("Class");

    const replacing = targets.map((t) => t.oldPinId).filter((v): v is string => v !== null);
    if (replacing.length > 0) {
      await tx.update(resultPin).set({ replacedAt: sql`now()`, replacedBy: by }).where(and(inArray(resultPin.id, replacing), isNull(resultPin.replacedAt)));
    }
    const [run] = await tx
      .insert(resultPinRun)
      .values({ schoolId: ctx.schoolId, termId: plan.termId, classId: plan.classId, kind: plan.kind, slipCount: targets.length, createdBy: by })
      .returning({ id: resultPinRun.id });
    const pins = await freshPins(tx, targets.length, key, info.code);
    await tx.insert(resultPin).values(
      targets.map((t, i) => ({
        schoolId: ctx.schoolId,
        enrolmentId: t.enrolmentId,
        runId: run.id,
        serial: next + i,
        pinHash: pins[i][1],
        createdBy: by,
      })),
    );

    const label = termLabel(info.termNumber, info.sessionName);
    const slips = targets.map(
      (t, i): PinSlip => ({
        school: info.schoolName,
        heading: `Result PIN · ${label}`,
        student: `${cardName(t)} · ${info.className}`,
        pin: groupPin(pins[i][0]),
        serial: `Serial ${formatSerial(info.code, next + i)}`,
        checkAt: `Check the result at ${host}/result`,
      }),
    );
    const out = await render({
      fileName: slipFileName(info.code, info.className, info.termNumber, info.sessionName),
      slips,
      runId: run.id,
      kind: plan.kind,
      classId: plan.classId,
      termId: plan.termId,
    });
    console.info("PIN slips made", { schoolId: ctx.schoolId, termId: plan.termId, classId: plan.classId, kind: plan.kind, count: slips.length, by });
    return out;
  });
}

/** One class's slips for a term (AC-10): every open enrolment, then the print runs, newest first. */
export async function getClassSlips(ctx: SchoolContext, input: { classId: string; termId?: string }) {
  assertNotTeacher(ctx, "Results online");
  return readSnapshot(ctx, async (snap) => {
    const terms = await listReleasableTerms(snap);
    const chosen = input.termId ? terms.find((t) => t.id === input.termId) : terms.find((t) => t.isCurrent);
    if (!chosen) throw new NotFound("Term");
    const [cls] = await snap.db
      .select({ id: schoolClass.id, name: schoolClass.name })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, input.classId)));
    if (!cls) throw new NotFound("Class");

    const [students, pins, runs] = await Promise.all([
      snap.db
        .select({ enrolmentId: enrolment.id, surname: student.surname, otherNames: student.otherNames, studentNo: student.studentNo })
        .from(enrolment)
        .innerJoin(student, eq(student.id, enrolment.studentId))
        .where(and(eq(enrolment.schoolId, ctx.schoolId), eq(enrolment.classId, cls.id), eq(enrolment.termId, chosen.id), isNull(enrolment.withdrawnOn))),
      snap.db
        .select({
          id: resultPin.id,
          enrolmentId: resultPin.enrolmentId,
          runId: resultPin.runId,
          serial: resultPin.serial,
          createdAt: resultPin.createdAt,
          replacedAt: resultPin.replacedAt,
          firstViewedAt: resultPin.firstViewedAt,
          lastViewedAt: resultPin.lastViewedAt,
          viewCount: resultPin.viewCount,
        })
        .from(resultPin)
        .innerJoin(resultPinRun, eq(resultPinRun.id, resultPin.runId))
        .where(and(eq(resultPin.schoolId, ctx.schoolId), eq(resultPinRun.classId, cls.id), eq(resultPinRun.termId, chosen.id)))
        .orderBy(desc(resultPin.createdAt)),
      snap.db
        .select({ id: resultPinRun.id, createdAt: resultPinRun.createdAt, slipCount: resultPinRun.slipCount, by: user.name })
        .from(resultPinRun)
        .innerJoin(user, eq(user.id, resultPinRun.createdBy))
        .where(and(eq(resultPinRun.schoolId, ctx.schoolId), eq(resultPinRun.classId, cls.id), eq(resultPinRun.termId, chosen.id)))
        .orderBy(desc(resultPinRun.createdAt)),
    ]);
    const [{ code }] = await snap.db.select({ code: school.code }).from(school).where(eq(school.id, ctx.schoolId));

    return {
      term: { id: chosen.id, label: chosen.label },
      cls,
      students: students.sort(byRegister).map((s) => {
        const mine = pins.filter((p) => p.enrolmentId === s.enrolmentId);
        const liveSlip = mine.find((p) => p.replacedAt === null) ?? null;
        return {
          enrolmentId: s.enrolmentId,
          name: cardName(s),
          slip: liveSlip && {
            id: liveSlip.id,
            serial: formatSerial(code, liveSlip.serial),
            madeOn: lagosDateTime(liveSlip.createdAt),
            firstChecked: liveSlip.firstViewedAt && lagosDateTime(liveSlip.firstViewedAt),
            lastChecked: liveSlip.lastViewedAt && lagosDateTime(liveSlip.lastViewedAt),
            timesChecked: liveSlip.viewCount,
          },
          replaced: mine.filter((p) => p.replacedAt !== null).length,
        };
      }),
      runs: runs.map((r) => {
        const mine = pins.filter((p) => p.runId === r.id);
        return {
          id: r.id,
          when: lagosDateTime(r.createdAt).replace(" at ", ", "),
          by: r.by,
          slipCount: r.slipCount,
          checked: mine.filter((p) => p.viewCount > 0).length,
          live: mine.filter((p) => p.replacedAt === null).length,
          liveChecked: mine.filter((p) => p.replacedAt === null && p.viewCount > 0).length,
        };
      }),
    };
  });
}

export type ClassSlips = Awaited<ReturnType<typeof getClassSlips>>;
