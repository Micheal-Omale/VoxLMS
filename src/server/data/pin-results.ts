import "server-only";

import { and, eq, type SQL, sql } from "drizzle-orm";

import { db as sharedDb } from "@/db";
import { academicSession, enrolment, resultPin, school, term } from "@/db/schema";
import { buildReportCards, type ReportCardModel, reportCardReadiness } from "@/lib/report-card";
import { isPinShaped, normalizePin, pinCardFileName, pinIpKey } from "@/lib/result-pin";
import { termLabel } from "@/lib/term-label";
import { countPinAttempt, formatWait, pinWait, takeBackPinAttempt } from "@/server/auth/throttle";
import { pinHash, pinKey } from "@/server/result-pin/crypto";

import { type Executor, readSnapshot, schoolContext } from "./context";
import { NoCurrentTerm, NotFound } from "./errors";
import { loadReportCards } from "./report-cards";
import { classReadiness } from "./result-pins";

// The public result page (spec 0014, AC-12 to AC-15). A PIN shows one
// child's released result for one term and nothing else. Every check runs
// again on every request; nothing about what a parent sees is stored.

export type PinRefusal =
  | { reason: "shape" | "unknown" | "replaced" | "withdrawn" | "not_ready" | "unavailable" }
  | { reason: "throttled"; waitSeconds: number }
  | { reason: "unreleased"; schoolName: string; termLabel: string };

/** The words a parent sees for each answer (AC-12), under the field. */
export function pinMessage(refusal: PinRefusal): string {
  switch (refusal.reason) {
    case "shape":
      return "That PIN doesn’t look right. Check the 12 digits on the slip.";
    case "throttled":
      return `Too many wrong PINs from this network. Try again in ${formatWait(refusal.waitSeconds)}.`;
    case "unknown":
      return "We couldn’t find that PIN. Check it against the slip.";
    case "replaced":
      return "This slip has been replaced. Please use the newest slip from the school.";
    case "withdrawn":
      return "There is no result for this PIN. Please ask the school.";
    case "unreleased":
      return `${refusal.schoolName} has not released ${refusal.termLabel} results yet. Please check again when the school says they are out.`;
    case "not_ready":
      return "This class’s results are not ready yet. Please check again later.";
    case "unavailable":
      return "Result checking isn’t available right now. Please try again later.";
  }
}

/** One slip with what the checks after the lookup need (AC-12 steps 4 to 7). */
async function findSlip(db: Executor, where: SQL) {
  const [row] = await db
    .select({
      id: resultPin.id,
      schoolId: resultPin.schoolId,
      replacedAt: resultPin.replacedAt,
      studentId: enrolment.studentId,
      classId: enrolment.classId,
      termId: enrolment.termId,
      withdrawnOn: enrolment.withdrawnOn,
      releasedAt: term.resultsReleasedAt,
      termNumber: term.number,
      sessionName: academicSession.name,
      schoolName: school.name,
    })
    .from(resultPin)
    .innerJoin(enrolment, and(eq(enrolment.schoolId, resultPin.schoolId), eq(enrolment.id, resultPin.enrolmentId)))
    .innerJoin(term, and(eq(term.schoolId, enrolment.schoolId), eq(term.id, enrolment.termId)))
    .innerJoin(academicSession, eq(academicSession.id, term.sessionId))
    .innerJoin(school, eq(school.id, resultPin.schoolId))
    .where(where);
  return row ?? null;
}

type Slip = NonNullable<Awaited<ReturnType<typeof findSlip>>>;

/** Steps 4 to 6: live, enrolled, released. Null when all hold. */
function slipRefusal(slip: Slip): PinRefusal | null {
  if (slip.replacedAt) return { reason: "replaced" };
  if (slip.withdrawnOn) return { reason: "withdrawn" };
  if (!slip.releasedAt) return { reason: "unreleased", schoolName: slip.schoolName, termLabel: termLabel(slip.termNumber, slip.sessionName) };
  return null;
}

const systemFor = (slip: Slip, db: Executor = sharedDb) => schoolContext({ schoolId: slip.schoolId, userId: null, db, actor: { kind: "system" } });

/**
 * Checks a typed PIN (AC-12). Counts the attempt before any lookup and takes
 * it back when the PIN matches a slip (AC-15); records one view at step 8.
 */
export async function checkPin(text: string, rawIp: string | null, db: Executor = sharedDb): Promise<{ ok: true; pinId: string } | ({ ok: false } & PinRefusal)> {
  if (!isPinShaped(text)) return { ok: false, reason: "shape" };
  let key;
  try {
    key = pinKey();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const ip = pinIpKey(rawIp);
  const counts = await countPinAttempt(db, ip);
  const wait = pinWait(counts);
  if (counts.all.count === 20_001) console.error("result PIN sitewide limit passed: every network held to 3 tries per 15 minutes");
  if (wait > 0) {
    console.warn("result PIN throttled", { ip, ipCount: counts.ip.count, dayCount: counts.ipDay.count, allCount: counts.all.count });
    return { ok: false, reason: "throttled", waitSeconds: wait };
  }

  const slip = await findSlip(db, eq(resultPin.pinHash, pinHash(normalizePin(text), key)));
  if (!slip) return { ok: false, reason: "unknown" };
  await takeBackPinAttempt(db, ip);
  const refusal = slipRefusal(slip);
  if (refusal) return { ok: false, ...refusal };
  const readiness = await readSnapshot(systemFor(slip, db), (snap) => classReadiness(snap, { classId: slip.classId, termId: slip.termId }));
  if (!readiness.ready) return { ok: false, reason: "not_ready" };

  // One view, one update, after the checks and outside the result read (AC-13).
  await db
    .update(resultPin)
    .set({ viewCount: sql`${resultPin.viewCount} + 1`, firstViewedAt: sql`coalesce(${resultPin.firstViewedAt}, now())`, lastViewedAt: sql`now()` })
    .where(eq(resultPin.id, slip.id));
  return { ok: true, pinId: slip.id };
}

export type PinResult = { ok: true; card: ReportCardModel; fileName: string } | ({ ok: false } & PinRefusal);

/**
 * The one card a signed slip id shows (AC-13, AC-14), checked again from step
 * 4 on one consistent read. Only the slip id is taken from the request.
 */
export async function loadPinResult(pinId: string, now = new Date(), db: Executor = sharedDb): Promise<PinResult> {
  const first = await findSlip(db, eq(resultPin.id, pinId));
  if (!first) return { ok: false, reason: "unknown" };
  return readSnapshot(systemFor(first, db), async (snap) => {
    const slip = await findSlip(snap.db, and(eq(resultPin.schoolId, first.schoolId), eq(resultPin.id, pinId))!);
    if (!slip) return { ok: false, reason: "unknown" };
    const refusal = slipRefusal(slip);
    if (refusal) return { ok: false, ...refusal };
    let data;
    try {
      data = await loadReportCards(snap, { classId: slip.classId, termId: slip.termId });
    } catch (error) {
      // Results reach back only within the current session (spec 0010).
      if (error instanceof NotFound || error instanceof NoCurrentTerm) return { ok: false, reason: "not_ready" };
      throw error;
    }
    if (!reportCardReadiness({ results: data.results, remarks: data.remarks, hasSigner: data.signer !== null }).ready) return { ok: false, reason: "not_ready" };
    const students = data.results.students.filter((s) => s.studentId === slip.studentId);
    const [card] = buildReportCards({ ...data, results: { ...data.results, students } }, now);
    if (!card) return { ok: false, reason: "withdrawn" };
    const own = students[0];
    return {
      ok: true,
      card,
      fileName: pinCardFileName(data.school.code, own.surname.toLocaleUpperCase("en"), own.otherNames, data.results.term.number, data.results.session.name),
    };
  });
}
