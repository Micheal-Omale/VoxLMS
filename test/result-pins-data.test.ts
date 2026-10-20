import { randomUUID } from "node:crypto";

import { and, eq, isNull, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderPinSlips } from "@/components/pin-slips/render";
import * as t from "@/db/schema";
import { buildReportCards } from "@/lib/report-card";
import { luhnDigit, normalizePin, type PinSlip } from "@/lib/result-pin";
import { getClassResults, getReportCards, NotFound, saveScores, schoolContext } from "@/server/data";
import type { Executor } from "@/server/data/context";
import { NothingToPrint, PinKeyMissing, SlipAlreadyReplaced } from "@/server/data/errors";
import { checkPin, loadPinResult, pinMessage } from "@/server/data/pin-results";
import { getClassSlips, getResultsOnline, makeSlips, type MadeSlips, releaseTerm, type SlipRequest, withdrawRelease } from "@/server/data/result-pins";
import { readResultCookie, signResultCookie } from "@/server/result-pin/crypto";

import { type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0014 data layer against the dev branch. Every test rolls back.

const JSS = "JSS 2 Gold";
const TODAY = new Date("2026-12-05T09:00:00Z");

let a: Fixture;

beforeAll(async () => {
  ({ a } = await setUpSchools());
});
afterAll(async () => {
  await pool.end();
});

const TEAM_USER = "pin-test-team";

async function teamCtx(tx: Executor) {
  await tx
    .insert(t.user)
    .values({ id: TEAM_USER, name: "Ada Team", email: `${TEAM_USER}@users.voxlms.invalid`, role: "admin" })
    .onConflictDoNothing();
  return schoolContext({ schoolId: a.schoolId, userId: TEAM_USER, db: tx, actor: { kind: "admin", readOnly: false } });
}

const keep = async (made: MadeSlips) => made;

async function print(tx: Executor, request: SlipRequest = { do: "class", classId: a.cls(JSS).id, termId: a.term(1).id }) {
  return makeSlips(await teamCtx(tx), request, "voxlms.test", keep);
}

/** Fills every missing score of JSS 2 Gold this term so the class is ready. */
async function fillClass(tx: Executor) {
  const ctx = await teamCtx(tx);
  const results = await getClassResults(ctx, { classId: a.cls(JSS).id });
  const keyOf = new Map(results.split.map((p) => [p.label, p]));
  for (const subject of results.subjects) {
    const changes = results.students.flatMap((s, si) => {
      const line = s.subjects.find((l) => l.classSubjectId === subject.classSubjectId);
      return (line?.missing ?? []).map((label) => {
        const part = keyOf.get(label)!;
        return { studentId: s.studentId, componentKey: part.key, expected: null, value: String(Math.floor(part.max * (0.4 + (si % 10) / 20))) };
      });
    });
    if (changes.length > 0) await saveScores(ctx, { termId: a.term(1).id, classSubjectId: subject.classSubjectId, saveId: randomUUID(), changes });
  }
}

const ipCount = async (tx: Executor, ip: string) => {
  const [row] = await tx.select().from(t.signInThrottle).where(eq(t.signInThrottle.key, `pin_ip:${ip}`));
  return row?.failures ?? 0;
};

describe("printing slips (AC-5, AC-6, AC-9)", () => {
  it("makes one slip per open enrolment in register order, keeps only the hash, and refuses a second print", async () => {
    await inRollback(async (tx) => {
      const made = await print(tx);
      const results = await getClassResults(await teamCtx(tx), { classId: a.cls(JSS).id });
      expect(made.slips).toHaveLength(results.students.length);
      expect(made.fileName).toMatch(/^TSA JSS 2 Gold First Term .+ PIN slips\.pdf$/);
      expect(made.slips[0].pin).toMatch(/^TSA \d{4} \d{4}$/);
      expect(made.slips[0].serial).toMatch(/^Serial TSA \d{6}$/);
      const rows = await tx.select().from(t.resultPin).where(eq(t.resultPin.runId, made.runId));
      expect(new Set(rows.map((r) => r.serial)).size).toBe(rows.length);
      for (const r of rows) expect(r.pinHash.toString("hex")).not.toContain(normalizePin(made.slips[0].pin));
      await expect(print(tx)).rejects.toThrow(NothingToPrint);

      const online = await getResultsOnline(await teamCtx(tx), {});
      const row = online.classes.find((c) => c.id === a.cls(JSS).id)!;
      expect(row).toMatchObject({ live: results.students.length, withoutSlip: 0, checked: 0 });
    });
  });

  it("rolls the slips back when the render fails (no PIN outlives its file)", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const request = { do: "class", classId: a.cls(JSS).id, termId: a.term(1).id } as const;
      await expect(
        makeSlips(ctx, request, "voxlms.test", async () => {
          throw new Error("render failed");
        }),
      ).rejects.toThrow("render failed");
      expect(await tx.select().from(t.resultPinRun).where(eq(t.resultPinRun.classId, a.cls(JSS).id))).toHaveLength(0);
    });
  });

  it("keeps teachers out (AC-18)", async () => {
    await inRollback(async (tx) => {
      const [member] = await tx.select().from(t.staff).where(eq(t.staff.schoolId, a.schoolId)).limit(1);
      const teacher = schoolContext({ schoolId: a.schoolId, userId: "teacher", db: tx, actor: { kind: "teacher", staffId: member.id, readOnly: false } });
      await expect(getResultsOnline(teacher, {})).rejects.toThrow(NotFound);
      await expect(makeSlips(teacher, { do: "class", classId: a.cls(JSS).id, termId: a.term(1).id }, "x", keep)).rejects.toThrow(NotFound);
    });
  });
});

describe("checking a PIN (AC-12 to AC-15)", () => {
  it("answers each case in order, counting only unknown PINs", async () => {
    await inRollback(async (tx) => {
      const ip = `10.9.${Math.floor(Math.random() * 250)}.1`;
      const made = await print(tx);
      const pin = normalizePin(made.slips[0].pin);

      expect(await checkPin("1234", ip, tx)).toMatchObject({ ok: false, reason: "shape" });
      expect(await ipCount(tx, ip)).toBe(0);
      expect(await checkPin(pin, ip, tx)).toMatchObject({ ok: false, reason: "unreleased", schoolName: "Test School A" });
      expect(await checkPin(pin, ip, tx)).toMatchObject({ ok: false, reason: "unreleased" });
      expect(await ipCount(tx, ip)).toBe(0);

      const code = pin.slice(0, 3);
      const digits = pin.slice(3);
      const diff7 = digits.slice(0, 6) + String((Number(digits[6]) + 1) % 10);
      const unknown = code + diff7 + luhnDigit(diff7);
      expect(await checkPin(unknown, ip, tx)).toMatchObject({ ok: false, reason: "unknown" });
      expect(await ipCount(tx, ip)).toBe(1);

      await releaseTerm(await teamCtx(tx), { termId: a.term(1).id });
      expect(await checkPin(pin, ip, tx)).toMatchObject({ ok: false, reason: "not_ready" });
      await withdrawRelease(await teamCtx(tx), { termId: a.term(1).id });
      await fillClass(tx);
      await releaseTerm(await teamCtx(tx), { termId: a.term(1).id });
      const ok = await checkPin(pin, ip, tx);
      expect(ok).toMatchObject({ ok: true });
      expect(await ipCount(tx, ip)).toBe(1);
      const [slip] = await tx.select().from(t.resultPin).where(eq(t.resultPin.pinHash, (await tx.select().from(t.resultPin).where(eq(t.resultPin.id, ok.ok ? ok.pinId : "")))[0].pinHash));
      expect(slip.viewCount).toBe(1);
      expect(slip.firstViewedAt).not.toBeNull();

      // The result is exactly that student's card from the class read (AC-13).
      const result = await loadPinResult(slip.id, TODAY, tx);
      if (!result.ok) throw new Error(`expected a result, got ${result.reason}`);
      const cards = buildReportCards(await getReportCards(await teamCtx(tx), { classId: a.cls(JSS).id }), TODAY);
      expect(cards).toContainEqual(result.card);
      expect(result.fileName).toMatch(/^TSA .+ First Term .+ report card\.pdf$/);
      expect(readResultCookie(signResultCookie(slip.id, Math.floor(Date.now() / 1000) + 1800))).toEqual({ pinId: slip.id });

      // Withdrawing the release closes an open result at once (AC-3).
      await withdrawRelease(await teamCtx(tx), { termId: a.term(1).id });
      expect(await loadPinResult(slip.id, TODAY, tx)).toMatchObject({ ok: false, reason: "unreleased" });
      await releaseTerm(await teamCtx(tx), { termId: a.term(1).id });

      // A withdrawn student's slip answers "no result".
      await tx.update(t.enrolment).set({ withdrawnOn: "2026-11-01" }).where(eq(t.enrolment.id, slip.enrolmentId));
      expect(await checkPin(pin, ip, tx)).toMatchObject({ ok: false, reason: "withdrawn" });
    });
  }, 300_000);

  it("slows the 11th wrong PIN in 15 minutes, even for a correct PIN after it", async () => {
    await inRollback(async (tx) => {
      const ip = `10.8.${Math.floor(Math.random() * 250)}.2`;
      const made = await print(tx);
      const wrong = "TSA00000000"; // Luhn valid, never made by chance in this test.
      for (let i = 0; i < 10; i++) expect(await checkPin(wrong, ip, tx)).toMatchObject({ reason: "unknown" });
      const slowed = await checkPin(normalizePin(made.slips[0].pin), ip, tx);
      expect(slowed).toMatchObject({ ok: false, reason: "throttled" });
      if (!slowed.ok && slowed.reason === "throttled") expect(slowed.waitSeconds).toBeGreaterThan(14 * 60);
      expect(await checkPin(wrong, "10.7.7.7", tx)).toMatchObject({ reason: "unknown" });
      // The IPv6 neighbour in the same /64 shares a count.
      for (let i = 0; i < 11; i++) await checkPin(wrong, "2001:db8:aa:1::1", tx);
      expect(await checkPin(wrong, "2001:db8:aa:1::ffff", tx)).toMatchObject({ reason: "throttled" });
      await tx.delete(t.signInThrottle).where(like(t.signInThrottle.key, "pin%"));
    });
  }, 300_000);
});

describe("lost slips (AC-10, AC-11)", () => {
  it("replaces one slip, refuses a replaced one, and remakes only live slips", async () => {
    await inRollback(async (tx) => {
      const made = await print(tx);
      const [first] = await tx.select().from(t.resultPin).where(eq(t.resultPin.runId, made.runId)).orderBy(t.resultPin.serial);
      const replaced = await print(tx, { do: "replace", pinId: first.id });
      expect(replaced.kind).toBe("replace");
      expect(replaced.slips).toHaveLength(1);
      expect(await checkPin(normalizePin(made.slips[0].pin), "10.6.6.6", tx)).toMatchObject({ reason: "replaced" });
      await expect(print(tx, { do: "replace", pinId: first.id })).rejects.toThrow(SlipAlreadyReplaced);

      const remade = await print(tx, { do: "remake", runId: made.runId });
      expect(remade.slips).toHaveLength(made.slips.length - 1);
      await expect(print(tx, { do: "remake", runId: made.runId })).rejects.toThrow("Every slip from this print has been replaced.");

      const live = await tx
        .select({ enrolmentId: t.resultPin.enrolmentId })
        .from(t.resultPin)
        .where(and(eq(t.resultPin.schoolId, a.schoolId), isNull(t.resultPin.replacedAt)));
      expect(new Set(live.map((l) => l.enrolmentId)).size).toBe(live.length);

      const page = await getClassSlips(await teamCtx(tx), { classId: a.cls(JSS).id });
      // One transaction gives every run the same time, so compare without order.
      expect(page.runs.map((r) => r.slipCount).sort((x, y) => x - y)).toEqual([1, remade.slips.length, made.slips.length].sort((x, y) => x - y));
      expect(page.students.every((s) => s.slip !== null)).toBe(true);
    });
  });
});

describe("the slip PDF (AC-8)", () => {
  const slip = (i: number): PinSlip => ({
    school: "Government Secondary School Comprehensive Model College of Science and Technology, Ikot Ekpene Road",
    heading: "Result PIN · First Term, 2026/2027",
    student: `OKONKWO-ADEBAYO Chukwuemeka Oluwaseun Babatunde Ifeanyichukwu ${i} · JSS 2 Gold`,
    pin: "4821 0937 5512",
    serial: `Serial TSA ${String(i).padStart(6, "0")}`,
    checkAt: "Check the result at voxlms.com/result",
  });

  it("puts 10 slips on a page: 45 slips give 5 pages, 1 slip gives 1", async () => {
    const many = await renderPinSlips(Array.from({ length: 45 }, (_, i) => slip(i)), "test");
    expect(many).toMatchObject({ pages: 5, fits: true });
    expect(many.pdf.length).toBeLessThan(500 * 1024);
    expect(await renderPinSlips([slip(1)], "test")).toMatchObject({ pages: 1, fits: true });
  });
});

describe("results day guards (AC-7, AC-8, AC-20)", () => {
  it("never leaks a plain PIN into DB, cookie, card model or lookup results (AC-7, AC-16)", async () => {
    await inRollback(async (tx) => {
      const made = await print(tx);
      const plainPin = normalizePin(made.slips[0].pin);
      const rows = await tx.select().from(t.resultPin).where(eq(t.resultPin.runId, made.runId));
      for (const r of rows) {
        expect(r.pinHash.toString("hex")).not.toContain(plainPin);
        expect(JSON.stringify(r)).not.toContain(plainPin);
      }
      const cookie = signResultCookie(rows[0].id, Math.floor(Date.now() / 1000) + 1800);
      expect(cookie).not.toContain(plainPin);

      await fillClass(tx);
      await releaseTerm(await teamCtx(tx), { termId: a.term(1).id });
      const res = await checkPin(plainPin, "10.1.2.3", tx);
      expect(JSON.stringify(res)).not.toContain(plainPin);

      const result = await loadPinResult(rows[0].id, TODAY, tx);
      expect(JSON.stringify(result)).not.toContain(plainPin);
    });
  }, 300_000);

  it("refuses printing with PinKeyMissing and answers unavailable on /result when key is missing (AC-20)", async () => {
    await inRollback(async (tx) => {
      const saved = process.env.RESULT_PIN_SECRET;
      try {
        delete process.env.RESULT_PIN_SECRET;
        await expect(print(tx)).rejects.toThrow(PinKeyMissing);
        const check = await checkPin("TSA00000000", "10.1.2.3", tx);
        expect(check).toEqual({ ok: false, reason: "unavailable" });
        if (!check.ok) {
          expect(pinMessage(check)).toBe("Result checking isn’t available right now. Please try again later.");
        }
      } finally {
        process.env.RESULT_PIN_SECRET = saved;
      }
    });
  });

  it("rolls back slips when page count overflows (AC-8)", async () => {
    await inRollback(async (tx) => {
      const ctx = await teamCtx(tx);
      const request = { do: "class", classId: a.cls(JSS).id, termId: a.term(1).id } as const;
      await expect(
        makeSlips(ctx, request, "voxlms.test", async () => {
          throw new Error("WrongPageCount");
        }),
      ).rejects.toThrow("WrongPageCount");
      const runs = await tx.select().from(t.resultPinRun).where(eq(t.resultPinRun.classId, a.cls(JSS).id));
      expect(runs).toHaveLength(0);
    });
  });
});

