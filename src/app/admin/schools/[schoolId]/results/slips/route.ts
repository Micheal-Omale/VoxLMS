import { eq } from "drizzle-orm";

import { renderPinSlips } from "@/components/pin-slips/render";
import { db } from "@/db";
import { school } from "@/db/schema";
import { getViewer } from "@/server/auth/viewer";
import { schoolContext } from "@/server/data";
import { ReadOnlySession } from "@/server/data/access";
import { DataError, NothingToPrint, NotFound, NoCurrentTerm, PinKeyMissing, SlipAlreadyReplaced } from "@/server/data/errors";
import { makeSlips, type SlipRequest } from "@/server/data/result-pins";

// Makes PIN slips and sends their one PDF (spec 0014, AC-6, AC-11, slip route
// steps). The PINs exist only inside this response: a render that fails or
// spills onto extra pages rolls the slips back, so no PIN outlives its file.

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO_STORE = { "Cache-Control": "private, no-store" };

const plain = (status: number, text: string) => new Response(text, { status, headers: NO_STORE });
const message = (status: number, text: string) => Response.json({ message: text }, { status, headers: NO_STORE });

/** Route Handlers get no Server Action protection: only this app's own pages may post here (step 1). */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** `filename` for old browsers (plain ASCII), `filename*` for the exact name. */
function attachment(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function readRequest(form: FormData): SlipRequest | null {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" && UUID.test(value) ? value : null;
  };
  const kind = form.get("do");
  const classId = field("classId");
  const termId = field("termId");
  const enrolmentId = field("enrolmentId");
  const pinId = field("pinId");
  const runId = field("runId");
  if (kind === "class" && classId && termId) return { do: "class", classId, termId };
  if (kind === "one" && enrolmentId) return { do: "one", enrolmentId };
  if (kind === "replace" && pinId) return { do: "replace", pinId };
  if (kind === "remake" && runId) return { do: "remake", runId };
  return null;
}

class WrongPageCount extends Error {}

export async function POST(request: Request, { params }: RouteContext<"/admin/schools/[schoolId]/results/slips">) {
  if (!sameOrigin(request)) return plain(403, "Forbidden");
  const { schoolId } = await params;
  const viewer = await getViewer();
  if (!viewer) return plain(401, "Sign in first");
  if (!viewer.isTeam || !UUID.test(schoolId)) return plain(404, "Not found");
  const [found] = await db.select({ id: school.id }).from(school).where(eq(school.id, schoolId));
  if (!found) return plain(404, "Not found");
  const ctx = schoolContext({ schoolId: found.id, userId: viewer.userId, actor: { kind: "admin", readOnly: false } });

  const slipRequest = readRequest(await request.formData().catch(() => new FormData()));
  if (!slipRequest) return plain(404, "Not found");

  const started = Date.now();
  const host = new URL(process.env.BETTER_AUTH_URL ?? new URL(request.url).origin).host;
  try {
    const { pdf, fileName, count } = await makeSlips(ctx, slipRequest, host, async (made) => {
      const { pdf, pages, fits } = await renderPinSlips(made.slips, made.fileName.replace(/\.pdf$/, ""));
      if (!fits) {
        console.error("PIN slips spilled onto extra pages", { schoolId, kind: made.kind, slips: made.slips.length, pages });
        throw new WrongPageCount();
      }
      return { pdf, fileName: made.fileName, count: made.slips.length };
    });
    console.info("PIN slips sent", { schoolId, kind: slipRequest.do, count, bytes: pdf.length, ms: Date.now() - started });
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/pdf",
        "Content-Disposition": attachment(fileName),
        "Content-Length": String(pdf.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof WrongPageCount) return message(500, "These slips didn’t print correctly, so none were made. The VoxLMS team has been told.");
    if (error instanceof PinKeyMissing) return message(503, error.message);
    if (error instanceof NothingToPrint || error instanceof SlipAlreadyReplaced || error instanceof ReadOnlySession) return message(409, error.message);
    if (error instanceof NotFound || error instanceof NoCurrentTerm) return plain(404, "Not found");
    if (error instanceof DataError) return message(409, error.message);
    throw error;
  }
}
