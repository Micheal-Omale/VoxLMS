// Reading each student row of a sheet and the checks within the file
// (spec 0013, AC-4, AC-5, AC-6). The field rules are the typed form's own
// (src/lib/enrolment-rules.ts). Pure: the database checks are the planner's.

import {
  type Gender,
  guardianProblem,
  nextGuardianLink,
  normaliseAdmissionNo,
  readStudent,
  type Relationship,
} from "@/lib/enrolment-rules";
import { normaliseNigerianPhone } from "@/lib/phone";

import { badCellProblem } from "./cells";
import type { ColumnMap, StudentField } from "./columns";
import { andList, type Cell, cellText, type Grid } from "./grid";
import { parentNameKey, splitStudentName } from "./names";

export type ParsedParent = {
  /** Where it came from, for notes: "Parent 1", "Mother". */
  block: string;
  fullName: string;
  /** +234 format. */
  phone: string;
  relationship: Relationship;
  isPrimary: boolean;
  /** Phone and name together: the same key is the same parent (AC-7). */
  key: string;
};

export type ParsedStudent = {
  row: number;
  surname: string;
  otherNames: string;
  gender: Gender | null;
  /** The class as written (with the Arm column appended), matched later. */
  classText: string;
  admissionNo: string | null;
  house: string | null;
  parents: ParsedParent[];
  /** Its admission number is on another row too, so it is a problem whatever the school has. */
  repeatedAdmissionNo: boolean;
  problems: string[];
  notes: string[];
};

const GENDERS: Record<string, Gender> = { m: "male", male: "male", boy: "male", f: "female", female: "female", girl: "female" };

const RELATIONSHIP_WORDS: Record<string, Relationship> = {
  mother: "mother",
  mum: "mother",
  mom: "mother",
  father: "father",
  dad: "father",
  guardian: "guardian",
};

/** The import's wording for a refusal from the shared student rules. */
const STUDENT_WORDS: Record<string, string> = {
  surname: "The surname must be 2 to 40 characters.",
  otherNames: "The other names must be 2 to 80 characters.",
  admissionNo: "The admission number is longer than 30 characters.",
  house: "The house is longer than 30 characters.",
};

type Block = { block: string; name: StudentField; phone: StudentField; relationship?: StudentField; fixed?: Relationship };

const BLOCKS: Block[] = [
  { block: "Parent 1", name: "parent1Name", phone: "parent1Phone", relationship: "parent1Relationship" },
  { block: "Parent 2", name: "parent2Name", phone: "parent2Phone", relationship: "parent2Relationship" },
  { block: "Father", name: "fatherName", phone: "fatherPhone", fixed: "father" },
  { block: "Mother", name: "motherName", phone: "motherPhone", fixed: "mother" },
];

const LABELS: Partial<Record<StudentField, string>> = {
  surname: "Surname",
  otherNames: "Other names",
  middleName: "Middle name",
  name: "Name",
  gender: "Gender",
  className: "Class",
  arm: "Arm",
  admissionNo: "Admission number",
  house: "House",
};

/** Every data row of a student sheet, read and checked on its own and against the other rows. */
export function parseStudentRows(grid: Grid, map: ColumnMap<"students">): ParsedStudent[] {
  const rows = grid.rows.map((row) => parseRow(row.n, row.cells, map));
  flagRepeatedAdmissionNos(rows);
  return rows;
}

function parseRow(n: number, cells: (Cell | null)[], map: ColumnMap<"students">): ParsedStudent {
  const problems: string[] = [];
  const notes: string[] = [];
  const cellOf = (field: StudentField) => {
    const at = map.columns[field];
    return at === undefined ? null : (cells[at] ?? null);
  };
  /** A field's text; a date, TRUE/FALSE or error in it is a problem (AC-2). */
  const text = (field: StudentField, label = LABELS[field] ?? field) => {
    const cell = cellOf(field);
    if (cell?.kind === "bad") {
      problems.push(badCellProblem(label, cell));
      return "";
    }
    return cellText(cell);
  };
  const join = (...parts: string[]) => parts.filter(Boolean).join(" ");

  let surname: string;
  let otherNames: string;
  if (map.columns.surname !== undefined) {
    surname = text("surname");
    otherNames = join(text("otherNames"), text("middleName"));
  } else {
    const split = splitStudentName(text("name"));
    surname = split.surname;
    otherNames = join(split.otherNames, text("middleName"));
  }

  const genderText = text("gender");
  const gender = GENDERS[genderText.toLowerCase().replace(/[^a-z]/g, "")] ?? null;
  const classText = join(text("className"), text("arm"));
  const admissionCell = cellOf("admissionNo");
  const admissionNo = text("admissionNo") || null;
  const house = text("house") || null;

  if (!surname && !otherNames) problems.push("No name.");
  else {
    // The typed form's own rules (spec 0008, AC-5 to AC-7); gender is checked just below.
    const read = readStudent({ surname, otherNames, gender: gender ?? "male", admissionNo, house });
    if (!read.ok) problems.push(STUDENT_WORDS[read.field] ?? read.error);
    else {
      surname = read.surname;
      otherNames = read.otherNames;
    }
  }
  if (!gender) problems.push(genderText ? `Gender “${genderText}” isn’t one we know. Use M or F.` : "No gender. Use M or F.");
  if (!classText) problems.push("No class.");
  if (admissionCell?.kind === "number") notes.push("Admission number was stored as a number in Excel; leading zeros may be lost.");

  const parents = parseParents(text, problems, notes);
  return { row: n, surname, otherNames, gender, classText, admissionNo, house, parents, repeatedAdmissionNo: false, problems, notes };
}

/**
 * Up to two parents from the row's parent blocks (AC-5), in order: Parent 1,
 * Parent 2, Father, Mother. The same phone and name twice is one parent.
 */
function parseParents(text: (field: StudentField, label?: string) => string, problems: string[], notes: string[]): ParsedParent[] {
  const parents: ParsedParent[] = [];
  /** Whether each parent's relationship was written, so a written one wins when two blocks merge. */
  const given = new Map<string, boolean>();
  let refused = false;

  for (const b of BLOCKS) {
    const name = text(b.name, `${b.block} name`);
    const phoneText = text(b.phone, `${b.block} phone`);
    const relText = b.relationship ? text(b.relationship, `${b.block} relationship`) : "";
    if (!name && !phoneText) continue;
    if (!name) {
      problems.push(`${b.block} has a phone number but no name.`);
      continue;
    }
    if (!phoneText) {
      problems.push(`${b.block} has a name but no phone number.`);
      continue;
    }
    let relationship: Relationship = b.fixed ?? "guardian";
    if (!b.fixed && relText) {
      const word = RELATIONSHIP_WORDS[relText.toLowerCase().replace(/[^a-z]/g, "")];
      if (!word) {
        problems.push(`${b.block} relationship “${relText}” isn’t mother, father or guardian.`);
        continue;
      }
      relationship = word;
    }
    // The typed form's own rules (spec 0008, AC-8).
    const problem = guardianProblem({ fullName: name, phone: phoneText, relationship }, { details: true });
    if (problem) {
      problems.push(problem.field === "phone" ? `${b.block} phone ${phoneText} isn’t a Nigerian mobile number.` : `${b.block} name must be 3 to 80 characters.`);
      continue;
    }
    const phone = normaliseNigerianPhone(phoneText)!;
    const key = `${phone}|${parentNameKey(name)}`;
    const same = parents.find((p) => p.key === key);
    if (same) {
      notes.push(`${same.block} and ${b.block} are the same person, so they are added once.`);
      if (!given.get(key) && (b.fixed || relText)) {
        same.relationship = relationship;
        given.set(key, true);
      }
      continue;
    }
    // One rule for the two parent limit and the primary, shared with linkGuardian.
    const link = nextGuardianLink(parents.map((p) => ({ guardianId: p.key })), key);
    if (!link.ok) {
      if (!refused) problems.push("More than two parents on this row. A student can have at most two.");
      refused = true;
      continue;
    }
    given.set(key, Boolean(b.fixed || relText));
    parents.push({ block: b.block, fullName: name, phone, relationship, isPrimary: link.isPrimary, key });
  }
  return parents;
}

/** The same admission number on more than one row makes every one of those rows a problem (AC-6). */
function flagRepeatedAdmissionNos(rows: ParsedStudent[]) {
  const byNumber = new Map<string, ParsedStudent[]>();
  for (const row of rows) {
    if (!row.admissionNo) continue;
    const key = normaliseAdmissionNo(row.admissionNo);
    byNumber.set(key, [...(byNumber.get(key) ?? []), row]);
  }
  for (const same of byNumber.values()) {
    if (same.length < 2) continue;
    const where = `rows ${andList(same.map((r) => r.row))}`;
    for (const row of same) {
      row.repeatedAdmissionNo = true;
      row.problems.push(`Admission number ${row.admissionNo} is on ${where}.`);
    }
  }
}

