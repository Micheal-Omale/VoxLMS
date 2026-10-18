// Results computation (spec 0010): every figure on a class's results, worked
// out from the saved scores each time they are read. Pure: no database, no
// clock. All arithmetic is in whole numbers (tenths for scores and totals,
// hundredths for averages), so a hand calculation and the code agree to the
// last digit.

export type ResultsPart = { key: string; label: string; max: number };
export type ResultsBand = { grade: string; min: number; remark: string };

export type ResultsSubjectInput = {
  classSubjectId: string;
  name: string;
  shortName: string;
  isElective: boolean;
  /** Students who take it: everyone for a compulsory subject, the registered ones for an elective. */
  takerIds: string[];
};

export type ResultsStudentInput = {
  studentId: string;
  surname: string;
  otherNames: string;
  studentNo: number;
  admissionNo: string | null;
};

export type ResultsInput = {
  /** The section's split for the session, in order. Empty when not set. */
  split: ResultsPart[];
  /** The section's grade scale for the session. Empty when not set. */
  gradeBands: ResultsBand[];
  /** Compulsory first, then electives, each in the school's subject order. */
  subjects: ResultsSubjectInput[];
  /** Open (not withdrawn) enrolments of the class in the term. */
  students: ResultsStudentInput[];
  /** studentId → classSubjectId → part key → score as text ("12", "12.5"). No entry means not entered. */
  scores: Record<string, Record<string, Record<string, string>>>;
};

export type MissingSubject = { subjectName: string; partLabels: string[] };

export type StudentSubjectResult = {
  classSubjectId: string;
  /** Scores by part key, as text; a part not entered has no key. */
  scores: Record<string, string>;
  /** Tenths; null while any part is not entered. */
  total: number | null;
  grade: string | null;
  remark: string | null;
  /** Position among the subject's complete takers; null while incomplete. */
  position: number | null;
  /** The subject's figures can still change: some taker is incomplete in it. */
  provisional: boolean;
  /** Labels of the parts not entered yet. */
  missing: string[];
};

export type StudentResult = ResultsStudentInput & {
  status: "ranked" | "incomplete";
  /** Tenths; null when incomplete. */
  total: number | null;
  /** Hundredths; null when incomplete. */
  average: number | null;
  position: number | null;
  missing: MissingSubject[];
  /** Every subject the student takes, in the class's subject order. */
  subjects: StudentSubjectResult[];
};

export type SubjectResult = Omit<ResultsSubjectInput, "takerIds"> & {
  takers: number;
  completeTakers: number;
  /** Hundredths; null with no complete takers. */
  classAverage: number | null;
  /** Tenths; null with no complete takers. */
  highest: number | null;
  lowest: number | null;
  provisional: boolean;
};

export type ClassResultsFigures = {
  numberInClass: number;
  incompleteCount: number;
  /** True only when every figure is settled: report cards may print (#12). */
  final: boolean;
  /** Hundredths; null with no ranked students. */
  classAverage: number | null;
  subjects: SubjectResult[];
  /** Ranked by position, then incomplete; within each by surname, other names, student number. */
  students: StudentResult[];
};

const TENTHS = /^(\d+)(?:\.(\d))?$/;

/** "12.5" → 125, "12" → 120. Parsed from the text, never through a JavaScript number. */
export function toTenths(text: string): number {
  const match = TENTHS.exec(text.trim());
  if (!match) throw new Error(`Not a score: ${text}`);
  return Number(match[1]) * 10 + Number(match[2] ?? 0);
}

/** a ÷ b with halves going up, whole numbers only (a ≥ 0, b > 0). */
export function divHalfUp(a: number, b: number): number {
  if (b <= 0) throw new Error("divHalfUp needs a positive divisor");
  return Math.floor((2 * a + b) / (2 * b));
}

/** The band with the highest lowest score the exact total reaches (69.5 against an A at 70 is B). */
export function gradeOf(totalTenths: number, bands: ResultsBand[]): ResultsBand | undefined {
  let best: ResultsBand | undefined;
  let bestMin = -1;
  for (const band of bands) {
    const min = toTenths(String(band.min));
    if (totalTenths >= min && min > bestMin) {
      best = band;
      bestMin = min;
    }
  }
  return best;
}

/** Competition ranking ("1, 2, 3, 3, 5"): one plus the number strictly higher. */
export function positions(values: number[]): number[] {
  return values.map((v) => 1 + values.filter((other) => other > v).length);
}

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 101st, 111th. */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** Tenths as text, with one decimal only when needed: 695 → "69.5", 700 → "70". */
export function formatTenths(tenths: number): string {
  const whole = Math.floor(tenths / 10);
  const tenth = tenths % 10;
  return tenth === 0 ? String(whole) : `${whole}.${tenth}`;
}

/** Hundredths as text, always with two decimals: 6740 → "67.40". */
export function formatHundredths(hundredths: number): string {
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

/** "Mathematics: Exam · Basic Science: CA 2", or "takes no subjects yet" when nothing is listed. */
export function missingLabel(missing: MissingSubject[]): string {
  if (missing.length === 0) return "takes no subjects yet";
  return missing.map((m) => (m.partLabels.length === 0 ? m.subjectName : `${m.subjectName}: ${m.partLabels.join(", ")}`)).join(" · ");
}

const byName = (a: ResultsStudentInput, b: ResultsStudentInput) =>
  a.surname.localeCompare(b.surname, "en", { sensitivity: "base" }) ||
  a.otherNames.localeCompare(b.otherNames, "en", { sensitivity: "base" }) ||
  a.studentNo - b.studentNo;

export function computeClassResults(input: ResultsInput): ClassResultsFigures {
  const { split, gradeBands, subjects, students, scores } = input;
  const enrolled = new Set(students.map((s) => s.studentId));

  // 1. Each subject's line for each student who takes it.
  type Line = { studentId: string; totalTenths: number | null; scores: Record<string, string>; missing: string[] };
  const linesBySubject = subjects.map((subject) => {
    const takers = [...new Set(subject.takerIds)].filter((id) => enrolled.has(id));
    return takers.map((studentId): Line => {
      const typed = scores[studentId]?.[subject.classSubjectId] ?? {};
      const kept: Record<string, string> = {};
      const missing: string[] = [];
      let total = 0;
      for (const part of split) {
        const text = typed[part.key];
        if (text === undefined) {
          missing.push(part.label);
          continue;
        }
        kept[part.key] = text;
        total += toTenths(text);
      }
      // Without a split nothing can be complete: a part not entered is never a 0.
      const complete = split.length > 0 && missing.length === 0;
      return { studentId, totalTenths: complete ? total : null, scores: kept, missing };
    });
  });

  // 2. Subject figures over the complete takers only.
  const subjectResults: SubjectResult[] = [];
  const subjectPosition = new Map<string, number>(); // `${subjectIndex}:${studentId}` → position
  subjects.forEach((subject, i) => {
    const lines = linesBySubject[i];
    const complete = lines.filter((l) => l.totalTenths !== null);
    const totals = complete.map((l) => l.totalTenths!);
    positions(totals).forEach((p, j) => subjectPosition.set(`${i}:${complete[j].studentId}`, p));
    subjectResults.push({
      classSubjectId: subject.classSubjectId,
      name: subject.name,
      shortName: subject.shortName,
      isElective: subject.isElective,
      takers: lines.length,
      completeTakers: complete.length,
      classAverage: totals.length === 0 ? null : divHalfUp(totals.reduce((a, b) => a + b, 0) * 10, totals.length),
      highest: totals.length === 0 ? null : Math.max(...totals),
      lowest: totals.length === 0 ? null : Math.min(...totals),
      provisional: complete.length < lines.length,
    });
  });

  // 3. Each student's subjects, overall figures and status.
  const perStudent = students.map((student) => {
    const own: StudentSubjectResult[] = [];
    const missing: MissingSubject[] = [];
    let total = 0;
    subjects.forEach((subject, i) => {
      const line = linesBySubject[i].find((l) => l.studentId === student.studentId);
      if (!line) return;
      const band = line.totalTenths === null ? undefined : gradeOf(line.totalTenths, gradeBands);
      own.push({
        classSubjectId: subject.classSubjectId,
        scores: line.scores,
        total: line.totalTenths,
        grade: band?.grade ?? null,
        remark: band?.remark ?? null,
        position: subjectPosition.get(`${i}:${student.studentId}`) ?? null,
        provisional: subjectResults[i].provisional,
        missing: line.missing,
      });
      if (line.totalTenths === null) missing.push({ subjectName: subject.name, partLabels: line.missing });
      else total += line.totalTenths;
    });
    const complete = own.length > 0 && missing.length === 0;
    return {
      student,
      own,
      missing,
      total: complete ? total : null,
      average: complete ? divHalfUp(total * 10, own.length) : null,
    };
  });

  // 4. Class positions on the two place average, the number that is printed.
  const ranked = perStudent.filter((s) => s.average !== null);
  const classPosition = new Map(positions(ranked.map((s) => s.average!)).map((p, j) => [ranked[j].student.studentId, p]));
  const incompleteCount = perStudent.length - ranked.length;

  const results: StudentResult[] = perStudent.map((s) => ({
    ...s.student,
    status: s.average === null ? "incomplete" : "ranked",
    total: s.total,
    average: s.average,
    position: classPosition.get(s.student.studentId) ?? null,
    missing: s.missing,
    subjects: s.own,
  }));
  results.sort((a, b) => {
    if (a.status !== b.status) return a.status === "ranked" ? -1 : 1;
    if (a.position !== null && b.position !== null && a.position !== b.position) return a.position - b.position;
    return byName(a, b);
  });

  return {
    numberInClass: students.length,
    incompleteCount,
    final: students.length > 0 && split.length > 0 && subjects.length > 0 && incompleteCount === 0,
    classAverage: ranked.length === 0 ? null : divHalfUp(ranked.reduce((sum, s) => sum + s.average!, 0), ranked.length),
    subjects: subjectResults,
    students: results,
  };
}
