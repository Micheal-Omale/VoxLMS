import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { catchUpDemoSigners, removeSchoolBySlug, type Tx } from "@/db/seed/demo-school";
import { schoolContext } from "@/server/data";
import type { Executor } from "@/server/data/context";
import { createSchool, saveImage } from "@/server/data/setup";

import { inRollback, pool, setUpSchools } from "./db";

// Spec 0007, AC-10: the demo seed's principal, and the one time catch up for
// made up schools built before spec 0007. Every test rolls back.

const team = { kind: "admin" as const, readOnly: false };
const slug = () => `dtest${Date.now().toString(36)}`;

beforeAll(async () => {
  await setUpSchools();
});
afterAll(async () => {
  await pool.end();
});

/** A school shaped like the seed before spec 0007: a head named on every section. */
async function oldShapedSchool(tx: Executor) {
  const created = await createSchool(tx, team, { name: "Old Demo College", slug: slug(), code: "ODC", address: "4 Allen Avenue, Ikeja, Lagos" });
  if (!created.ok) throw new Error("no school");
  const schoolId = created.schoolId;
  await tx.insert(t.section).values([
    { schoolId, stage: "primary", name: "Primary", teacherTitle: "Class teacher", headTitle: "Head teacher", headName: "Mrs Grace Oyelaran" },
    { schoolId, stage: "junior_secondary", name: "Junior Secondary", teacherTitle: "Form master", headTitle: "Principal", headName: "Mr Samuel Adeleke" },
    { schoolId, stage: "senior_secondary", name: "Senior Secondary", teacherTitle: "Form master", headTitle: "Principal", headName: "Mr Samuel Adeleke" },
  ]);
  return schoolId;
}

const sectionsOf = (tx: Executor, schoolId: string) =>
  tx.select({ stage: t.section.stage, headTitle: t.section.headTitle, headName: t.section.headName }).from(t.section).where(eq(t.section.schoolId, schoolId)).orderBy(t.section.stage);

describe("catchUpDemoSigners", () => {
  it("gives an old shaped school its principal and leaves only Primary with its own head", async () => {
    await inRollback(async (tx) => {
      const schoolId = await oldShapedSchool(tx);
      await catchUpDemoSigners(tx as unknown as Tx, schoolId);

      const [school] = await tx.select().from(t.school).where(eq(t.school.id, schoolId));
      expect(school).toMatchObject({ principalTitle: "Principal", principalName: "Mr Samuel Adeleke" });
      expect(await sectionsOf(tx, schoolId)).toEqual([
        { stage: "primary", headTitle: "Head teacher", headName: "Mrs Grace Oyelaran" },
        { stage: "junior_secondary", headTitle: "Head teacher", headName: null },
        { stage: "senior_secondary", headTitle: "Head teacher", headName: null },
      ]);
    });
  });

  it("runs only once: a school that already has a principal is left alone", async () => {
    await inRollback(async (tx) => {
      const schoolId = await oldShapedSchool(tx);
      await tx.update(t.school).set({ principalName: "Mrs Funke Alade" }).where(eq(t.school.id, schoolId));
      await catchUpDemoSigners(tx as unknown as Tx, schoolId);

      const [school] = await tx.select().from(t.school).where(eq(t.school.id, schoolId));
      expect(school.principalName).toBe("Mrs Funke Alade");
      expect((await sectionsOf(tx, schoolId)).map((s) => s.headName)).toEqual(["Mrs Grace Oyelaran", "Mr Samuel Adeleke", "Mr Samuel Adeleke"]);
    });
  });

  it("keeps a secondary head who already has a signature, so no image is orphaned", async () => {
    await inRollback(async (tx) => {
      const schoolId = await oldShapedSchool(tx);
      const ctx = schoolContext({ schoolId, userId: "team", db: tx, actor: team });
      const [junior] = await tx.select().from(t.section).where(and(eq(t.section.schoolId, schoolId), eq(t.section.stage, "junior_secondary")));
      const bytes = new Uint8Array(33);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
      new DataView(bytes.buffer).setUint32(16, 300);
      new DataView(bytes.buffer).setUint32(20, 120);
      expect(await saveImage(ctx, { kind: "signature", signer: "section", sectionId: junior.id, bytes })).toMatchObject({ ok: true });

      await catchUpDemoSigners(tx as unknown as Tx, schoolId);

      const [after] = await tx.select().from(t.section).where(eq(t.section.id, junior.id));
      expect(after.headName).toBe("Mr Samuel Adeleke");
    });
  });
});

describe("removeSchoolBySlug", () => {
  it("removes a made up school even when its principal has a signature", async () => {
    await inRollback(async (tx) => {
      const name = slug();
      const created = await createSchool(tx, team, { name: "Short Lived School", slug: name, code: "SLS", address: "4 Allen Avenue, Ikeja, Lagos" });
      if (!created.ok) throw new Error("no school");
      const ctx = schoolContext({ schoolId: created.schoolId, userId: "team", db: tx, actor: team });
      const bytes = new Uint8Array(33);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
      new DataView(bytes.buffer).setUint32(16, 300);
      new DataView(bytes.buffer).setUint32(20, 120);
      expect(await saveImage(ctx, { kind: "signature", signer: "principal", bytes })).toMatchObject({ ok: true });

      expect(await removeSchoolBySlug(tx as never, name)).toBe(true);
      expect(await tx.select().from(t.school).where(eq(t.school.slug, name))).toHaveLength(0);
      expect(await tx.select().from(t.asset).where(eq(t.asset.schoolId, created.schoolId))).toHaveLength(0);
    });
  });
});
