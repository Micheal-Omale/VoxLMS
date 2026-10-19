// Every value shape ExcelJS gives for a cell, turned into what the import
// reads (spec 0013, AC-2): the text as shown in Excel, or a reason the cell
// can't be a text field. Pure: takes plain values, never imports ExcelJS.

import type { Cell } from "./grid";

// Non breaking spaces (Word and web pages paste them) and zero width
// characters become plain spaces, once, here, before anything compares text.
const ODD_SPACES = /[\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\u3000\uFEFF]/g;

/** Text as the import compares it: odd spaces made plain, trimmed, inner spaces collapsed. */
export const cleanText = (text: string) => text.replace(ODD_SPACES, " ").replace(/\s+/g, " ").trim();

const textCell = (raw: string): Cell | null => {
  const text = cleanText(raw);
  return text ? { kind: "text", text } : null;
};

/** A number format that is only zeros (00000) pads whole numbers to that many digits. */
const PADDING = /^0+$/;

/** True for a number format that shows a date or time (d, m, y, h, s outside quotes and brackets). */
export function isDateFormat(numFmt: string | undefined) {
  if (!numFmt || numFmt === "General") return false;
  const bare = numFmt.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(bare);
}

/** A number's digits as Excel shows them in a General cell: no ".0", no scientific notation. */
export function numberText(value: number, numFmt?: string) {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) {
    const digits = BigInt(value).toString();
    return numFmt && PADDING.test(numFmt) && value >= 0 ? digits.padStart(numFmt.length, "0") : digits;
  }
  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 15 });
}

type RichText = { richText: { text: string }[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * One ExcelJS cell value (with the cell's number format) as an import cell.
 * Handles plain text, numbers, dates, TRUE/FALSE, rich text, links, formulas
 * (their cached result) and errors such as #N/A.
 */
export function cellFromExcel(value: unknown, numFmt?: string): Cell | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return textCell(value);
  if (typeof value === "number") {
    if (isDateFormat(numFmt)) return { kind: "bad", problem: "date", shown: numberText(value) };
    return { kind: "number", text: numberText(value, numFmt) };
  }
  if (typeof value === "boolean") return { kind: "bad", problem: "boolean", shown: value ? "TRUE" : "FALSE" };
  if (value instanceof Date) return { kind: "bad", problem: "date", shown: value.toISOString().slice(0, 10) };
  if (!isObject(value)) return textCell(String(value));

  if (Array.isArray((value as RichText).richText)) return textCell((value as RichText).richText.map((r) => r.text ?? "").join(""));
  if (typeof value.error === "string") return { kind: "bad", problem: "error", shown: value.error };
  if ("formula" in value || "sharedFormula" in value) {
    const result = value.result;
    if (result === undefined || result === null) return { kind: "bad", problem: "no_result", shown: String(value.formula ?? value.sharedFormula ?? "") };
    return cellFromExcel(result, numFmt);
  }
  // A link: its text is what Excel shows.
  if ("hyperlink" in value || "text" in value) return cellFromExcel(value.text, numFmt);
  return null;
}

/** What a bad cell means, in plain words, for the field it is in. */
export function badCellProblem(field: string, cell: Extract<Cell, { kind: "bad" }>) {
  switch (cell.problem) {
    case "date":
      return `${field} is a date in Excel. Format the column as Text and type it again.`;
    case "boolean":
      return `${field} is ${cell.shown} in Excel. Type it as text.`;
    case "error":
      return `${field} shows the Excel error ${cell.shown}. Fix the formula or type the value in.`;
    case "no_result":
      return `${field} is a formula with no result. Open the file in Excel, let it calculate, and save it again.`;
  }
}
