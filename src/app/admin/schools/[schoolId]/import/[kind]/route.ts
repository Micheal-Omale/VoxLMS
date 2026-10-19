import { createHash } from "node:crypto";

import { notFound } from "next/navigation";

import { ImportRefused, MAX_FILE_BYTES, SPLIT_IT } from "@/lib/import/grid";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { NoCurrentTerm, ReadOnlySession, TermReleased } from "@/server/data";
import { commitStudentImport, ImportClash, PlanChanged, planStudentImport, TermChanged } from "@/server/data/imports";
import { sqlState, violatedConstraint } from "@/server/data/team";
import { readWorkbook } from "@/server/import/read-workbook";

// Upload and Confirm for an Excel import (spec 0013, AC-2, AC-8, AC-9, AC-16).
// Both send the file; Preview saves nothing, Confirm reads and checks it all
// again in one transaction. The file lives only in memory for this request,
// and logs carry counts and timings, never names or phone numbers.

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Room for the form's other fields around the file. */
const MAX_BODY = MAX_FILE_BYTES + 64 * 1024;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const refuse = (status: number, code: string, error: string, extra: object = {}) => json({ ok: false, code, error, ...extra }, status);
const tooLarge = () => refuse(413, "too_large", `This file is larger than 2 MB. ${SPLIT_IT}`);

/** Route Handlers get no Server Action protection: the request must come from this app's own pages. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The body, or null once it passes the limit (checked while reading, whatever content-length said). */
async function readBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.byteLength;
  }
  return body;
}

export async function POST(request: Request, { params }: RouteContext<"/admin/schools/[schoolId]/import/[kind]">) {
  const started = Date.now();
  const { schoolId, kind } = await params;
  // Our team only; anyone else gets not found (AC-16). Teacher imports come later.
  const { ctx } = await requireTeamSchoolContext(schoolId);
  if (kind !== "students") notFound();
  if (!sameOrigin(request)) return refuse(403, "not_allowed", "This upload didn’t come from the import screen. Reload the page and try again.");

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return tooLarge();
  const body = await readBody(request, MAX_BODY);
  if (!body) return tooLarge();
  let form: FormData;
  try {
    form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return refuse(400, "bad_request", "That upload couldn’t be read. Choose the file again.");
  }
  const file = form.get("file");
  const mode = form.get("mode");
  if (!(file instanceof File) || (mode !== "preview" && mode !== "commit")) return refuse(400, "bad_request", "Choose a file to upload.");
  if (file.size > MAX_FILE_BYTES) return tooLarge();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const fileName = file.name.slice(0, 200) || "upload";
  const log = (event: string, extra: object = {}) => console.info(event, { schoolId: ctx.schoolId, kind, mode, ms: Date.now() - started, ...extra });

  try {
    if (mode === "commit" && form.get("fileHash") !== fileHash) return refuse(409, "file_changed", "The file changed. Upload it again.");
    const grid = await readWorkbook(bytes, fileName, "students");

    if (mode === "preview") {
      const plan = await planStudentImport(ctx, grid);
      log("import previewed", { rows: plan.rows.length, counts: plan.counts });
      return json({ ok: true, mode, fileHash, plan });
    }

    const termId = String(form.get("termId") ?? "");
    if (!UUID.test(termId)) return refuse(409, "term_changed", "The current term changed. Upload the file again.");
    const addAnyway = form.getAll("addAnyway").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const result = await commitStudentImport(ctx, { grid, fileName, termId, planHash: String(form.get("planHash") ?? ""), addAnyway });
    log("import committed", { runId: result.runId, counts: result.counts });
    return json({ ok: true, mode, ...result });
  } catch (error) {
    if (error instanceof ImportRefused) {
      return refuse(error.code === "too_large" ? 413 : 400, error.code, error.message);
    }
    if (error instanceof TermReleased) return refuse(409, "term_released", error.message);
    if (error instanceof NoCurrentTerm) return refuse(409, "no_term", "This school has no current term. Set one on the Session and terms page first.");
    if (error instanceof TermChanged) return refuse(409, "term_changed", "The current term changed. Upload the file again.");
    if (error instanceof PlanChanged) return refuse(409, "plan_changed", "Records changed since the preview. Check the new preview.", { fileHash, plan: error.plan });
    if (error instanceof ImportClash) return refuse(409, "clash", "Someone changed this school’s records while you were importing. Upload the file again.");
    if (error instanceof ReadOnlySession) return refuse(403, "read_only", error.message);
    // Database errors echo the values they refused; log only their codes (AC-16).
    console.error("import failed", { schoolId: ctx.schoolId, kind, mode, ms: Date.now() - started, error: error instanceof Error ? error.name : "unknown", sqlState: sqlState(error), constraint: violatedConstraint(error)?.constraint ?? null });
    return refuse(500, "failed", "The import couldn’t be finished, and nothing was saved. Try again in a minute.");
  }
}
