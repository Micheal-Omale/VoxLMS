import { describe, expect, it } from "vitest";

import { nextGuardianLink } from "@/lib/enrolment-rules";
import { cellFromExcel, cleanText, isDateFormat, numberText } from "@/lib/import/cells";
import { classProblem, matchClass, type ClassOption } from "@/lib/import/classes";
import { headerKey, isHeaderRow, mapColumns } from "@/lib/import/columns";
import { csvRecords, csvRows, decodeCsv, findDelimiter } from "@/lib/import/csv";
import { type Cell, collectGrid, columnLetter, type Grid, ImportRefused, MAX_ROWS, type SheetRow } from "@/lib/import/grid";
import { parentNameKey, splitStudentName, splitTitle, studentNameKey } from "@/lib/import/names";
import { parseStudentRows } from "@/lib/import/students";
import { parseTeacherRows } from "@/lib/import/teachers";

// The pure import core (spec 0013): cells, CSV, headers, names, classes and
// the row checks within a file. The database side is in import-data.test.ts.

const t = (text: string): Cell => ({ kind: "text", text });
const row = (n: number, ...texts: (string | null)[]): SheetRow => ({ n, cells: texts.map((x) => (x === null ? null : t(x))) });
const NBSP = String.fromCharCode(0xa0);
const ZWSP = String.fromCharCode(0x200b);

async function* sheetsOf(...sheets: { name: string; rows: SheetRow[] }[]) {
  for (const s of sheets) {
    yield {
      name: s.name,
      rows: (async function* () {
        for (const r of s.rows) yield r;
      })(),
    };
  }
}

function grid(header: string[], ...rows: (string | null)[][]): Grid {
  return { sheet: "Sheet1", headerRow: 1, header: header.map(t), rows: rows.map((cells, i) => row(i + 2, ...cells)) };
}

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ImportRefused) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error("expected a refusal");
};

describe("cells (AC-2)", () => {
  it("cleans odd spaces once, trims and collapses", () => {
    expect(cleanText(`  GHS/24${NBSP}015 `)).toBe("GHS/24 015");
    expect(cleanText(`OKAFOR${ZWSP}Chinedu`)).toBe("OKAFOR Chinedu");
    expect(cleanText("Ngozi\n  Okafor")).toBe("Ngozi Okafor");
  });

  it("reads numbers as their digits, padded by a zeros format", () => {
    expect(numberText(8031234567)).toBe("8031234567");
    expect(numberText(1e21)).toBe("1000000000000000000000");
    expect(numberText(15, "00000")).toBe("00015");
    expect(numberText(2.5)).toBe("2.5");
    expect(cellFromExcel(123, "General")).toEqual({ kind: "number", text: "123" });
  });

  it("makes dates, TRUE/FALSE, errors and formulas without a result into problems", () => {
    expect(cellFromExcel(new Date("2014-03-02"))).toMatchObject({ kind: "bad", problem: "date" });
    expect(cellFromExcel(45000, "dd/mm/yyyy")).toMatchObject({ kind: "bad", problem: "date" });
    expect(cellFromExcel(true)).toMatchObject({ kind: "bad", problem: "boolean", shown: "TRUE" });
    expect(cellFromExcel({ error: "#N/A" })).toMatchObject({ kind: "bad", problem: "error", shown: "#N/A" });
    expect(cellFromExcel({ formula: "A1&B1" })).toMatchObject({ kind: "bad", problem: "no_result" });
  });

  it("gives a formula's cached result, rich text's text and a link's text", () => {
    expect(cellFromExcel({ formula: "UPPER(A2)", result: "OKAFOR" })).toEqual(t("OKAFOR"));
    expect(cellFromExcel({ sharedFormula: "B2", result: 8031234567 })).toEqual({ kind: "number", text: "8031234567" });
    expect(cellFromExcel({ richText: [{ text: "OKA" }, { text: "FOR" }] })).toEqual(t("OKAFOR"));
    expect(cellFromExcel({ text: "Ngozi Okafor", hyperlink: "mailto:x@y.z" })).toEqual(t("Ngozi Okafor"));
    expect(cellFromExcel("   ")).toBeNull();
  });

  it("knows date formats from text formats", () => {
    expect(isDateFormat("d-mmm-yy")).toBe(true);
    expect(isDateFormat("h:mm")).toBe(true);
    expect(isDateFormat("General")).toBe(false);
    expect(isDateFormat("00000")).toBe(false);
    expect(isDateFormat('"Adm "0')).toBe(false);
  });
});

describe("CSV (AC-2)", () => {
  it("refuses text that isn't UTF-8 and drops a byte order mark", () => {
    const windows1252 = new Uint8Array([0x4f, 0x4b, 0x41, 0x46, 0x4f, 0x52, 0x2c, 0xc9, 0x6d, 0x65]); // "OKAFOR,Éme" in Windows-1252
    expect(() => decodeCsv(windows1252)).toThrow(ImportRefused);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x3b, 0x62]);
    expect(decodeCsv(bom)).toBe("a;b");
  });

  it("finds commas or semicolons from the first lines, outside quotes", () => {
    expect(findDelimiter("Surname;Other names;Gender\nOKAFOR;Chinedu;M")).toBe(";");
    expect(findDelimiter('"A;B;C",x\n1,2')).toBe(",");
  });

  it("keeps every cell as text, with quoted fields, line breaks and record numbers", async () => {
    const text = 'Surname,Admission no,Address\nOKAFOR,00123,"12 Ada Street,\nLagos"\r\n"ADE ""JR""",007,\n';
    expect([...csvRecords(text)].map((r) => r.fields)).toEqual([
      ["Surname", "Admission no", "Address"],
      ["OKAFOR", "00123", "12 Ada Street,\nLagos"],
      ['ADE "JR"', "007", ""],
    ]);
    const rows: SheetRow[] = [];
    for await (const r of csvRows(text)) rows.push(r);
    expect(rows[1]).toEqual({ n: 2, cells: [t("OKAFOR"), t("00123"), t("12 Ada Street, Lagos")] });
    expect(rows[2].cells[2]).toBeNull();
  });
});

describe("headers (AC-3)", () => {
  it("compares letters and digits, ignoring case and a trailing s", () => {
    expect(headerKey("Adm. No.")).toBe(headerKey("Adm no"));
    expect(headerKey("OTHER NAMES")).toBe(headerKey("Other name"));
    expect(headerKey("Classes")).not.toBe(headerKey("Class"));
  });

  it("skips title rows and reads the first sheet with a header row in its first 10 rows", async () => {
    const result = await collectGrid(
      sheetsOf(
        { name: "Notes", rows: [row(1, "Read me first"), row(2, "Fill in the register")] },
        { name: "Register", rows: [row(1, "GRACE HIGH SCHOOL 2026/2027 REGISTER"), row(3, "S/N", "Name", "Sex", "Class"), row(4, "1", "OKAFOR Chinedu", "M", "JSS 1 Gold"), row(6, null, null) ] },
      ),
      (cells) => isHeaderRow("students", cells),
    );
    expect(result).toMatchObject({ sheet: "Register", headerRow: 3 });
    expect(result!.rows.map((r) => r.n)).toEqual([4]);
  });

  it("ignores a header below row 10 and refuses more than 1,500 rows", async () => {
    const late = await collectGrid(sheetsOf({ name: "S", rows: [row(11, "Name", "Gender", "Class")] }), (c) => isHeaderRow("students", c));
    expect(late).toBeNull();
    const rows = [row(1, "Name", "Gender", "Class"), ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => row(i + 2, `A B${i}`, "M", "JSS 1"))];
    await expect(collectGrid(sheetsOf({ name: "S", rows }), (c) => isHeaderRow("students", c))).rejects.toMatchObject({ code: "too_many_rows" });
    const exactly = await collectGrid(sheetsOf({ name: "S", rows: rows.slice(0, MAX_ROWS + 1) }), (c) => isHeaderRow("students", c));
    expect(exactly!.rows).toHaveLength(MAX_ROWS);
  });

  it("maps columns in any order and lists the ones it ignores", () => {
    const map = mapColumns("students", ["S/N", "Sex", "Class", "Other Names", "SURNAME", "Adm. No.", "Parent's Name", "GSM"].map(t));
    expect(map.columns).toMatchObject({ gender: 1, className: 2, otherNames: 3, surname: 4, admissionNo: 5, parent1Name: 6, parent1Phone: 7 });
    expect(map.ignored).toEqual(["S/N"]);
    expect(map.used[0]).toEqual({ column: "B", header: "Sex", field: "Gender" });
  });

  it("prefers Surname with Other names over Name", () => {
    const map = mapColumns("students", ["Name", "Surname", "Other names", "Gender", "Class"].map(t));
    expect(map.columns.name).toBeUndefined();
    expect(map.ignored).toEqual(["Name"]);
  });

  it("refuses a missing required column, naming it and the headers read", () => {
    expect(refusal(() => mapColumns("students", ["Name", "Class"].map(t)))).toEqual({
      code: "missing_column",
      message: "No Gender column found. The headers we read were: Name, Class.",
    });
    expect(refusal(() => mapColumns("students", ["Surname", "Gender", "Class"].map(t))).message).toMatch(/^No Other names column/);
    expect(refusal(() => mapColumns("teachers", ["Name", "Form class"].map(t))).message).toMatch(/^No Phone column/);
  });

  it("refuses two columns for one field, naming them", () => {
    expect(refusal(() => mapColumns("students", ["Name", "Gender", "Phone", "Class", "x", "GSM"].map(t)))).toEqual({
      code: "duplicate_column",
      message: "Columns C and F both look like Parent phone. Rename one.",
    });
  });

  it("reads Class as the form class in a teacher file", () => {
    expect(mapColumns("teachers", ["Title", "Name", "Phone", "Class"].map(t)).columns).toEqual({ title: 0, fullName: 1, phone: 2, formClass: 3 });
    expect(columnLetter(26)).toBe("AA");
  });
});

describe("names (AC-4, AC-7, AC-11)", () => {
  it("splits one Name column at the first comma, else the first space", () => {
    expect(splitStudentName("OKAFOR Chinedu Emmanuel")).toEqual({ surname: "OKAFOR", otherNames: "Chinedu Emmanuel" });
    expect(splitStudentName("Okafor, Chinedu Emmanuel")).toEqual({ surname: "Okafor", otherNames: "Chinedu Emmanuel" });
    expect(splitStudentName("Chinedu")).toEqual({ surname: "Chinedu", otherNames: "" });
  });

  it("splits a leading title off a name", () => {
    expect(splitTitle("Mrs. Ngozi Okafor")).toEqual({ title: "Mrs", name: "Ngozi Okafor" });
    expect(splitTitle("ALHAJI Musa Bello")).toEqual({ title: "Alhaji", name: "Musa Bello" });
    expect(splitTitle("Drake Okon")).toEqual({ title: null, name: "Drake Okon" });
  });

  it("compares parents ignoring case, spaces and a title, and students ignoring case and spaces", () => {
    expect(parentNameKey("Mrs Ngozi Okafor")).toBe(parentNameKey("ngozi  okafor"));
    expect(studentNameKey("Okafor", "Chinedu  Emeka")).toBe(studentNameKey("OKAFOR", "chinedu emeka"));
  });
});

describe("class matching (AC-4)", () => {
  const cls = (name: string, arm: string | null, isActive = true): ClassOption => ({ id: name, name, arm, isActive });
  const classes = [cls("JSS 2 Gold", "Gold"), cls("JSS 2 Blue", "Blue"), cls("SS 1 A", "A"), cls("SS 11 A", "A"), cls("JSS 3 Blue", "Blue", false)];

  it("matches whatever the spacing, dots and case", () => {
    for (const text of ["jss2 gold", "J.S.S 2 Gold", "JSS 2G", "jss-2-gold"]) expect(matchClass(text, classes)).toMatchObject({ kind: "match", cls: { name: "JSS 2 Gold" } });
  });

  it("refuses a short arm that could be two classes", () => {
    const withGreen = [...classes, cls("JSS 2 Green", "Green")];
    const match = matchClass("JSS 2G", withGreen);
    expect(match.kind).toBe("ambiguous");
    expect(classProblem("JSS 2G", match)).toBe("JSS 2G could be JSS 2 Gold or JSS 2 Green. Write the class in full.");
  });

  it("matches the level whole, so SS 1A is never SS 11 A", () => {
    expect(matchClass("SS 1A", classes)).toMatchObject({ kind: "match", cls: { name: "SS 1 A" } });
    expect(matchClass("SS1", [cls("SS 11 A", "A")]).kind).toBe("unknown");
  });

  it("says switched off and unknown in plain words", () => {
    const off = matchClass("JSS 3 Blue", classes);
    expect(off.kind).toBe("off");
    expect(classProblem("JSS 3 Blue", off)).toMatch(/^JSS 3 Blue is switched off/);
    expect(classProblem("SS 3 Blue", matchClass("SS 3 Blue", classes))).toBe("SS 3 Blue is not a class at this school.");
  });

  it("can't match two classes whose names reduce to the same key", () => {
    const match = matchClass("JSS 1 A", [cls("JSS 1 A", "A"), cls("JSS 1-A", "A")]);
    expect(match.kind).toBe("same_key");
  });
});

describe("student rows (AC-4, AC-5, AC-6)", () => {
  const header = ["Name", "Gender", "Class", "Admission no", "House", "Parent name", "Parent phone", "Relationship", "Mother's name", "Mother's phone", "Father's name", "Father's phone"];
  const parse = (...rows: (string | null)[][]) => parseStudentRows(grid(header, ...rows), mapColumns("students", header.map(t)));

  it("reads a good row with the typed form's rules", () => {
    const [r] = parse(["OKAFOR Chinedu Emmanuel", "Boy", "JSS 2 Gold", "GHS/24/015", "Red", "Ngozi Okafor", "0803 123 4567", "mum"]);
    expect(r).toMatchObject({ row: 2, surname: "OKAFOR", otherNames: "Chinedu Emmanuel", gender: "male", classText: "JSS 2 Gold", admissionNo: "GHS/24/015", house: "Red", problems: [] });
    expect(r.parents).toEqual([expect.objectContaining({ fullName: "Ngozi Okafor", phone: "+2348031234567", relationship: "mother", isPrimary: true })]);
  });

  it("accepts M, F, Male, Female, Boy and Girl in any case, and nothing else", () => {
    const rows = parse(["ADE Bola", "m"], ["ADE Bola", "FEMALE"], ["ADE Bola", "girl"], ["ADE Bola", "X"], ["ADE Bola", null]);
    expect(rows.map((r) => r.gender)).toEqual(["male", "female", "female", null, null]);
    expect(rows[3].problems).toContain("Gender “X” isn’t one we know. Use M or F.");
    expect(rows[4].problems).toContain("No gender. Use M or F.");
  });

  it("makes bad parents a problem: a name without a phone, a bad phone, a bad relationship", () => {
    const [noPhone, badPhone, badRel] = parse(
      ["ADE Bola", "M", "JSS 1", null, null, "Ngozi Okafor"],
      ["ADE Bola", "M", "JSS 1", null, null, "Ngozi Okafor", "0803 123"],
      ["ADE Bola", "M", "JSS 1", null, null, "Ngozi Okafor", "08031234567", "Aunty"],
    );
    expect(noPhone.problems).toEqual(["Parent 1 has a name but no phone number."]);
    expect(badPhone.problems).toEqual(["Parent 1 phone 0803 123 isn’t a Nigerian mobile number."]);
    expect(badRel.problems).toEqual(["Parent 1 relationship “Aunty” isn’t mother, father or guardian."]);
  });

  it("counts the same phone and name twice as one parent, keeping the written relationship", () => {
    const [r] = parse(["ADE Bola", "F", "JSS 1", null, null, "Mrs Ngozi Okafor", "08031234567", null, "Ngozi Okafor", "+234 803 123 4567"]);
    expect(r.problems).toEqual([]);
    expect(r.parents).toHaveLength(1);
    expect(r.parents[0].relationship).toBe("mother");
    expect(r.notes).toContain("Parent 1 and Mother are the same person, so they are added once.");
  });

  it("refuses more than two different parents on a row", () => {
    const [r] = parse(["ADE Bola", "F", "JSS 1", null, null, "Uncle Ben", "08031234567", null, "Ngozi Okafor", "08051234567", "Emeka Okafor", "08061234567"]);
    expect(r.problems).toEqual(["More than two parents on this row. A student can have at most two."]);
    expect(r.parents.map((p) => p.isPrimary)).toEqual([true, false]);
  });

  it("makes every row with a repeated admission number a problem", () => {
    const rows = parse(["ADE Bola", "M", "JSS 1", "ghs 015"], ["OBI Dayo", "M", "JSS 1", "GHS015"], ["UDO Grace", "M", "JSS 1", "GHS016"]);
    expect(rows[0].repeatedAdmissionNo && rows[1].repeatedAdmissionNo).toBe(true);
    expect(rows[1].problems).toEqual(["Admission number GHS015 is on rows 2 and 3."]);
    expect(rows[2].problems).toEqual([]);
  });

  it("notes an admission number Excel stored as a number, and refuses a date in a text field", () => {
    const g = grid(["Surname", "Other names", "Gender", "Class", "Admission no"], ["OKAFOR", "Chinedu", "M", "JSS 1"]);
    g.rows[0].cells[4] = { kind: "number", text: "123" };
    g.rows[0].cells[1] = { kind: "bad", problem: "date", shown: "2014-03-02" };
    const [r] = parseStudentRows(g, mapColumns("students", g.header));
    expect(r.notes).toContain("Admission number was stored as a number in Excel; leading zeros may be lost.");
    expect(r.problems).toContain("Other names is a date in Excel. Format the column as Text and type it again.");
  });

  it("appends Middle name and Arm columns", () => {
    const h = ["Surname", "Other names", "Middle name", "Gender", "Class", "Arm"];
    const [r] = parseStudentRows(grid(h, ["OKAFOR", "Chinedu", "Emeka", "M", "JSS 2", "Gold"]), mapColumns("students", h.map(t)));
    expect(r).toMatchObject({ otherNames: "Chinedu Emeka", classText: "JSS 2 Gold" });
  });
});

describe("teacher rows (AC-11)", () => {
  it("takes the title from the name without a Title column, and checks name and phone", () => {
    const h = ["Name", "Phone", "Form class"];
    const rows = parseTeacherRows(grid(h, ["Mrs. Ngozi Okafor", "08031234567", "JSS 1 Gold"], ["Bo", "0803"], ["Musa Bello", "08031234567"]), mapColumns("teachers", h.map(t)));
    expect(rows[0]).toMatchObject({ title: "Mrs", fullName: "Ngozi Okafor", phone: "+2348031234567", formClassText: "JSS 1 Gold" });
    expect(rows[1].problems).toEqual(["The name must be 3 to 80 characters.", "Phone 0803 isn’t a Nigerian mobile number."]);
    expect(rows[0].repeatedPhone && rows[2].repeatedPhone).toBe(true);
    expect(rows[2].problems).toEqual(["This phone number is on rows 2 and 4."]);
  });

  it("keeps a title in the name when there is a Title column", () => {
    const h = ["Title", "Name", "Phone"];
    const [r] = parseTeacherRows(grid(h, [null, "Dr Ada Obi", "08031234567"]), mapColumns("teachers", h.map(t)));
    expect(r).toMatchObject({ title: null, fullName: "Dr Ada Obi" });
  });
});

describe("the parent limit and primary rule (shared with linkGuardian)", () => {
  it("allows two, never the same one twice, and makes the first primary", () => {
    expect(nextGuardianLink([], "a")).toEqual({ ok: true, isPrimary: true });
    expect(nextGuardianLink([{ guardianId: "a" }], "b")).toEqual({ ok: true, isPrimary: false });
    expect(nextGuardianLink([{ guardianId: "a" }], "a")).toEqual({ ok: false, reason: "already_linked" });
    expect(nextGuardianLink([{ guardianId: "a" }, { guardianId: "b" }], "c")).toEqual({ ok: false, reason: "too_many" });
  });
});
