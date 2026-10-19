import "server-only";

import { Readable } from "node:stream";

import ExcelJS from "exceljs";
import JSZip from "jszip";

import { cellFromExcel } from "@/lib/import/cells";
import { type ImportKind, isHeaderRow } from "@/lib/import/columns";
import { csvRows, decodeCsv } from "@/lib/import/csv";
import { type Cell, collectGrid, type Grid, ImportRefused, MAX_COLUMNS, MAX_SHEETS, type SheetRow, SPLIT_IT } from "@/lib/import/grid";

// Reads an uploaded register into a grid (spec 0013, AC-2, AC-3). The reader
// is picked by the file's first bytes, never its name: a zip is an .xlsx for
// ExcelJS, the old Excel signature is refused, and anything else must be
// UTF-8 text for our own CSV reader. The bytes stay in memory: nothing is
// written to disk.

/** Every part of the workbook, unpacked, may total this much; more is a zip bomb or a far too big file. */
const MAX_UNPACKED = 64 * 1024 * 1024;

const notSpreadsheet = () => new ImportRefused("not_spreadsheet", "This isn’t an Excel or CSV file. Save the register from Excel as .xlsx, or as CSV UTF-8, and upload that.");
const oldExcel = () => new ImportRefused("old_excel", "This is an old Excel file. Open it in Excel and save it as .xlsx.");
const tooLarge = () => new ImportRefused("too_large", `This file is too large. ${SPLIT_IT}`);

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

const HEADINGS: Record<ImportKind, string> = {
  students: "Surname, Other names, Gender and Class",
  teachers: "Name, Phone and Form class",
};

/**
 * The sheet to import and its rows, or refused with a code the screen acts on
 * (old_excel, not_spreadsheet, not_utf8, too_large, too_many_rows, missing_column).
 */
export async function readWorkbook(bytes: Uint8Array, fileName: string, kind: ImportKind): Promise<Grid> {
  const isHeader = (cells: (Cell | null)[]) => isHeaderRow(kind, cells);
  let grid: Grid | null;
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) grid = await readXlsx(bytes, isHeader);
  else if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) throw oldExcel();
  else if (bytes.length === 0 || looksBinary(bytes) || !/\.(csv|txt)$/i.test(fileName)) throw notSpreadsheet();
  else {
    const text = decodeCsv(bytes);
    const name = fileName.replace(/\.[^.]+$/, "");
    grid = await collectGrid(
      (async function* () {
        yield { name, rows: csvRows(text) };
      })(),
      isHeader,
    );
  }
  if (!grid) throw new ImportRefused("missing_column", `We couldn’t find the column headings in the first 10 rows. One row near the top should have headings like ${HEADINGS[kind]}.`);
  return grid;
}

/** Text files have no zero bytes; PDFs, images and Unicode Text (UTF-16) saves do. */
function looksBinary(bytes: Uint8Array) {
  const end = Math.min(bytes.length, 8192);
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true;
  return false;
}

// ---------- .xlsx ----------

const decode = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes);

/** One part of the zip, unpacked, counted against the file's budget. */
function unpack(file: JSZip.JSZipObject, budget: { left: number }): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = file.nodeStream("nodebuffer");
    stream
      .on("data", (chunk: Buffer) => {
        budget.left -= chunk.length;
        if (budget.left < 0) {
          stream.pause();
          reject(tooLarge());
          return;
        }
        chunks.push(chunk);
      })
      .on("error", () => reject(notSpreadsheet()))
      .on("end", () => resolve(Buffer.concat(chunks)));
  });
}

const attribute = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** The workbook's relationships: id → type and the part's path in the zip. */
function parseRelationships(xml: string) {
  const rels = new Map<string, { type: string; path: string }>();
  for (const [tag] of xml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const id = attribute(tag, "Id");
    const type = attribute(tag, "Type") ?? "";
    const target = attribute(tag, "Target");
    if (!id || !target) continue;
    rels.set(id, { type, path: target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}` });
  }
  return rels;
}

/** The workbook's sheets in tab order, with their (still XML escaped) names. */
function parseSheets(xml: string) {
  return [...xml.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map(([tag]) => ({
    name: attribute(tag, "name") ?? "Sheet",
    relId: /\s\w+:id="([^"]*)"/.exec(tag)?.[1],
    state: attribute(tag, "state") ?? "visible",
  }));
}

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/**
 * ExcelJS's streaming reader writes a sheet to a temporary file whenever the
 * sheet comes before the shared strings in the zip, which is how Excel saves.
 * So the parts it needs are repacked, in memory, in the order it reads best:
 * relationships, workbook, styles, shared strings, then the visible sheets in
 * tab order. Then it streams, and stops as soon as the import has what it needs.
 */
async function readXlsx(bytes: Uint8Array, isHeader: (cells: (Cell | null)[]) => boolean): Promise<Grid | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw notSpreadsheet();
  }
  const workbookPart = zip.file("xl/workbook.xml");
  const relsPart = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookPart || !relsPart) throw notSpreadsheet();

  const budget = { left: MAX_UNPACKED };
  const workbookXml = decode(await unpack(workbookPart, budget));
  const rels = parseRelationships(decode(await unpack(relsPart, budget)));
  const partOf = (type: string) => [...rels.values()].find((r) => r.type.endsWith(`/${type}`))?.path;
  const sheets = parseSheets(workbookXml)
    .filter((s) => s.state === "visible")
    .map((s) => ({ ...s, rel: s.relId ? rels.get(s.relId) : undefined }))
    .filter((s) => s.rel?.type.endsWith("/worksheet") && zip.file(s.rel.path))
    .slice(0, MAX_SHEETS);

  const store = { compression: "STORE" as const };
  const out = new JSZip();
  out.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_RELS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}</Relationships>`,
    store,
  );
  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\sdate1904="(?:1|true)"/.test(workbookXml);
  out.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS_MAIN}" xmlns:r="${NS_RELS}">${date1904 ? '<workbookPr date1904="1"/>' : ""}<sheets>${sheets
      .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
    store,
  );
  const stylesPath = partOf("styles");
  const stylesPart = stylesPath ? zip.file(stylesPath) : null;
  if (stylesPart) out.file("xl/styles.xml", await unpack(stylesPart, budget), store);
  const stringsPath = partOf("sharedStrings");
  const stringsPart = stringsPath ? zip.file(stringsPath) : null;
  // Always present, so the reader never waits for it (and never spills a sheet to disk).
  out.file("xl/sharedStrings.xml", stringsPart ? await unpack(stringsPart, budget) : `<sst xmlns="${NS_MAIN}" count="0" uniqueCount="0"/>`, store);
  for (const [i, s] of sheets.entries()) out.file(`xl/worksheets/sheet${i + 1}.xml`, await unpack(zip.file(s.rel!.path)!, budget), store);

  const repacked = await out.generateAsync({ type: "nodebuffer", compression: "STORE" });
  const input = Readable.from([repacked]);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(input, {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
    entries: "ignore",
  });
  try {
    return await collectGrid(sheetsOf(reader), isHeader);
  } catch (error) {
    if (error instanceof ImportRefused) throw error;
    throw notSpreadsheet();
  } finally {
    input.destroy();
  }
}

async function* sheetsOf(reader: ExcelJS.stream.xlsx.WorkbookReader) {
  for await (const sheet of reader) {
    yield { name: (sheet as unknown as { name?: string }).name ?? "Sheet", rows: rowsOf(sheet) };
  }
}

async function* rowsOf(sheet: ExcelJS.stream.xlsx.WorksheetReader): AsyncGenerator<SheetRow> {
  for await (const row of sheet) {
    const cells: (Cell | null)[] = [];
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      if (column <= MAX_COLUMNS) cells[column - 1] = cellFromExcel(cell.value, cell.numFmt);
    });
    yield { n: row.number, cells: Array.from(cells, (c) => c ?? null) };
  }
}
