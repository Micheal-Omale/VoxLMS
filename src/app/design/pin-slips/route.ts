import { renderPinSlips } from "@/components/pin-slips/render";
import type { PinSlip } from "@/lib/result-pin";

// Design preview: 45 PIN slips on made-up data with the longest real names (spec 0014, AC-22).
// Returns 404 in production unless SHOW_DESIGN_PREVIEWS=1.

export const maxDuration = 60;

const slip = (i: number): PinSlip => ({
  school: "Government Secondary School Comprehensive Model College of Science and Technology, Ikot Ekpene Road",
  heading: "Result PIN · First Term, 2026/2027",
  student: `OKONKWO-ADEBAYO Chukwuemeka Oluwaseun Babatunde Ifeanyichukwu ${i + 1} · JSS 2 Gold`,
  pin: "4821 0937 5512",
  serial: `Serial TSA ${String(i + 1).padStart(6, "0")}`,
  checkAt: "Check the result at voxlms.com/result",
});

export async function GET() {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_DESIGN_PREVIEWS !== "1") {
    return new Response("Not found", { status: 404 });
  }

  const slips = Array.from({ length: 45 }, (_, i) => slip(i));
  const { pdf, pages } = await renderPinSlips(slips, "Design preview: 45 PIN slips");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="pin-slips-preview.pdf"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Page-Count": `${pages} pages for ${slips.length} slips`,
    },
  });
}
