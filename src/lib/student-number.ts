// VoxLMS student numbers (spec 0003, AC-11): the school's code plus at least
// four digits, e.g. GHS-0123. Shown wherever a school has no admission number.

export function formatStudentNo(schoolCode: string, studentNo: number): string {
  return `${schoolCode}-${String(studentNo).padStart(4, "0")}`;
}

/** The number to show for a student: the school's own admission number if it has one. */
export function displayStudentId(schoolCode: string, student: { studentNo: number; admissionNo: string | null }) {
  return student.admissionNo ?? formatStudentNo(schoolCode, student.studentNo);
}
