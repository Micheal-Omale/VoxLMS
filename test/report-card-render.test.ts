import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { worstCaseInput } from "@/app/design/report-card/worst-case";
import { countPdfPages, renderReportCards } from "@/components/report-card/render";
import { buildReportCards } from "@/lib/report-card";

// Spec 0012, AC-9, AC-10, AC-13: the card renders one page per student even in
// the worst case class, and the images and font embed once.

const TODAY = new Date("2026-10-18T09:00:00Z");

describe("the worst case class fits (AC-10)", () => {
  for (const plan of ["school_logo", "basic"] as const) {
    for (const parts of [1, 3, 5]) {
      it(`45 students, ${parts} parts, ${plan} plan: 45 pages`, async () => {
        const cards = buildReportCards(worstCaseInput({ parts, plan }), TODAY);
        const { pdf, pages, fits } = await renderReportCards(cards, "Worst case");
        if (process.env.REPORT_CARD_OUT) writeFileSync(`${process.env.REPORT_CARD_OUT}/worst-${plan}-${parts}.pdf`, pdf);
        expect(cards).toHaveLength(45);
        expect(pages).toBe(45);
        expect(fits).toBe(true);
      });
    }
  }

  it("a card made to overflow fails the page count check", async () => {
    const [card] = buildReportCards(worstCaseInput({ students: 1 }), TODAY);
    const long = { ...card, rows: [...card.rows, ...card.rows, ...card.rows] };
    const { pages, fits } = await renderReportCards([long], "Overflow");
    expect(pages).toBeGreaterThan(1);
    expect(fits).toBe(false);
  });
});

describe("file size (AC-13)", () => {
  it("45 students stay under 2 MB, and one more adds under 30 KB", async () => {
    const at45 = await renderReportCards(buildReportCards(worstCaseInput({ students: 45 }), TODAY), "45");
    const at46 = await renderReportCards(buildReportCards(worstCaseInput({ students: 46 }), TODAY), "46");
    expect(at45.pdf.length).toBeLessThan(2 * 1024 * 1024);
    expect(at46.pdf.length - at45.pdf.length).toBeLessThan(30 * 1024);
  });

  it("embeds the logo, the signature and each font once, however many cards", async () => {
    const count = async (students: number) => {
      const { pdf } = await renderReportCards(buildReportCards(worstCaseInput({ students }), TODAY), "Count");
      const text = pdf.toString("latin1");
      // A PNG with transparency is an image plus its mask, both image objects.
      return { images: text.match(/\/Subtype\s*\/Image/g)?.length, fonts: text.match(/\/Type\s*\/FontDescriptor/g)?.length };
    };
    const one = await count(1);
    expect(await count(5)).toEqual(one);
    expect(one.fonts).toBe(2);
  });
});

describe("countPdfPages", () => {
  it("counts page objects, not the page tree", () => {
    expect(countPdfPages(Buffer.from("<< /Type /Pages /Kids [] >> << /Type /Page >> << /Type/Page >>"))).toBe(2);
  });
});
