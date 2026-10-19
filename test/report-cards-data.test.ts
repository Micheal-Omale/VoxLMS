import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/[school]/classes/[classId]/report-cards/route";
import { countPdfPages } from "@/components/report-card/render";
import * as t from "@/db/schema";
import { buildReportCards, reportCardReadiness } from "@/lib/report-card";
import { formatHundredths, formatTenths, ordinal } from "@/lib/results";
import { getViewer, schoolContextFor } from "@/server/auth/viewer";
import { type Actor, getClassRemarks, getClassResults, getReportCards, NotFound, saveScores, schoolContext } from "@/server/data";
import type { Executor, SchoolContext } from "@/server/data/context";

import { type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0012 data layer and download route, against the dev branch. The
// sign in helpers are mocked (their rules are covered by the login tests), so
// the route runs inside a rolled back transaction. Every test rolls back.

vi.mock("@/server/auth/viewer", () => ({ getViewer: vi.fn(), schoolContextFor: vi.fn() }));
const viewer = vi.mocked(getViewer);
const resolve = vi.mocked(schoolContextFor);

const JSS = "JSS 2 Gold";
const SS = "SS 1 Science";
const TODAY = new Date("2026-10-18T09:00:00Z");

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  ({ a, b } = await setUpSchools());
});
afterAll(async () => {
  await pool.end();
});

const team: Actor = { kind: "admin", readOnly: false };
const teamCtx = (tx: Executor) => schoolContext({ schoolId: a.schoolId, userId: "team", db: tx, actor: team });

async function teacher(tx: Executor, fullName: string, readOnly = false) {
  const [member] = await tx.select().from(t.staff).where(and(eq(t.staff.schoolId, a.schoolId), eq(t.staff.fullName, fullName)));
  return schoolContext({ schoolId: a.schoolId, userId: "teacher", db: tx, actor: { kind: "teacher", staffId: member.id, readOnly } });
}

/** Fills every missing score of JSS 2 Gold this term, varied so positions differ. */
async function fillClass(tx: Executor) {
  const results = await getClassResults(teamCtx(tx), { classId: a.cls(JSS).id });
  const keyOf = new Map(results.split.map((p) => [p.label, p]));
  for (const subject of results.subjects) {
    const changes = results.students.flatMap((s, si) => {
      const line = s.subjects.find((l) => l.classSubjectId === subject.classSubjectId);
      return (line?.missing ?? []).map((label) => {
        const part = keyOf.get(label)!;
        return { studentId: s.studentId, componentKey: part.key, expected: null, value: String(Math.floor(part.max * (0.35 + ((si * 7 + subject.name.length) % 12) / 20))) };
      });
    });
    if (changes.length > 0) await saveScores(teamCtx(tx), { termId: a.term(1).id, classSubjectId: subject.classSubjectId, saveId: randomUUID(), changes });
  }
}

const classId = () => a.cls(JSS).id;

describe("loadReportCards (AC-11)", () => {
  it("gives every card the same figures and comments as the Remarks read, in register order", async () => {
    await inRollback(async (tx) => {
      await fillClass(tx);
      const data = await getReportCards(teamCtx(tx), { classId: classId() });
      const { results, remarks } = await getClassRemarks(teamCtx(tx), { classId: classId() });
      expect(reportCardReadiness({ results: data.results, remarks: data.remarks, hasSigner: data.signer !== null })).toMatchObject({ ready: true, count: results.students.length });

      const cards = buildReportCards(data, TODAY);
      expect(cards).toHaveLength(remarks.rows.length);
      // The Remarks read lists students in register order too.
      const ordered = remarks.rows.map((r) => results.students.find((s) => s.studentId === r.studentId)!);
      cards.forEach((card, i) => {
        const s = ordered[i];
        const row = remarks.rows[i];
        expect(card.student.surname).toBe(s.surname.toUpperCase());
        expect(card.student.total).toBe(formatTenths(s.total!));
        expect(card.student.average).toBe(formatHundredths(s.average!));
        expect(card.student.position).toBe(`${ordinal(s.position!)} of ${results.numberInClass}`);
        expect(card.rows.map((r) => r.total)).toEqual(s.subjects.map((l) => formatTenths(l.total!)));
        expect(card.rows.map((r) => r.grade)).toEqual(s.subjects.map((l) => l.grade));
        expect(card.teacherComment.text).toBe(row.teacherRemark);
        expect(card.headComment.text).toBe(row.head.kind === "waiting" ? "" : row.head.text);
      });
    });
  });

  it("reads the school, form master, signer, scale and next term", async () => {
    await inRollback(async (tx) => {
      const data = await getReportCards(teamCtx(tx), { classId: classId() });
      expect(data.school).toMatchObject({ name: "Test School A", code: "TSA", plan: "school_logo" });
      expect(data.teacherTitle).toBe("Form master");
      expect(data.formMaster).toEqual({ title: "Mrs", name: "Funke Adewale" });
      expect(data.signer).toEqual({ title: "Principal", name: "Mr Samuel Adeleke" });
      expect(data.gradeBands.length).toBeGreaterThan(0);
      expect(data.nextTermBeginsOn).toBe("2027-01-11");
      expect(Object.keys(data.genders)).toHaveLength(data.results.students.length);
    });
  });

  it("reads the logo and signature bytes by id, the logo only on its plan (AC-4, AC-8)", async () => {
    await inRollback(async (tx) => {
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const [logo, signature] = await tx
        .insert(t.asset)
        .values([
          { schoolId: a.schoolId, kind: "logo", mimeType: "image/png", bytes, width: 10, height: 10 },
          { schoolId: a.schoolId, kind: "signature", mimeType: "image/png", bytes, width: 10, height: 10 },
        ])
        .returning();
      await tx.update(t.school).set({ logoAssetId: logo.id, principalSignatureAssetId: signature.id }).where(eq(t.school.id, a.schoolId));
      const data = await getReportCards(teamCtx(tx), { classId: classId() });
      expect(data.logo).toEqual({ data: bytes, format: "png" });
      expect(data.signature).toEqual({ data: bytes, format: "png" });

      await tx.update(t.school).set({ plan: "basic" }).where(eq(t.school.id, a.schoolId));
      expect((await getReportCards(teamCtx(tx), { classId: classId() })).logo).toBeNull();
    });
  });

  it("is not found for anyone but the form master and our team (AC-12)", async () => {
    await inRollback(async (tx) => {
      await expect(getReportCards(await teacher(tx, "Funke Adewale"), { classId: classId() })).resolves.toBeDefined();
      await expect(getReportCards(await teacher(tx, "Ibrahim Musa"), { classId: classId() })).rejects.toBeInstanceOf(NotFound);
      await expect(getReportCards(teamCtx(tx), { classId: b.cls(JSS).id })).rejects.toBeInstanceOf(NotFound);
      await expect(getReportCards(teamCtx(tx), { classId: classId(), termId: a.term(2).id })).rejects.toBeInstanceOf(NotFound);
      await expect(getReportCards(teamCtx(tx), { classId: classId(), termId: b.term(1).id })).rejects.toBeInstanceOf(NotFound);
    });
  });
});

/** Calls the download route as `ctx`, inside its transaction. */
async function download(ctx: SchoolContext | null, input: { classId?: string; term?: string; signedIn?: boolean } = {}) {
  viewer.mockResolvedValue(input.signedIn === false ? null : ({ userId: "x" } as never));
  resolve.mockResolvedValue(ctx ? { ctx, school: { code: "TSA", slug: "testschoola" } as never } : null);
  const id = input.classId ?? classId();
  const url = `http://localhost/testschoola/classes/${id}/report-cards${input.term ? `?term=${input.term}` : ""}`;
  return GET(new Request(url), { params: Promise.resolve({ school: "testschoola", classId: id }) });
}

describe("GET /{school}/classes/[classId]/report-cards", () => {
  it("sends one A4 page per student as an attachment, never cached (AC-3, AC-13)", async () => {
    await inRollback(async (tx) => {
      await fillClass(tx);
      const response = await download(await teacher(tx, "Funke Adewale"));
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/pdf");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Disposition")).toContain('filename="TSA JSS 2 Gold First Term 2026-2027 report cards.pdf"');
      const pdf = Buffer.from(await response.arrayBuffer());
      const { results } = await getClassResults(teamCtx(tx), { classId: classId() }).then((r) => ({ results: r }));
      expect(countPdfPages(pdf)).toBe(results.students.length);
      if (process.env.REPORT_CARD_OUT) writeFileSync(`${process.env.REPORT_CARD_OUT}/demo-class.pdf`, pdf);
    });
  });

  it("lets viewing as download, since it only reads (AC-12)", async () => {
    await inRollback(async (tx) => {
      await fillClass(tx);
      expect((await download(await teacher(tx, "Funke Adewale", true))).status).toBe(200);
    });
  });

  it("sends the person back to the class page while scores are missing (AC-2)", async () => {
    await inRollback(async (tx) => {
      const response = await download(teamCtx(tx), { term: a.term(1).id });
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(`http://localhost/testschoola/classes/${classId()}?term=${a.term(1).id}#report-cards`);
    });
  });

  it("refuses when a student is added after the page loaded (AC-2, race)", async () => {
    await inRollback(async (tx) => {
      await fillClass(tx);
      const [added] = await tx.insert(t.student).values({ schoolId: a.schoolId, studentNo: 99002, surname: "Late", otherNames: "Arrival", gender: "female" }).returning();
      const junior = a.section("junior_secondary");
      await tx.insert(t.enrolment).values({ schoolId: a.schoolId, studentId: added.id, termId: a.term(1).id, sessionId: a.session.id, classId: classId(), sectionId: junior.id });
      const response = await download(teamCtx(tx));
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toMatch(/#report-cards$/);
    });
  });

  it("is not found for another class, school or session, and for a bad id (AC-12)", async () => {
    await inRollback(async (tx) => {
      const ibrahim = await teacher(tx, "Ibrahim Musa");
      expect((await download(ibrahim)).status).toBe(404);
      expect((await download(teamCtx(tx), { classId: b.cls(JSS).id })).status).toBe(404);
      expect((await download(teamCtx(tx), { term: b.term(1).id })).status).toBe(404);
      expect((await download(teamCtx(tx), { classId: "not-a-uuid" })).status).toBe(404);
      expect((await download(teamCtx(tx), { term: "nope" })).status).toBe(404);
      expect((await download(null)).status).toBe(404);
      // Ibrahim's own class answers (not ready yet), so the 404 above was about access.
      expect((await download(ibrahim, { classId: a.cls(SS).id })).status).toBe(303);
    });
  });

  it("sends someone with no session to sign in", async () => {
    await inRollback(async (tx) => {
      const response = await download(teamCtx(tx), { signedIn: false });
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe("http://localhost/login");
    });
  });
});
