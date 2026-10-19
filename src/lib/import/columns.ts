// Finding the header row and which column holds which field (spec 0013, AC-3).
// Headers are compared on letters and digits only, lower cased, with a
// trailing "s" dropped on both sides, so "Adm. No." is "Adm no" and
// "Other Names" is "Other name". Each file kind has its own table, so "Class"
// is the class in a student file and the form class in a teacher file.

import { andList, type Cell, cellText, columnLetter, ImportRefused } from "./grid";

export type ImportKind = "students" | "teachers";

export const headerKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");

type FieldSpec = { label: string; aliases: string[] };

export const STUDENT_FIELDS = {
  surname: { label: "Surname", aliases: ["Surname", "Last name", "Family name"] },
  otherNames: { label: "Other names", aliases: ["Other names", "First name", "Given names", "Forenames"] },
  middleName: { label: "Middle name", aliases: ["Middle name"] },
  name: { label: "Name", aliases: ["Name", "Full name", "Student name", "Student's name", "Name of student"] },
  gender: { label: "Gender", aliases: ["Gender", "Sex"] },
  className: { label: "Class", aliases: ["Class", "Class name"] },
  arm: { label: "Arm", aliases: ["Arm"] },
  admissionNo: { label: "Admission number", aliases: ["Admission number", "Admission no", "Adm no", "Reg no", "Registration number"] },
  house: { label: "House", aliases: ["House"] },
  parent1Name: { label: "Parent name", aliases: ["Parent name", "Parent's name", "Parent/Guardian name", "Guardian name", "Guardian's name", "Parent 1 name"] },
  parent1Phone: { label: "Parent phone", aliases: ["Parent phone", "Parent's phone", "Guardian phone", "Guardian's phone", "Phone", "Phone number", "GSM", "Parent 1 phone"] },
  parent1Relationship: { label: "Relationship", aliases: ["Relationship", "Parent 1 relationship"] },
  parent2Name: { label: "Parent 2 name", aliases: ["Parent 2 name"] },
  parent2Phone: { label: "Parent 2 phone", aliases: ["Parent 2 phone"] },
  parent2Relationship: { label: "Parent 2 relationship", aliases: ["Parent 2 relationship"] },
  fatherName: { label: "Father's name", aliases: ["Father name", "Father's name"] },
  fatherPhone: { label: "Father's phone", aliases: ["Father phone", "Father's phone", "Father's phone number"] },
  motherName: { label: "Mother's name", aliases: ["Mother name", "Mother's name"] },
  motherPhone: { label: "Mother's phone", aliases: ["Mother phone", "Mother's phone", "Mother's phone number"] },
} satisfies Record<string, FieldSpec>;

export const TEACHER_FIELDS = {
  title: { label: "Title", aliases: ["Title"] },
  fullName: { label: "Name", aliases: ["Full name", "Name", "Teacher name", "Staff name"] },
  phone: { label: "Phone", aliases: ["Phone", "Phone number", "GSM", "Mobile"] },
  formClass: { label: "Form class", aliases: ["Form class", "Class", "Form master of", "Class teacher of"] },
} satisfies Record<string, FieldSpec>;

export type StudentField = keyof typeof STUDENT_FIELDS;
export type TeacherField = keyof typeof TEACHER_FIELDS;
type FieldOf<K extends ImportKind> = K extends "students" ? StudentField : TeacherField;

const FIELDS: Record<ImportKind, Record<string, FieldSpec>> = { students: STUDENT_FIELDS, teachers: TEACHER_FIELDS };

const ALIAS_INDEX: Record<ImportKind, Map<string, string>> = {
  students: indexAliases(STUDENT_FIELDS),
  teachers: indexAliases(TEACHER_FIELDS),
};

function indexAliases(fields: Record<string, FieldSpec>) {
  const index = new Map<string, string>();
  for (const [field, spec] of Object.entries(fields)) for (const alias of spec.aliases) index.set(headerKey(alias), field);
  return index;
}

const fieldOf = (kind: ImportKind, cell: Cell | null) => {
  const text = cellText(cell);
  return text ? ALIAS_INDEX[kind].get(headerKey(text)) : undefined;
};

/** A header row names at least two of the fields we know, so a title row ("Class list") never counts. */
export function isHeaderRow(kind: ImportKind, cells: (Cell | null)[]) {
  return new Set(cells.map((c) => fieldOf(kind, c)).filter(Boolean)).size >= 2;
}

export type ColumnMap<K extends ImportKind> = {
  /** Field → zero based column index. */
  columns: Partial<Record<FieldOf<K>, number>>;
  /** For the preview: which column became which field. */
  used: { column: string; header: string; field: string }[];
  /** Headers we didn't use, as written. */
  ignored: string[];
};

const missing = (label: string, header: (Cell | null)[]) => {
  const read = header.map(cellText).filter(Boolean);
  return new ImportRefused("missing_column", `No ${label} column found. The headers we read were: ${read.join(", ")}.`);
};

/**
 * Which column holds which field. Refuses a file missing a required column,
 * or with two columns for one field; unknown columns are ignored and listed.
 */
export function mapColumns<K extends ImportKind>(kind: K, header: (Cell | null)[]): ColumnMap<K> {
  const fields = FIELDS[kind];
  const found = new Map<string, number[]>();
  const ignored: string[] = [];
  header.forEach((cell, i) => {
    const field = fieldOf(kind, cell);
    if (field) found.set(field, [...(found.get(field) ?? []), i]);
    else if (cellText(cell)) ignored.push(cellText(cell));
  });
  for (const [field, at] of found) {
    if (at.length > 1) {
      throw new ImportRefused("duplicate_column", `Columns ${andList(at.map(columnLetter))} both look like ${fields[field].label}. Rename one.`);
    }
  }
  const has = (field: string) => found.has(field);

  if (kind === "students") {
    // Surname with Other names wins over one Name column (AC-3).
    if (has("surname") && has("otherNames")) {
      if (has("name")) drop("name");
    } else if (has("name")) {
      if (has("surname")) drop("surname");
      if (has("otherNames")) drop("otherNames");
    } else {
      throw missing(has("surname") ? "Other names" : has("otherNames") ? "Surname" : "Name (or Surname and Other names)", header);
    }
    if (!has("gender")) throw missing("Gender", header);
    if (!has("className")) throw missing("Class", header);
  } else {
    if (!has("fullName")) throw missing("Name", header);
    if (!has("phone")) throw missing("Phone", header);
  }

  function drop(field: string) {
    ignored.push(cellText(header[found.get(field)![0]]));
    found.delete(field);
  }

  const columns = Object.fromEntries([...found].map(([field, at]) => [field, at[0]])) as ColumnMap<K>["columns"];
  const used = [...found]
    .map(([field, at]) => ({ index: at[0], column: columnLetter(at[0]), header: cellText(header[at[0]]), field: fields[field].label }))
    .sort((a, b) => a.index - b.index)
    .map(({ column, header, field }) => ({ column, header, field }));
  return { columns, used, ignored };
}
