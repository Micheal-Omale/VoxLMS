import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { slugProblem, suggestCode, suggestSlug } from "@/lib/reserved-slugs";
import { NotFound, schoolContext } from "@/server/data";
import type { Actor, Executor } from "@/server/data/context";
import {
  createSchool,
  readLogo,
  removeSection,
  saveImage,
  saveSection,
  saveSession,
  termsProblem,
  updateSchoolDetails,
} from "@/server/data/setup";

import { type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0005 acceptance criteria. Every test rolls back.

let a: Fixture;

beforeAll(async () => {
  ({ a } = await setUpSchools());
});

afterAll(async () => {
  await pool.end();
});

const team: Actor = { kind: "admin", readOnly: false };
const teamCtx = (tx: Executor) => schoolContext({ schoolId: a.schoolId, userId: "team", db: tx, actor: team });

// A web name unique to this run, so tests never collide with schools made by hand on the dev branch.
const details = {
  name: "Kings Model College",
  slug: `ktest${Date.now().toString(36)}`,
  code: "KMC",
  address: "4 Allen Avenue, Ikeja, Lagos",
};

/** A minimal PNG header: enough for the size check (the image data itself isn't needed). */
function pngBytes(width: number, height: number, extra = 0) {
  const bytes = new Uint8Array(33 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("AC-1: creating a school", () => {
  it("suggests a web name and code from the school's name", () => {
    expect(suggestSlug("Grace High School, Ikeja")).toBe("gracehighikeja");
    expect(suggestSlug("The Kings College")).toBe("kings");
    expect(suggestCode("Grace High School")).toBe("GHS");
  });

  it("refuses reserved, malformed and taken web names, and bad codes", async () => {
    expect(slugProblem("admin")).toMatch(/reserved/);
    expect(slugProblem("Grace High")).toMatch(/lowercase/);
    expect(slugProblem("ab")).toMatch(/at least 3/);
    await inRollback(async (tx) => {
      expect(await createSchool(tx, team, { ...details, slug: "login" })).toMatchObject({ ok: false, field: "slug" });
      expect(await createSchool(tx, team, { ...details, slug: "testschoola" })).toMatchObject({ ok: false, field: "slug", error: expect.stringMatching(/already/) });
      expect(await createSchool(tx, team, { ...details, code: "K" })).toMatchObject({ ok: false, field: "code" });
      expect(await createSchool(tx, team, { ...details, phone: "12345" })).toMatchObject({ ok: false, field: "phone" });
    });
  });

  it("creates a school for our team only", async () => {
    await inRollback(async (tx) => {
      const created = await createSchool(tx, team, details);
      expect(created.ok).toBe(true);
      const teacher: Actor = { kind: "teacher", staffId: "x", readOnly: false };
      await expect(createSchool(tx, teacher, { ...details, slug: "another" })).rejects.toBeInstanceOf(NotFound);
      await expect(createSchool(tx, { kind: "admin", readOnly: true }, { ...details, slug: "another" })).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("AC-3: editing details", () => {
  it("asks before changing the web name, then changes it", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const base = { name: "Test School A", slug: "testschoolanew", code: "TSA", address: "1 Test Road, Lagos" };
      const first = await updateSchoolDetails(ctx, { ...base, confirmSlugChange: false });
      expect(first).toMatchObject({ ok: false, field: "slug", needsConfirm: true });
      const second = await updateSchoolDetails(ctx, { ...base, showAttendance: true, confirmSlugChange: true });
      expect(second).toEqual({ ok: true, slugChanged: true });
      const [row] = await tx.select().from(t.school).where(eq(t.school.id, a.schoolId));
      expect([row.slug, row.showAttendance]).toEqual(["testschoolanew", true]);
    });
  });
});

describe("AC-5: sections", () => {
  it("keeps one section per stage and won't remove a section that has classes", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const junior = a.section("junior_secondary");
      const saved = await saveSection(ctx, { stage: "junior_secondary", teacherTitle: "Form teacher", headTitle: "Principal", headName: "Dr Ade Bello" });
      expect(saved).toEqual({ ok: true, sectionId: junior.id });
      expect(await removeSection(ctx, { sectionId: junior.id })).toMatchObject({ ok: false, error: expect.stringMatching(/has classes/) });
      // The primary section in the test school has one class (Primary 4); a fresh school's empty section can go.
      const created = await createSchool(tx, team, details);
      if (!created.ok) throw new Error("no school");
      const otherCtx = schoolContext({ schoolId: created.schoolId, userId: "team", db: tx, actor: team });
      const section = await saveSection(otherCtx, { stage: "primary", teacherTitle: "Class teacher", headTitle: "Head teacher" });
      if (!section.ok) throw new Error("no section");
      expect(await removeSection(otherCtx, { sectionId: section.sectionId })).toEqual({ ok: true });
      // School A's context can't touch the new school's section.
      await expect(removeSection(ctx, { sectionId: section.sectionId })).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("AC-6: sessions and terms", () => {
  const good = [
    { number: 1 as const, startsOn: "2027-09-13", endsOn: "2027-12-10", nextTermBeginsOn: "2028-01-10" },
    { number: 2 as const, startsOn: "2028-01-10", endsOn: "2028-04-07", nextTermBeginsOn: "2028-04-24" },
    { number: 3 as const, startsOn: "2028-04-24", endsOn: "2028-07-21" },
  ];

  it("checks term dates run in order", () => {
    expect(termsProblem(good)).toBeNull();
    expect(termsProblem([{ ...good[0], endsOn: "2027-09-01" }, good[1], good[2]])).toMatchObject({ field: "term1", error: expect.stringMatching(/end after it starts/) });
    expect(termsProblem([good[0], { ...good[1], startsOn: "2027-12-01" }, good[2]])).toMatchObject({ field: "term2", error: expect.stringMatching(/after First Term ends/) });
    expect(termsProblem([{ ...good[0], nextTermBeginsOn: "2027-12-01" }, good[1], good[2]])).toMatchObject({ field: "term1" });
    expect(termsProblem([{ ...good[0], daysOpened: 500 }, good[1], good[2]])).toMatchObject({ field: "term1" });
  });

  it("adds a session with its three terms, refuses a duplicate name, and saves corrections", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      expect(await saveSession(ctx, { name: "2027-28", terms: good })).toMatchObject({ ok: false, field: "name" });
      const created = await saveSession(ctx, { name: "2027/2028", terms: good });
      if (!created.ok) throw new Error("no session");
      expect(await saveSession(ctx, { name: "2027/2028", terms: good })).toMatchObject({ ok: false, field: "name" });
      const moved = await saveSession(ctx, { sessionId: created.sessionId, name: "2027/2028", terms: [{ ...good[0], startsOn: "2027-09-20" }, good[1], good[2]] });
      expect(moved.ok).toBe(true);
      const terms = await tx.select().from(t.term).where(eq(t.term.sessionId, created.sessionId));
      expect(terms).toHaveLength(3);
      expect(terms.find((x) => x.number === 1)?.startsOn).toBe("2027-09-20");
    });
  });
});

describe("AC-4: images", () => {
  it("accepts a real image, replaces the old one, and refuses anything else", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      expect(await saveImage(ctx, { kind: "logo", bytes: new TextEncoder().encode("%PDF-1.7 not an image") })).toMatchObject({ ok: false, field: "file" });
      expect(await saveImage(ctx, { kind: "logo", bytes: pngBytes(400, 400, 310 * 1024) })).toMatchObject({ ok: false, error: expect.stringMatching(/too large/) });
      expect(await saveImage(ctx, { kind: "logo", bytes: pngBytes(4000, 4000) })).toMatchObject({ ok: false });

      const first = await saveImage(ctx, { kind: "logo", bytes: pngBytes(300, 300) });
      const second = await saveImage(ctx, { kind: "logo", bytes: pngBytes(320, 300) });
      if (!first.ok || !second.ok) throw new Error("upload failed");
      expect(await tx.select().from(t.asset).where(eq(t.asset.id, first.assetId))).toHaveLength(0);
      expect(await readLogo(tx, second.assetId)).not.toBeNull();
    });
  });

  it("never serves a signature as a logo", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const junior = a.section("junior_secondary");
      const signature = await saveImage(ctx, { kind: "signature", sectionId: junior.id, bytes: pngBytes(300, 120) });
      if (!signature.ok) throw new Error("upload failed");
      expect(await readLogo(tx, signature.assetId)).toBeNull();
      const [row] = await tx.select().from(t.section).where(and(eq(t.section.id, junior.id)));
      expect(row.headSignatureAssetId).toBe(signature.assetId);
    });
  });
});
