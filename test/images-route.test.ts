import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as t from "@/db/schema";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { schoolContext } from "@/server/data";
import type { Executor } from "@/server/data/context";
import { POST } from "@/app/admin/schools/[schoolId]/images/route";

import { type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0007, AC-4, AC-8 and AC-9: the image upload route handler. The team
// guard is mocked (its own rules are covered by the login tests) so the route
// runs against a rolled back transaction on the dev branch.

vi.mock("@/server/auth/viewer", () => ({ requireTeamSchoolContext: vi.fn() }));
const guard = vi.mocked(requireTeamSchoolContext);

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  ({ a, b } = await setUpSchools());
});
afterAll(async () => {
  await pool.end();
});

/** A minimal PNG header: enough for the size check. */
function png(width = 300, height = 120) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: "image/png" });
}

/** Posts a form to the route as our team, inside the given transaction. */
async function post(tx: Executor, fields: Record<string, string>, file: Blob | null = png()) {
  guard.mockResolvedValue({
    ctx: schoolContext({ schoolId: a.schoolId, userId: "team", db: tx, actor: { kind: "admin", readOnly: false } }),
    viewer: {} as never,
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set("file", file, "signature.png");
  const response = await POST(new Request(`http://localhost/admin/schools/${a.schoolId}/images`, { method: "POST", body: form }), {
    params: Promise.resolve({ schoolId: a.schoolId }),
  });
  return { status: response.status, body: (await response.json()) as { ok: boolean; error?: string; assetId?: string } };
}

describe("POST /admin/schools/[id]/images", () => {
  it("saves the principal's signature on the school (AC-8)", async () => {
    await inRollback(async (tx) => {
      const { status, body } = await post(tx, { kind: "signature", signer: "principal" });
      expect(status).toBe(200);
      const [school] = await tx.select().from(t.school).where(eq(t.school.id, a.schoolId));
      expect(school.principalSignatureAssetId).toBe(body.assetId);
    });
  });

  it("saves a signature on a section that has its own head", async () => {
    await inRollback(async (tx) => {
      const primary = a.section("primary");
      const { status, body } = await post(tx, { kind: "signature", signer: "section", sectionId: primary.id });
      expect(status).toBe(200);
      const [row] = await tx.select().from(t.section).where(eq(t.section.id, primary.id));
      expect(row.headSignatureAssetId).toBe(body.assetId);
    });
  });

  it("refuses a signature for a section without its own head (AC-4)", async () => {
    await inRollback(async (tx) => {
      const { status, body } = await post(tx, { kind: "signature", signer: "section", sectionId: a.section("junior_secondary").id });
      expect(status).toBe(400);
      expect(body.error).toMatch(/Junior Secondary has no head of its own/);
    });
  });

  it("refuses a section id from another school, as a plain message (AC-9)", async () => {
    await inRollback(async (tx) => {
      const { status, body } = await post(tx, { kind: "signature", signer: "section", sectionId: b.section("primary").id });
      expect(status).toBe(400);
      expect(body).toEqual({ ok: false, error: "That section is no longer in this school. Refresh the page." });
      const [row] = await tx.select().from(t.section).where(eq(t.section.id, b.section("primary").id));
      expect(row.headSignatureAssetId).toBeNull();
    });
  });

  it("refuses a signature that doesn't say whose it is", async () => {
    await inRollback(async (tx) => {
      expect(await post(tx, { kind: "signature" })).toEqual({ status: 400, body: { ok: false, error: "Choose whose signature this is." } });
      expect((await post(tx, { kind: "signature", signer: "someone" })).status).toBe(400);
    });
  });

  it("refuses a missing file or an unknown kind", async () => {
    await inRollback(async (tx) => {
      expect(await post(tx, { kind: "signature", signer: "principal" }, null)).toEqual({ status: 400, body: { ok: false, error: "Choose an image to upload." } });
      expect((await post(tx, { kind: "stamp" })).status).toBe(400);
    });
  });

  it("refuses a file that isn't a PNG the browser prepared", async () => {
    await inRollback(async (tx) => {
      const { status, body } = await post(tx, { kind: "signature", signer: "principal" }, new Blob(["%PDF-1.7"], { type: "application/pdf" }));
      expect(status).toBe(400);
      expect(body.error).toMatch(/isn't an image we can use/);
    });
  });

  it("refuses a body over the size limit before reading it", async () => {
    guard.mockResolvedValue({ ctx: schoolContext({ schoolId: a.schoolId, userId: "team" }), viewer: {} as never });
    const response = await POST(
      new Request(`http://localhost/admin/schools/${a.schoolId}/images`, { method: "POST", headers: { "content-length": String(400 * 1024) }, body: "x" }),
      { params: Promise.resolve({ schoolId: a.schoolId }) },
    );
    expect(response.status).toBe(413);
  });

  it("does nothing for someone who isn't on our team: the guard's not found stops it (AC-9)", async () => {
    guard.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    const form = new FormData();
    form.set("kind", "signature");
    form.set("signer", "principal");
    form.set("file", png(), "signature.png");
    await expect(
      POST(new Request(`http://localhost/admin/schools/${a.schoolId}/images`, { method: "POST", body: form }), { params: Promise.resolve({ schoolId: a.schoolId }) }),
    ).rejects.toThrow(/404/);
  });
});
