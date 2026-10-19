import { cookies } from "next/headers";

import { renderReportCards } from "@/components/report-card/render";
import { loadPinResult } from "@/server/data/pin-results";
import { readResultCookie } from "@/server/result-pin/crypto";

import { RESULT_COOKIE } from "../cookie";

// The parent's report card download (spec 0014, AC-17): the same one page
// PDF the school prints, for the one card the signed cookie opens. Checked
// again here; on any failure the person goes back to /result for the message.

export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store" };

/** `filename` for old browsers (plain ASCII), `filename*` for the exact name. */
function attachment(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(request: Request) {
  const back = () => new Response(null, { status: 303, headers: { ...NO_STORE, Location: new URL("/result", request.url).toString() } });
  const jar = await cookies();
  let slip;
  try {
    slip = readResultCookie(jar.get(RESULT_COOKIE)?.value);
  } catch {
    return back();
  }
  if (!slip) return back();
  const result = await loadPinResult(slip.pinId);
  if (!result.ok) return back();

  const { pdf, pages, fits } = await renderReportCards([result.card], result.fileName.replace(/\.pdf$/, ""));
  if (!fits) {
    console.error("PIN report card spilled onto extra pages", { pages });
    return back();
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/pdf",
      "Content-Disposition": attachment(result.fileName),
      "Content-Length": String(pdf.length),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
