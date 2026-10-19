// Reading each teacher row of a sheet and the checks within the file
// (spec 0013, AC-11). The field rules are "Add teacher"'s own
// (src/lib/enrolment-rules.ts). Pure: the database checks are the planner's.

import { teacherProblem, tidy } from "@/lib/enrolment-rules";
import { normaliseNigerianPhone } from "@/lib/phone";

import { badCellProblem } from "./cells";
import type { ColumnMap, TeacherField } from "./columns";
import { andList, cellText, type Grid } from "./grid";
import { splitTitle } from "./names";

export type ParsedTeacher = {
  row: number;
  title: string | null;
  fullName: string;
  /** +234 format, or null when it isn't a Nigerian mobile number. */
  phone: string | null;
  /** The form class as written, matched later. */
  formClassText: string | null;
  /** Its phone is on another row too, so it is a problem whatever the school has. */
  repeatedPhone: boolean;
  problems: string[];
  notes: string[];
};

const LABELS: Record<TeacherField, string> = { title: "Title", fullName: "Name", phone: "Phone", formClass: "Form class" };

const TEACHER_WORDS: Record<string, string> = {
  title: "The title is longer than 20 characters.",
  fullName: "The name must be 3 to 80 characters.",
};

export function parseTeacherRows(grid: Grid, map: ColumnMap<"teachers">): ParsedTeacher[] {
  const rows = grid.rows.map(({ n, cells }) => {
    const problems: string[] = [];
    const text = (field: TeacherField) => {
      const at = map.columns[field];
      const cell = at === undefined ? null : (cells[at] ?? null);
      if (cell?.kind === "bad") {
        problems.push(badCellProblem(LABELS[field], cell));
        return "";
      }
      return cellText(cell);
    };

    let title: string | null = text("title") || null;
    let fullName = text("fullName");
    // Without a Title column, "Mrs Ngozi Okafor" gives the title Mrs (AC-11).
    if (map.columns.title === undefined) {
      const split = splitTitle(fullName);
      title = split.title;
      fullName = split.name;
    }
    const phoneText = text("phone");
    const formClassText = text("formClass") || null;

    const problem = teacherProblem({ title, fullName });
    if (problem) problems.push(TEACHER_WORDS[problem.field] ?? problem.error);
    const phone = phoneText ? normaliseNigerianPhone(phoneText) : null;
    if (!phoneText) problems.push("No phone number.");
    else if (!phone) problems.push(`Phone ${phoneText} isn’t a Nigerian mobile number.`);

    return { row: n, title: tidy(title) || null, fullName: tidy(fullName), phone, formClassText, repeatedPhone: false, problems, notes: [] } satisfies ParsedTeacher;
  });

  // The same phone on more than one row makes every one of those rows a problem.
  const byPhone = new Map<string, ParsedTeacher[]>();
  for (const row of rows) if (row.phone) byPhone.set(row.phone, [...(byPhone.get(row.phone) ?? []), row]);
  for (const same of byPhone.values()) {
    if (same.length < 2) continue;
    const where = `rows ${andList(same.map((r) => r.row))}`;
    for (const row of same) {
      row.repeatedPhone = true;
      row.problems.push(`This phone number is on ${where}.`);
    }
  }
  return rows;
}
