import { renderReportCards } from "@/components/report-card/render";
import { buildReportCards } from "@/lib/report-card";

import { worstCaseInput } from "./worst-case";

// The report card preview (spec 0012, AC-14): the worst case class on made up
// data, shown in the browser. ?plan=basic|school_logo and ?parts=1 to 5.
// Route handlers skip the design layout, so this checks the production rule itself.

export const maxDuration = 60;

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_DESIGN_PREVIEWS !== "1") {
    return new Response("Not found", { status: 404 });
  }
  const query = new URL(request.url).searchParams;
  const plan = query.get("plan") === "basic" ? "basic" : "school_logo";
  const parts = Math.min(5, Math.max(1, Number.parseInt(query.get("parts") ?? "5", 10) || 5));

  const cards = buildReportCards(worstCaseInput({ parts, plan }), new Date());
  const { pdf, pages } = await renderReportCards(cards, `Report card preview, ${plan}, ${parts} parts`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="report-card-preview-${plan}-${parts}.pdf"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Page-Count": `${pages} pages for ${cards.length} cards`,
    },
  });
}
