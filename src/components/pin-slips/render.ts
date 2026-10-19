import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import { countPdfPages } from "@/components/report-card/render";
import { type PinSlip, SLIPS_PER_PAGE } from "@/lib/result-pin";

import { PinSlipsDocument } from "./pin-slips-document";

/** Renders slips 10 to a page and counts the pages (AC-8). `fits` is false when the count is not ceil(slips / 10). */
export async function renderPinSlips(slips: PinSlip[], title: string) {
  const pdf = await renderToBuffer(createElement(PinSlipsDocument, { slips, title }));
  const pages = countPdfPages(pdf);
  return { pdf, pages, fits: pages === Math.ceil(slips.length / SLIPS_PER_PAGE) };
}
