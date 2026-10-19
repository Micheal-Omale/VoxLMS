import type { RemarksSnapshot } from "@/components/remarks-sheet/types";
import { displayStudentId } from "@/lib/student-number";
import type { ClassRemarks, ClassResults } from "@/server/data";

/** The parts of a Remarks sheet the browser needs, from one `getClassRemarks` read (spec 0011). */
export function toRemarksSnapshot({ results, remarks }: { results: ClassResults; remarks: ClassRemarks }, schoolCode: string): RemarksSnapshot {
  const figures = new Map(results.students.map((s) => [s.studentId, s]));
  const snapshot: RemarksSnapshot = { students: [], saved: {}, automatic: {}, lastChange: {} };
  for (const row of remarks.rows) {
    const s = figures.get(row.studentId)!;
    snapshot.students.push({
      id: s.studentId,
      surname: s.surname,
      otherNames: s.otherNames,
      number: displayStudentId(schoolCode, s),
      average: s.average,
      position: s.position,
    });
    const saved: Record<string, string> = {};
    if (row.teacherRemark) saved.teacher = row.teacherRemark;
    if (row.head.kind === "typed") saved.head = row.head.text;
    snapshot.saved[row.studentId] = saved;
    snapshot.automatic[row.studentId] = row.automatic;
    if (row.lastChange) snapshot.lastChange[row.studentId] = { by: row.lastChange.by, at: row.lastChange.at.toISOString() };
  }
  return snapshot;
}
