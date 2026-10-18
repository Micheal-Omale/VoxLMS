import type { SheetSnapshot } from "@/components/score-sheet/types";
import { displayStudentId } from "@/lib/student-number";
import type { ScoreSheetData } from "@/server/data";

/** The parts of a score sheet the browser needs, with each student's number ready to show. */
export function toSnapshot(sheet: ScoreSheetData, schoolCode: string): SheetSnapshot {
  return {
    students: sheet.students.map((s) => ({
      id: s.studentId,
      surname: s.surname,
      otherNames: s.otherNames,
      number: displayStudentId(schoolCode, s),
    })),
    columns: sheet.components,
    scale: sheet.gradeBands,
    scores: sheet.scores,
  };
}
