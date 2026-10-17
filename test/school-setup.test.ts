import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { slugProblem, suggestCode, suggestSlug } from "@/lib/reserved-slugs";
import { NotFound, schoolContext } from "@/server/data";
import type { Actor, Executor } from "@/server/data/context";
import {
  createSchool,
  getSchoolSetup,
  getSignerForSection,
  readLogo,
  removeSection,
  saveImage,
  savePrincipal,
  saveSection,
  saveSession,
  termsProblem,
  updateSchoolDetails,
} from "@/server/data/setup";

import { type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0005 acceptance criteria, then spec 0007's. Every test rolls back.

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
      const saved = await saveSection(ctx, { stage: "junior_secondary", teacherTitle: "Form teacher", hasOwnHead: false });
      expect(saved).toEqual({ ok: true, sectionId: junior.id });
      expect(await removeSection(ctx, { sectionId: junior.id })).toMatchObject({ ok: false, error: expect.stringMatching(/has classes/) });
      // The primary section in the test school has one class (Primary 4); a fresh school's empty section can go.
      const created = await createSchool(tx, team, details);
      if (!created.ok) throw new Error("no school");
      const otherCtx = schoolContext({ schoolId: created.schoolId, userId: "team", db: tx, actor: team });
      const section = await saveSection(otherCtx, { stage: "primary", teacherTitle: "Class teacher", hasOwnHead: false });
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
      const primary = a.section("primary");
      const signature = await saveImage(ctx, { kind: "signature", signer: "section", sectionId: primary.id, bytes: pngBytes(300, 120) });
      if (!signature.ok) throw new Error("upload failed");
      expect(await readLogo(tx, signature.assetId)).toBeNull();
      const [row] = await tx.select().from(t.section).where(and(eq(t.section.id, primary.id)));
      expect(row.headSignatureAssetId).toBe(signature.assetId);
    });
  });
});

// Spec 0007: the school's principal and a section's optional own head.

const signatureOf = (ctx: ReturnType<typeof teamCtx>, sectionId: string) =>
  saveImage(ctx, { kind: "signature", signer: "section", sectionId, bytes: pngBytes(300, 120) });
const assetExists = async (tx: Executor, id: string) => (await tx.select().from(t.asset).where(eq(t.asset.id, id))).length === 1;

describe("Spec 0007, AC-6 and AC-10: who signs a section's report cards", () => {
  it("is Primary's own head, and the principal for both secondary sections", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      expect(await getSignerForSection(ctx, a.section("primary").id)).toEqual({ title: "Head teacher", name: "Mrs Grace Oyelaran", signatureAssetId: null, from: "section" });
      for (const stage of ["junior_secondary", "senior_secondary"]) {
        expect(await getSignerForSection(ctx, a.section(stage).id)).toEqual({ title: "Principal", name: "Mr Samuel Adeleke", signatureAssetId: null, from: "principal" });
      }
    });
  });

  it("is null while the principal has no name, and not found for another school's section", async () => {
    await inRollback(async (tx) => {
      const created = await createSchool(tx, team, details);
      if (!created.ok) throw new Error("no school");
      const otherCtx = schoolContext({ schoolId: created.schoolId, userId: "team", db: tx, actor: team });
      const section = await saveSection(otherCtx, { stage: "junior_secondary", teacherTitle: "Form master", hasOwnHead: false });
      if (!section.ok) throw new Error("no section");
      expect(await getSignerForSection(otherCtx, section.sectionId)).toBeNull();
      await expect(getSignerForSection(teamCtx(tx), section.sectionId)).rejects.toBeInstanceOf(NotFound);
      await expect(getSignerForSection(teamCtx(tx), b.section("primary").id)).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("Spec 0007, AC-1, AC-2 and AC-8: fixing the principal", () => {
  it("changes the signer of every section without its own head, and a new signature deletes the old one", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      expect(await savePrincipal(ctx, { title: "Proprietress", name: "Mrs Funke Alade" })).toEqual({ ok: true });
      expect(await getSignerForSection(ctx, a.section("junior_secondary").id)).toMatchObject({ title: "Proprietress", name: "Mrs Funke Alade", from: "principal" });
      expect(await getSignerForSection(ctx, a.section("primary").id)).toMatchObject({ name: "Mrs Grace Oyelaran", from: "section" });

      const first = await saveImage(ctx, { kind: "signature", signer: "principal", bytes: pngBytes(300, 120) });
      const second = await saveImage(ctx, { kind: "signature", signer: "principal", bytes: pngBytes(320, 120) });
      if (!first.ok || !second.ok) throw new Error("upload failed");
      expect(await assetExists(tx, first.assetId)).toBe(false);
      expect(await getSignerForSection(ctx, a.section("senior_secondary").id)).toMatchObject({ signatureAssetId: second.assetId });
      // A principal's signature is private, like a head's.
      expect(await readLogo(tx, second.assetId)).toBeNull();
    });
  });

  it("refuses a title or name of the wrong length", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      expect(await savePrincipal(ctx, { title: "Principal", name: "Ab" })).toMatchObject({ ok: false, field: "principalName" });
      expect(await savePrincipal(ctx, { title: "P".repeat(41), name: "Mr Samuel Adeleke" })).toMatchObject({ ok: false, field: "principalTitle" });
      expect(await savePrincipal(ctx, { title: "P", name: "Mr Samuel Adeleke" })).toMatchObject({ ok: false, field: "principalTitle" });
      expect(await savePrincipal(ctx, { title: "Head of school", name: "M".repeat(80) })).toEqual({ ok: true });
    });
  });
});

describe("Spec 0007, AC-3, AC-4 and AC-8: a section's own head", () => {
  it("switching off clears the head and deletes its signature, so the principal signs", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const primary = a.section("primary");
      const signature = await signatureOf(ctx, primary.id);
      if (!signature.ok) throw new Error("upload failed");

      expect(await saveSection(ctx, { stage: "primary", teacherTitle: "Class teacher", hasOwnHead: false })).toEqual({ ok: true, sectionId: primary.id });
      const [row] = await tx.select().from(t.section).where(eq(t.section.id, primary.id));
      expect(row).toMatchObject({ headName: null, headSignatureAssetId: null, headTitle: "Head teacher" });
      expect(await assetExists(tx, signature.assetId)).toBe(false);
      expect(await getSignerForSection(ctx, primary.id)).toMatchObject({ name: "Mr Samuel Adeleke", from: "principal" });

      // Back on, it needs a title and name; the signature is uploaded again.
      const on = { stage: "primary" as const, teacherTitle: "Class teacher", hasOwnHead: true };
      expect(await saveSection(ctx, { ...on, headTitle: "Head teacher", headName: "" })).toMatchObject({ ok: false, field: "headName" });
      expect(await saveSection(ctx, { ...on, headTitle: "H".repeat(41), headName: "Mrs Grace Oyelaran" })).toMatchObject({ ok: false, field: "headTitle" });
      expect(await saveSection(ctx, { ...on, headTitle: "Head mistress", headName: "Mrs Grace Oyelaran" })).toMatchObject({ ok: true });
      expect(await getSignerForSection(ctx, primary.id)).toEqual({ title: "Head mistress", name: "Mrs Grace Oyelaran", signatureAssetId: null, from: "section" });
    });
  });

  it("fixing the head keeps its signature, and a new signature deletes the old one", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const primary = a.section("primary");
      const first = await signatureOf(ctx, primary.id);
      const second = await signatureOf(ctx, primary.id);
      if (!first.ok || !second.ok) throw new Error("upload failed");
      expect(await assetExists(tx, first.assetId)).toBe(false);
      await saveSection(ctx, { stage: "primary", teacherTitle: "Class teacher", hasOwnHead: true, headTitle: "Head teacher", headName: "Mrs Grace Oyelaran Bello" });
      expect(await getSignerForSection(ctx, primary.id)).toMatchObject({ name: "Mrs Grace Oyelaran Bello", signatureAssetId: second.assetId });
    });
  });

  it("refuses a signature for a section without its own head", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const junior = a.section("junior_secondary");
      expect(await signatureOf(ctx, junior.id)).toMatchObject({ ok: false, field: "file", error: expect.stringMatching(/no head of its own/) });
      const [row] = await tx.select().from(t.section).where(eq(t.section.id, junior.id));
      expect(row.headSignatureAssetId).toBeNull();
    });
  });

  it("removing a section with its own head deletes its signature", async () => {
    await inRollback(async (tx) => {
      const created = await createSchool(tx, team, details);
      if (!created.ok) throw new Error("no school");
      const otherCtx = schoolContext({ schoolId: created.schoolId, userId: "team", db: tx, actor: team });
      const section = await saveSection(otherCtx, { stage: "primary", teacherTitle: "Class teacher", hasOwnHead: true, headTitle: "Head teacher", headName: "Mr Tunde Bakare" });
      if (!section.ok) throw new Error("no section");
      const signature = await signatureOf(otherCtx, section.sectionId);
      if (!signature.ok) throw new Error("upload failed");
      expect(await removeSection(otherCtx, { sectionId: section.sectionId })).toEqual({ ok: true });
      expect(await assetExists(tx, signature.assetId)).toBe(false);
    });
  });
});

describe("Spec 0007, AC-7: the setup checklist", () => {
  it("needs the principal's signature for Details, and a signature only from sections with their own head", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      expect((await getSchoolSetup(ctx)).checklist).toMatchObject({ details: false, sections: false });

      expect(await saveImage(ctx, { kind: "signature", signer: "principal", bytes: pngBytes(300, 120) })).toMatchObject({ ok: true });
      expect(await signatureOf(ctx, a.section("primary").id)).toMatchObject({ ok: true });
      expect((await getSchoolSetup(ctx)).checklist).toMatchObject({ details: true, sections: true });

      // With no own head anywhere, Sections needs nothing more.
      await saveSection(ctx, { stage: "primary", teacherTitle: "Class teacher", hasOwnHead: false });
      expect((await getSchoolSetup(ctx)).checklist.sections).toBe(true);
    });
  });
});

describe("Spec 0007, AC-9: our team only", () => {
  it("gives a teacher, or our team viewing as someone, not found for every action", async () => {
    await inRollback(async (tx) => {
      const actors: Actor[] = [
        { kind: "teacher", staffId: "x", readOnly: false },
        { kind: "admin", readOnly: true },
      ];
      for (const actor of actors) {
        const ctx = schoolContext({ schoolId: a.schoolId, userId: "t", db: tx, actor });
        await expect(savePrincipal(ctx, { title: "Principal", name: "Mr Samuel Adeleke" })).rejects.toBeInstanceOf(NotFound);
        await expect(saveSection(ctx, { stage: "primary", teacherTitle: "Class teacher", hasOwnHead: false })).rejects.toBeInstanceOf(NotFound);
        await expect(saveImage(ctx, { kind: "signature", signer: "principal", bytes: pngBytes(300, 120) })).rejects.toBeInstanceOf(NotFound);
        await expect(getSignerForSection(ctx, a.section("primary").id)).rejects.toBeInstanceOf(NotFound);
      }
      // A section id from another school is not found, even for our team.
      await expect(signatureOf(teamCtx(tx), b.section("primary").id)).rejects.toBeInstanceOf(NotFound);
    });
  });
});
