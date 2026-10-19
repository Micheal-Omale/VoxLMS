import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import type { ReportCardModel } from "@/lib/report-card";

import { ReportCardDocument } from "./report-card-document";

/** Page objects in a PDF file: `/Type /Page`, never the `/Pages` tree nodes. */
export function countPdfPages(pdf: Buffer): number {
  return pdf.toString("latin1").match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0;
}

/**
 * Renders the cards to one PDF and counts its pages (AC-10). `fits` is false
 * when any card spilled onto a second page; the caller must then send nothing.
 */
export async function renderReportCards(cards: ReportCardModel[], title: string) {
  const pdf = await renderToBuffer(createElement(ReportCardDocument, { cards, title }));
  const pages = countPdfPages(pdf);
  return { pdf, pages, fits: pages === cards.length };
}
