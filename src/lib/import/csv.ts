// Our own small CSV reader (spec 0013, AC-2). Excel's CSV import (and
// ExcelJS's) turns text like 00123 into numbers and dates; here every cell
// stays text. UTF-8 only, with or without a byte order mark; commas or
// semicolons, found from the first lines; quoted fields may hold either, and
// line breaks.

import { cleanText } from "./cells";
import { type Cell, ImportRefused, MAX_COLUMNS, type SheetRow } from "./grid";

export const notUtf8 = () =>
  new ImportRefused("not_utf8", "This CSV file isn't saved as UTF-8, so names with accents would come out wrong. In Excel, choose Save As, then CSV UTF-8 (comma delimited).");

/** The file's text, or refused when it isn't valid UTF-8 (Excel's plain "CSV" save is Windows-1252). */
export function decodeCsv(bytes: Uint8Array) {
  try {
    // A byte order mark is dropped by the decoder.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw notUtf8();
  }
}

/** Comma or semicolon: whichever the first lines use more, outside quotes. */
export function findDelimiter(text: string): "," | ";" {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  let lines = 0;
  for (let i = 0; i < text.length && lines < 10; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (ch === ",") commas++;
    else if (ch === ";") semicolons++;
    else if (ch === "\n") lines++;
  }
  return semicolons > commas ? ";" : ",";
}

/** Every record as raw field text, numbered from 1 as Excel numbers the rows it opens. */
export function* csvRecords(text: string): Generator<{ n: number; fields: string[] }> {
  const delimiter = findDelimiter(text);
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let n = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      fields.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      fields.push(field);
      yield { n: n++, fields };
      fields = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || fields.length > 0) {
    fields.push(field);
    yield { n, fields };
  }
}

/** The CSV's rows as import cells: all text, never numbers or dates. */
export async function* csvRows(text: string): AsyncGenerator<SheetRow> {
  for (const record of csvRecords(text)) {
    const cells: (Cell | null)[] = record.fields.slice(0, MAX_COLUMNS).map((raw) => {
      const value = cleanText(raw);
      return value ? { kind: "text", text: value } : null;
    });
    yield { n: record.n, cells };
  }
}
