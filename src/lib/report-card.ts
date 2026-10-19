// Report card (spec 0012): turns one snapshot of a class's results and
// comments into ready to print cards. Pure: no database, no clock (today's
// date is passed in). Every string a card prints is made here, so the PDF
// component does no formatting and no maths.

import { formatNigerianPhone } from "./phone";
import type { HeadRemark } from "./remarks";
import { tidyRemark } from "./remarks";
import {
  formatHundredths,
  formatTenths,
  missingLabel,
  ordinal,
  type ResultsBand,
  type ResultsPart,
  type StudentResult,
  type SubjectResult,
} from "./results";
import { displayStudentId } from "./student-number";
import { termLabel, termName } from "./term-label";

/** Image bytes as react-pdf takes them. The same object goes on every card, so it embeds once. */
export type CardImage = { data: Buffer; format: "png" | "jpg" };

/** What the card reads from results (spec 0010): `loadClassResults` output, or made up data in the preview. */
export type CardResults = {
  cls: { id: string; name: string };
  term: { id: string; number: number; isCurrent: boolean };
  section: { name: string };
  session: { name: string };
  split: ResultsPart[];
  numberInClass: number;
  final: boolean;
  classAverage: number | null;
  subjects: SubjectResult[];
  students: StudentResult[];
};

/** What the card reads from remarks (spec 0011): `loadClassRemarks` output. */
export type CardRemarks = { rows: { studentId: string; teacherRemark: string | null; head: HeadRemark }[] };

export type ReportCardInput = {
  results: CardResults;
  remarks: CardRemarks;
  school: { name: string; code: string; address: string; phone: string | null; email: string | null; motto: string | null; plan: "basic" | "school_logo" };
  /** The section's word for the class's teacher: "Form master", "Class teacher". */
  teacherTitle: string;
  /** The class's form master this session; null when none is assigned. */
  formMaster: { title: string | null; name: string } | null;
  /** From `getSignerForSection` (spec 0007); null means no one can sign yet. */
  signer: { title: string; name: string } | null;
  /** The section's grade scale for the session, any order. */
  gradeBands: ResultsBand[];
  /** "2027-01-05", or null when the term has no date set. */
  nextTermBeginsOn: string | null;
  genders: Record<string, "male" | "female">;
  logo: CardImage | null;
  signature: CardImage | null;
};

export type ReportCardRow = {
  subject: string;
  parts: string[];
  total: string;
  grade: string;
  position: string;
  classAverage: string;
  highest: string;
  lowest: string;
  remark: string;
};

export type ReportCardModel = {
  school: { name: string; address: string | null; contact: string | null; motto: string | null; logo: CardImage | null; poweredBy: boolean };
  title: string;
  printedOn: string;
  student: {
    surname: string;
    otherNames: string;
    /** "Admission no." when the school gave one, else "Student no." (the VoxLMS number). */
    idLabel: string;
    id: string;
    className: string;
    gender: string;
    subjectsTaken: string;
    numberInClass: string;
    position: string;
    total: string;
    average: string;
    classAverage: string;
    nextTermBegins: string | null;
  };
  columns: { parts: string[]; total: string };
  rows: ReportCardRow[];
  gradeKey: string | null;
  teacherComment: { heading: string; text: string | null; formMaster: string | null };
  headComment: { heading: string; text: string };
  signer: { name: string; title: string; signature: CardImage | null };
};

const DASH = "–";
/** Readiness lists this many incomplete students, then "and N more" (AC-2). */
export const MISSING_SHOWN = 10;

export type NotReady =
  | { kind: "no_split" | "no_students" | "no_subjects" | "no_signer"; message: string }
  | { kind: "incomplete"; message: string; students: { name: string; missing: string }[]; more: number };

export type Readiness = { ready: true; count: number; missingTeacherComments: number } | { ready: false; reason: NotReady };

/** "OKON Emem": the surname in capitals, as notices and the card print it. */
export const cardName = (s: { surname: string; otherNames: string }) => `${s.surname.toLocaleUpperCase("en")} ${s.otherNames}`.trim();

/** Register order (AC-3): surname, other names, student number, compared as the Results list compares them. */
export function byRegister(a: { surname: string; otherNames: string; studentNo: number }, b: { surname: string; otherNames: string; studentNo: number }) {
  return (
    a.surname.localeCompare(b.surname, "en", { sensitivity: "base" }) ||
    a.otherNames.localeCompare(b.otherNames, "en", { sensitivity: "base" }) ||
    a.studentNo - b.studentNo
  );
}

/**
 * Whether a class's report cards can print (AC-2). The Report cards section
 * and the download route both ask this, on the same kind of read.
 */
export function reportCardReadiness(input: { results: CardResults; remarks: CardRemarks; hasSigner: boolean }): Readiness {
  const { results, remarks, hasSigner } = input;
  const { cls, split, students, subjects } = results;
  if (split.length === 0) {
    return { ready: false, reason: { kind: "no_split", message: `Results need the score split for ${results.section.name}, ${results.session.name}. The VoxLMS team sets it.` } };
  }
  if (students.length === 0) return { ready: false, reason: { kind: "no_students", message: `No students in ${cls.name} yet, so there are no report cards to print.` } };
  if (subjects.length === 0) return { ready: false, reason: { kind: "no_subjects", message: `No subjects are set for ${cls.name} yet, so there are no report cards to print.` } };
  if (!results.final) {
    const incomplete = students.filter((s) => s.status === "incomplete").sort(byRegister);
    return {
      ready: false,
      reason: {
        kind: "incomplete",
        message: "Report cards print when every score is in. Still missing:",
        students: incomplete.slice(0, MISSING_SHOWN).map((s) => ({ name: cardName(s), missing: missingLabel(s.missing) })),
        more: Math.max(0, incomplete.length - MISSING_SHOWN),
      },
    };
  }
  if (!hasSigner) return { ready: false, reason: { kind: "no_signer", message: "Report cards need the principal’s name. The VoxLMS team adds it." } };
  const written = new Set(remarks.rows.filter((r) => tidyRemark(r.teacherRemark)).map((r) => r.studentId));
  return { ready: true, count: students.length, missingTeacherComments: students.filter((s) => !written.has(s.studentId)).length };
}

const tenthsOf = (n: number) => Math.round(n * 10);

/**
 * The grade key under the subject table (AC-6), high to low:
 * "A 70 to 100 Excellent · B 60 to 69.9 Very good · …". Each band runs up to
 * the next band's lowest score less 0.1; the top band ends at the split's full
 * maximum (in tenths). Null without a scale.
 */
export function gradeKeyLine(bands: ResultsBand[], maxTenths: number): string | null {
  if (bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted
    .map((band, i) => {
      const top = i === 0 ? maxTenths : tenthsOf(sorted[i - 1].min) - 1;
      return `${band.grade} ${formatTenths(tenthsOf(band.min))} to ${formatTenths(top)} ${band.remark}`.trim();
    })
    .join(" · ");
}

/** "GHS JSS 2 Gold First Term 2026-2027 report cards.pdf" (AC-3). */
export function reportCardFileName(schoolCode: string, className: string, termNumber: number, sessionName: string) {
  return `${schoolCode} ${className} ${termName(termNumber)} ${sessionName.replaceAll("/", "-")} report cards.pdf`;
}

const LAGOS_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
const LONG_DATE = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "18 October 2026": the day it is in Lagos. */
export const lagosDate = (now: Date) => LAGOS_DAY.format(now);

/** "2027-01-05" → "Tuesday 5 January 2027" (no comma, as the card prints it). */
export function longDate(isoDate: string) {
  return LONG_DATE.formatToParts(new Date(`${isoDate}T00:00:00Z`))
    .filter((p) => p.type !== "literal")
    .map((p) => p.value)
    .join(" ");
}

const orDash = (value: number | null, format: (n: number) => string) => (value === null ? DASH : format(value));

/** One card per open enrolment, in register order (AC-3 to AC-8). Call only when ready. */
export function buildReportCards(input: ReportCardInput, today: Date): ReportCardModel[] {
  const { results, remarks, school, signer } = input;
  if (!signer) throw new Error("buildReportCards needs a signer: check reportCardReadiness first");
  const maxTenths = results.split.reduce((sum, p) => sum + tenthsOf(p.max), 0);
  const subjectById = new Map(results.subjects.map((s) => [s.classSubjectId, s]));
  const remarkOf = new Map(remarks.rows.map((r) => [r.studentId, r]));
  const contact = [school.phone && formatNigerianPhone(school.phone.trim()), school.email].map((v) => v?.trim()).filter(Boolean).join(" · ");
  const formMaster = input.formMaster ? [input.formMaster.title, input.formMaster.name].map((v) => v?.trim()).filter(Boolean).join(" ") : null;

  // The same objects on every card: images embed once, strings are shared.
  const header: ReportCardModel["school"] = {
    name: school.name,
    address: school.address.trim() || null,
    contact: contact || null,
    motto: school.motto?.trim() || null,
    logo: school.plan === "school_logo" ? input.logo : null,
    poweredBy: school.plan === "basic",
  };
  const columns = {
    parts: results.split.map((p) => `${p.label} (${formatTenths(tenthsOf(p.max))})`),
    total: `Total (${formatTenths(maxTenths)})`,
  };
  const title = `Report card · ${termLabel(results.term.number, results.session.name)}`;
  const printedOn = `Printed ${lagosDate(today)}`;
  const gradeKey = gradeKeyLine(input.gradeBands, maxTenths);
  const nextTermBegins = input.nextTermBeginsOn ? longDate(input.nextTermBeginsOn) : null;
  const numberInClass = String(results.numberInClass);
  const classAverage = orDash(results.classAverage, formatHundredths);
  const signerBlock = { name: signer.name, title: signer.title, signature: input.signature };

  return [...results.students].sort(byRegister).map((s): ReportCardModel => {
    const remark = remarkOf.get(s.studentId);
    const head = remark?.head;
    return {
      school: header,
      title,
      printedOn,
      student: {
        surname: s.surname.toLocaleUpperCase("en"),
        otherNames: s.otherNames,
        idLabel: s.admissionNo ? "Admission no." : "Student no.",
        id: displayStudentId(school.code, s),
        className: results.cls.name,
        gender: input.genders[s.studentId] === "female" ? "Female" : "Male",
        subjectsTaken: String(s.subjects.length),
        numberInClass,
        position: s.position === null ? DASH : `${ordinal(s.position)} of ${numberInClass}`,
        total: orDash(s.total, formatTenths),
        average: orDash(s.average, formatHundredths),
        classAverage,
        nextTermBegins,
      },
      columns,
      rows: s.subjects.map((line) => {
        const subject = subjectById.get(line.classSubjectId)!;
        return {
          subject: subject.name,
          parts: results.split.map((p) => line.scores[p.key] ?? DASH),
          total: orDash(line.total, formatTenths),
          grade: line.grade ?? DASH,
          position: orDash(line.position, ordinal),
          classAverage: orDash(subject.classAverage, formatHundredths),
          highest: orDash(subject.highest, formatTenths),
          lowest: orDash(subject.lowest, formatTenths),
          remark: line.remark ?? DASH,
        };
      }),
      gradeKey,
      teacherComment: { heading: `${input.teacherTitle}’s comment`, text: tidyRemark(remark?.teacherRemark), formMaster },
      headComment: { heading: `${signer.title}’s comment`, text: head && head.kind !== "waiting" ? head.text : "" },
      signer: signerBlock,
    };
  });
}
