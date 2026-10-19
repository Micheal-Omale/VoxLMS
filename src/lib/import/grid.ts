// The shape every uploaded file is read into (spec 0013), whichever reader
// read it, and the limits that apply to all of them. Pure.

/** A cell as the import sees it. Blank cells are null. */
export type Cell =
  | { kind: "text"; text: string }
  /** Excel stored it as a number; `text` is its digits as shown. */
  | { kind: "number"; text: string }
  /** Something a text field can't take: a date, TRUE/FALSE, an error like #N/A, or a formula with no result. */
  | { kind: "bad"; problem: "date" | "boolean" | "error" | "no_result"; shown: string };

/** One row of a sheet, with its real Excel row number (or CSV record number). */
export type SheetRow = { n: number; cells: (Cell | null)[] };

/** The sheet the import reads: its header row and the data rows under it (blank rows already skipped). */
export type Grid = { sheet: string; headerRow: number; header: (Cell | null)[]; rows: SheetRow[] };

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 1500;
export const MAX_COLUMNS = 40;
export const MAX_SHEETS = 10;
/** The header row must be within the sheet's first 10 rows. */
export const HEADER_WITHIN = 10;

export type ImportRefusalCode =
  | "too_large"
  | "not_spreadsheet"
  | "old_excel"
  | "not_utf8"
  | "missing_column"
  | "duplicate_column"
  | "too_many_rows";

/** The whole file is refused, with the reason in plain words. */
export class ImportRefused extends Error {
  constructor(
    public readonly code: ImportRefusalCode,
    message: string,
  ) {
    super(message);
  }
}

export const SPLIT_IT = "Split it by section and upload each part.";

export const tooManyRows = () => new ImportRefused("too_many_rows", `This file has more than ${MAX_ROWS.toLocaleString("en-NG")} rows. ${SPLIT_IT}`);

export const cellText = (cell: Cell | null | undefined) => (cell && cell.kind !== "bad" ? cell.text : "");

const isBlank = (cells: (Cell | null)[]) => cells.every((c) => c === null);

/**
 * Picks the sheet to read (AC-3): the first, in tab order, with a header row
 * within its first 10 rows, and keeps its non blank rows. Stops reading a
 * sheet as soon as it can't have a header, and stops for good once the chosen
 * sheet ends or passes the row limit, so a huge sheet costs little.
 */
export async function collectGrid(
  sheets: AsyncIterable<{ name: string; rows: AsyncIterable<SheetRow> }>,
  isHeader: (cells: (Cell | null)[]) => boolean,
): Promise<Grid | null> {
  let read = 0;
  for await (const sheet of sheets) {
    if (++read > MAX_SHEETS) return null;
    let grid: Grid | null = null;
    for await (const row of sheet.rows) {
      const cells = row.cells.slice(0, MAX_COLUMNS);
      if (isBlank(cells)) continue;
      if (!grid) {
        if (row.n > HEADER_WITHIN) break;
        if (isHeader(cells)) grid = { sheet: sheet.name, headerRow: row.n, header: cells, rows: [] };
        continue;
      }
      if (grid.rows.length === MAX_ROWS) throw tooManyRows();
      grid.rows.push({ n: row.n, cells });
    }
    if (grid) return grid;
  }
  return null;
}

/** Spreadsheet column letters: 0 → A, 26 → AA. */
export function columnLetter(index: number) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    letters = String.fromCharCode(65 + r) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** "A and B", "A, B and C". */
export function andList(items: (string | number)[]) {
  const list = items.map(String);
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}
