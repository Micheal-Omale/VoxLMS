import fs from "node:fs";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportRefused, MAX_ROWS } from "@/lib/import/grid";
import { readWorkbook } from "@/server/import/read-workbook";

// Reading uploaded files (spec 0013, AC-2, AC-3): .xlsx through ExcelJS's
// streaming reader, CSV through our own, everything else refused.

const NBSP = String.fromCharCode(0xa0);

async function xlsx(build: (wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const utf8 = (text: string) => new TextEncoder().encode(text);

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ImportRefused) return error.code;
    throw error;
  }
  throw new Error("expected a refusal");
}

afterEach(() => vi.restoreAllMocks());

describe("readWorkbook", () => {
  it("reads an .xlsx as shown in Excel, without writing anything to disk", async () => {
    const toDisk = vi.spyOn(fs, "createWriteStream");
    const bytes = await xlsx((wb) => {
      const ws = wb.addWorksheet("Register");
      ws.addRow(["GRACE HIGH SCHOOL 2026/2027 REGISTER"]);
      ws.addRow(["Surname", "Other names", "Gender", "Class", "Admission no", "Parent phone", "Parent name"]);
      const r = ws.addRow(["OKAFOR", "Chinedu", "M", "JSS 2 Gold", 15, 8031234567, { formula: "UPPER(\"ngozi okafor\")", result: "NGOZI OKAFOR" }]);
      r.getCell(5).numFmt = "00000";
      ws.addRow(["ADE", `Bola${NBSP}Funmi`, "F", "JSS 2 Gold", `GHS${NBSP}016`, { error: "#N/A" }, null]);
      ws.addRow([]);
      ws.addRow(["UDO", "Grace", "F", { richText: [{ text: "JSS 2 " }, { text: "Gold" }] }, null, null, null]);
    });
    const grid = await readWorkbook(bytes, "register.xlsx", "students");
    expect(toDisk).not.toHaveBeenCalled();
    expect(grid).toMatchObject({ sheet: "Register", headerRow: 2 });
    expect(grid.rows.map((r) => r.n)).toEqual([3, 4, 6]);
    expect(grid.rows[0].cells).toEqual([
      { kind: "text", text: "OKAFOR" },
      { kind: "text", text: "Chinedu" },
      { kind: "text", text: "M" },
      { kind: "text", text: "JSS 2 Gold" },
      { kind: "number", text: "00015" },
      { kind: "number", text: "8031234567" },
      { kind: "text", text: "NGOZI OKAFOR" },
    ]);
    expect(grid.rows[1].cells[1]).toEqual({ kind: "text", text: "Bola Funmi" });
    expect(grid.rows[1].cells[4]).toEqual({ kind: "text", text: "GHS 016" });
    expect(grid.rows[1].cells[5]).toMatchObject({ kind: "bad", problem: "error", shown: "#N/A" });
    expect(grid.rows[2].cells[3]).toEqual({ kind: "text", text: "JSS 2 Gold" });
  });

  it("takes the first visible sheet in tab order with a header, and reads dates as problems", async () => {
    const bytes = await xlsx((wb) => {
      wb.addWorksheet("Lists", { state: "hidden" }).addRow(["Name", "Gender", "Class"]);
      wb.addWorksheet("Cover").addRow(["Fill in the next sheet"]);
      const reg = wb.addWorksheet("JSS 1");
      reg.addRow(["Name", "Sex", "Class"]);
      reg.addRow([new Date("2014-03-02"), true, "JSS 1"]);
    });
    const grid = await readWorkbook(bytes, "register.xlsx", "students");
    expect(grid.sheet).toBe("JSS 1");
    expect(grid.rows[0].cells.slice(0, 2)).toEqual([expect.objectContaining({ problem: "date" }), expect.objectContaining({ problem: "boolean", shown: "TRUE" })]);
  });

  it("refuses more than 1,500 rows under the header", async () => {
    const bytes = await xlsx((wb) => {
      const ws = wb.addWorksheet("S");
      ws.addRow(["Name", "Gender", "Class"]);
      for (let i = 0; i <= MAX_ROWS; i++) ws.addRow([`OKAFOR Child${i}`, "M", "JSS 1"]);
    });
    expect(await refusal(readWorkbook(bytes, "big.xlsx", "students"))).toBe("too_many_rows");
  });

  it("reads a semicolon CSV with a byte order mark, keeping 00123 as text", async () => {
    const bytes = utf8(String.fromCharCode(0xfeff) + "Surname;Other names;Gender;Class;Admission no\nOKAFOR;Chinedu;M;JSS 1 Gold;00123\n");
    const grid = await readWorkbook(bytes, "register.csv", "students");
    expect(grid.rows[0]).toEqual({
      n: 2,
      cells: ["OKAFOR", "Chinedu", "M", "JSS 1 Gold", "00123"].map((text) => ({ kind: "text", text })),
    });
  });

  it("refuses old Excel files, Windows-1252 CSV, other files and a sheet with no headings", async () => {
    expect(await refusal(readWorkbook(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "register.xls", "students"))).toBe("old_excel");
    expect(await refusal(readWorkbook(new Uint8Array([0x4e, 0x61, 0x6d, 0x65, 0x2c, 0xc9, 0x6d, 0x65]), "register.csv", "students"))).toBe("not_utf8");
    expect(await refusal(readWorkbook(utf8("%PDF-1.7\n\0\0"), "register.pdf", "students"))).toBe("not_spreadsheet");
    expect(await refusal(readWorkbook(utf8("Name,Gender,Class\n"), "register.docx", "students"))).toBe("not_spreadsheet");
    expect(await refusal(readWorkbook(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "register.xlsx", "students"))).toBe("not_spreadsheet");
    expect(await refusal(readWorkbook(utf8("just,some,words\n1,2,3\n"), "register.csv", "students"))).toBe("missing_column");
  });
});
