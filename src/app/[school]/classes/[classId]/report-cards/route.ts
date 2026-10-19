import { renderReportCards } from "@/components/report-card/render";
import { buildReportCards, reportCardFileName, reportCardReadiness } from "@/lib/report-card";
import { getViewer, schoolContextFor } from "@/server/auth/viewer";
import { getReportCards, NoCurrentTerm, NotFound } from "@/server/data";

// The class's report cards as one PDF (spec 0012): one A4 page per open
// enrolment, in register order. Rendered fresh on every download, never
// stored or cached. A class that isn't ready, or a file that spilled onto
// extra pages, sends no file at all.

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

const seeOther = (request: Request, path: string) =>
  new Response(null, { status: 303, headers: { Location: new URL(path, request.url).toString(), "Cache-Control": "private, no-store" } });

/** `filename` for old browsers (plain ASCII), `filename*` for the exact name. */
function attachment(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** AC-10: the message the person sees when a card didn't fit. */
function didNotFit(classPage: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Report cards</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5">
<h1 style="font-size: 1.25rem">Report cards</h1>
<p>These report cards didn’t fit on one page each. The VoxLMS team has been told.</p>
<p><a href="${escapeHtml(classPage)}">Back to the class</a></p>
</body></html>`;
  return new Response(html, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request, { params }: RouteContext<"/[school]/classes/[classId]/report-cards">) {
  const started = Date.now();
  const { school: slug, classId } = await params;
  const termParam = new URL(request.url).searchParams.get("term");
  if (!UUID.test(classId) || (termParam !== null && !UUID.test(termParam))) return notFound();
  const termId = termParam ?? undefined;

  const viewer = await getViewer();
  if (!viewer) return seeOther(request, "/login");
  const resolved = await schoolContextFor(viewer, slug);
  if (!resolved) return notFound();
  const { ctx, school } = resolved;

  let data;
  try {
    data = await getReportCards(ctx, { classId, termId });
  } catch (error) {
    if (error instanceof NotFound || error instanceof NoCurrentTerm) return notFound();
    throw error;
  }

  // Checked again here: the class may have changed since the page loaded (AC-2).
  const classPage = `/${slug}/classes/${classId}${termId ? `?term=${termId}` : ""}#report-cards`;
  const readiness = reportCardReadiness({ results: data.results, remarks: data.remarks, hasSigner: data.signer !== null });
  if (!readiness.ready) return seeOther(request, classPage);

  // The read only snapshot has closed; a slow render holds no database connection.
  const cards = buildReportCards(data, new Date());
  const { results } = data;
  const fileName = reportCardFileName(school.code, results.cls.name, results.term.number, results.session.name);
  const { pdf, pages, fits } = await renderReportCards(cards, fileName.replace(/\.pdf$/, ""));
  const log = { school: school.slug, classId, termId: results.term.id, cards: cards.length, pages, bytes: pdf.length, ms: Date.now() - started };
  if (!fits) {
    console.error("report cards spilled onto extra pages", log);
    return didNotFit(classPage);
  }
  console.info("report cards downloaded", log);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachment(fileName),
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
