import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as t from "@/db/schema";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { schoolContext } from "@/server/data";
import type { Executor } from "@/server/data/context";
import { POST } from "@/app/admin/schools/[schoolId]/import/[kind]/route";

import { type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0013, AC-2, AC-9 and AC-16: the import route handler. The team guard
// is mocked (its own rules are covered by the login tests) so the route runs
// against a rolled back transaction on the dev branch.

vi.mock("@/server/auth/viewer", () => ({ requireTeamSchoolContext: vi.fn() }));
const guard = vi.mocked(requireTeamSchoolContext);

let a: Fixture;

beforeAll(async () => {
  ({ a } = await setUpSchools());
});
afterAll(async () => {
  await pool.end();
});

const APP = "http://localhost:3000";

async function asTeam(tx: Executor) {
  const [admin] = await tx
    .insert(t.user)
    .values({ id: `team-${crypto.randomUUID()}`, name: "Team Member", email: `${crypto.randomUUID()}@users.voxlms.invalid`, role: "admin" })
    .returning();
  guard.mockResolvedValue({ ctx: schoolContext({ schoolId: a.schoolId, userId: admin.id, db: tx, actor: { kind: "admin", readOnly: false } }), viewer: {} as never });
}

function request(fields: Record<string, string | string[]>, file: Blob | null, headers: Record<string, string> = { origin: APP, "x-forwarded-host": "localhost:3000" }) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const v of [value].flat()) form.append(key, v);
  if (file) form.set("file", file, "register.csv");
  return new Request(`${APP}/admin/schools/${a.schoolId}/import/students`, { method: "POST", body: form, headers });
}

const call = (req: Request, kind = "students") => POST(req, { params: Promise.resolve({ schoolId: a.schoolId, kind }) });

const register = (rows: string[]) => new Blob([["Name,Gender,Class", ...rows].join("\n")], { type: "text/csv" });

describe("import route", () => {
  it("previews, refuses a changed file, then commits", async () => {
    await inRollback(async (tx) => {
      await asTeam(tx);
      const tag = `RTE${crypto.randomUUID().replace(/[^a-f]/g, "").slice(0, 6).toUpperCase()}`;
      const file = register([`${tag} Ada,F,JSS 2 Gold`]);
      const previewed = await call(request({ mode: "preview" }, file));
      expect(previewed.status).toBe(200);
      const { fileHash, plan } = await previewed.json();
      expect(plan.counts).toEqual({ add: 1, here: 0, probably: 0, problems: 0 });

      const fields = { mode: "commit", termId: plan.termId, planHash: plan.planHash };
      const changed = await call(request({ ...fields, fileHash }, register([`${tag} Ada,F,JSS 2 Gold`, `${tag} Bola,F,JSS 2 Gold`])));
      expect(changed.status).toBe(409);
      expect(await changed.json()).toMatchObject({ ok: false, code: "file_changed" });

      const committed = await call(request({ ...fields, fileHash }, file));
      expect(committed.status).toBe(200);
      expect(await committed.json()).toMatchObject({ ok: true, runId: expect.any(String), counts: { added: 1 } });
    });
  });

  it("refuses an upload from another site or with no Origin, before reading it (AC-16)", async () => {
    await inRollback(async (tx) => {
      await asTeam(tx);
      const other = await call(request({ mode: "preview" }, register([]), { origin: "https://evil.example", "x-forwarded-host": "localhost:3000" }));
      expect(other.status).toBe(403);
      const none = await call(request({ mode: "preview" }, register([]), { "x-forwarded-host": "localhost:3000" }));
      expect((await none.json()).code).toBe("not_allowed");
    });
  });

  it("refuses files that are too large or not spreadsheets (AC-2)", async () => {
    await inRollback(async (tx) => {
      await asTeam(tx);
      const big = await call(request({ mode: "preview" }, new Blob([new Uint8Array(2 * 1024 * 1024 + 1)])));
      expect(big.status).toBe(413);
      expect((await big.json()).code).toBe("too_large");
      const xls = await call(request({ mode: "preview" }, new Blob([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])])));
      expect(await xls.json()).toMatchObject({ code: "old_excel", error: "This is an old Excel file. Open it in Excel and save it as .xlsx." });
    });
  });

  it("doesn't take teacher files yet", async () => {
    await inRollback(async (tx) => {
      await asTeam(tx);
      await expect(call(request({ mode: "preview" }, register([])), "teachers")).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    });
  });
});
