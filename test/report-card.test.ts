import { describe, expect, it } from "vitest";

import { worstCaseInput } from "@/app/design/report-card/worst-case";
import {
  buildReportCards,
  gradeKeyLine,
  lagosDate,
  longDate,
  type ReportCardInput,
  reportCardFileName,
  reportCardReadiness,
} from "@/lib/report-card";
import { computeClassResults, type ResultsPart } from "@/lib/results";

// Spec 0012: the pure report card model (AC-2 to AC-7).

const SPLIT: ResultsPart[] = [
  { key: "ca1", label: "CA 1", max: 20 },
  { key: "ca2", label: "CA 2", max: 20 },
  { key: "exam", label: "Exam", max: 60 },
];
const SCALE = [
  { grade: "A", min: 70, remark: "Excellent" },
  { grade: "B", min: 60, remark: "Very good" },
  { grade: "C", min: 50, remark: "Credit" },
  { grade: "D", min: 45, remark: "Pass" },
  { grade: "E", min: 40, remark: "Fair" },
  { grade: "F", min: 0, remark: "Fail" },
];

type Person = { id: string; surname: string; otherNames: string; studentNo: number; admissionNo: string | null };

const PEOPLE: Person[] = [
  { id: "s1", surname: "Okon", otherNames: "Emem", studentNo: 123, admissionNo: null },
  { id: "s2", surname: "adewale", otherNames: "Tolu", studentNo: 7, admissionNo: "GHS/2024/007" },
  { id: "s3", surname: "Bello", otherNames: "Musa", studentNo: 9, admissionNo: "GHS/2024/009" },
];

/** A small class: two subjects, everyone complete unless a score is deleted. */
function input(over: { people?: Person[]; drop?: [string, string, string][]; split?: ResultsPart[]; bands?: typeof SCALE } = {}): ReportCardInput {
  const people = over.people ?? PEOPLE;
  const split = over.split ?? SPLIT;
  const bands = over.bands ?? SCALE;
  const subjects = [
    { classSubjectId: "maths", name: "Mathematics", shortName: "MTH", isElective: false, takerIds: people.map((p) => p.id) },
    { classSubjectId: "bsc", name: "Basic Science", shortName: "BSC", isElective: false, takerIds: people.map((p) => p.id) },
  ];
  const scores: Record<string, Record<string, Record<string, string>>> = {};
  people.forEach((p, i) => {
    scores[p.id] = {
      maths: { ca1: String(10 + i), ca2: "15", exam: String(40 + i * 5) },
      bsc: { ca1: "12.5", ca2: "14", exam: String(30 + i) },
    };
  });
  for (const [student, subject, part] of over.drop ?? []) delete scores[student][subject][part];
  const figures = computeClassResults({
    split,
    gradeBands: bands,
    subjects,
    students: people.map((p) => ({ studentId: p.id, surname: p.surname, otherNames: p.otherNames, studentNo: p.studentNo, admissionNo: p.admissionNo })),
    scores,
  });
  return {
    results: {
      cls: { id: "c1", name: "JSS 2 Gold" },
      term: { id: "t1", number: 1, isCurrent: true },
      section: { name: "Junior Secondary" },
      session: { name: "2026/2027" },
      split,
      ...figures,
    },
    remarks: {
      rows: people.map((p) => ({
        studentId: p.id,
        teacherRemark: p.id === "s3" ? "   " : "Hardworking and well behaved.",
        head: { kind: "automatic" as const, text: "A good result." },
      })),
    },
    school: { name: "Grace High School", code: "GHS", address: "12 Allen Avenue, Ikeja", phone: "+2348030000000", email: null, motto: null, plan: "school_logo" },
    teacherTitle: "Form master",
    formMaster: { title: "Mrs", name: "Funke Adewale" },
    signer: { title: "Principal", name: "Mr Samuel Adeleke" },
    gradeBands: bands,
    nextTermBeginsOn: "2027-01-05",
    genders: { s1: "male", s2: "female", s3: "male" },
    logo: null,
    signature: null,
  };
}

const TODAY = new Date("2026-10-18T23:30:00Z"); // 00:30 on 19 October in Lagos

describe("readiness (AC-2)", () => {
  it("is ready with a count and the students missing a teacher's comment", () => {
    const data = input();
    expect(reportCardReadiness({ results: data.results, remarks: data.remarks, hasSigner: true })).toEqual({ ready: true, count: 3, missingTeacherComments: 1 });
  });

  it("names an incomplete student, surname first, and what is missing", () => {
    const data = input({ drop: [["s1", "maths", "exam"]] });
    const readiness = reportCardReadiness({ results: data.results, remarks: data.remarks, hasSigner: true });
    expect(readiness).toEqual({
      ready: false,
      reason: {
        kind: "incomplete",
        message: "Report cards print when every score is in. Still missing:",
        students: [{ name: "OKON Emem", missing: "Mathematics: Exam" }],
        more: 0,
      },
    });
  });

  it("lists 10 of 12 incomplete students in register order, then 'and 2 more'", () => {
    const people = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, surname: `Name${String.fromCharCode(76 - i)}`, otherNames: "X", studentNo: i, admissionNo: null }));
    const data = input({ people, drop: people.map((p) => [p.id, "bsc", "ca2"] as [string, string, string]) });
    const readiness = reportCardReadiness({ results: data.results, remarks: data.remarks, hasSigner: true });
    if (readiness.ready || readiness.reason.kind !== "incomplete") throw new Error("expected incomplete");
    expect(readiness.reason.students).toHaveLength(10);
    expect(readiness.reason.students[0]).toEqual({ name: "NAMEA X", missing: "Basic Science: CA 2" });
    expect(readiness.reason.more).toBe(2);
  });

  it("gives each other reason", () => {
    const reason = (data: ReportCardInput, hasSigner = true) => {
      const r = reportCardReadiness({ results: data.results, remarks: data.remarks, hasSigner });
      return r.ready ? null : r.reason;
    };
    expect(reason(input({ split: [] }))).toEqual({ kind: "no_split", message: "Results need the score split for Junior Secondary, 2026/2027. The VoxLMS team sets it." });
    expect(reason(input({ people: [] }))?.kind).toBe("no_students");
    const noSubjects = input();
    noSubjects.results = { ...noSubjects.results, subjects: [] };
    expect(reason(noSubjects)?.kind).toBe("no_subjects");
    expect(reason(input(), false)).toEqual({ kind: "no_signer", message: "Report cards need the principal’s name. The VoxLMS team adds it." });
  });
});

describe("the card model (AC-3 to AC-7)", () => {
  it("makes one card per student in register order, ignoring case", () => {
    const cards = buildReportCards(input(), TODAY);
    expect(cards.map((c) => `${c.student.surname} ${c.student.otherNames}`)).toEqual(["ADEWALE Tolu", "BELLO Musa", "OKON Emem"]);
  });

  it("prints the admission number, or the VoxLMS number when there is none", () => {
    const cards = buildReportCards(input(), TODAY);
    expect(cards[0].student).toMatchObject({ idLabel: "Admission no.", id: "GHS/2024/007", gender: "Female" });
    expect(cards[2].student).toMatchObject({ idLabel: "Student no.", id: "GHS-0123", gender: "Male" });
  });

  it("fills the student block from results", () => {
    const okon = buildReportCards(input(), TODAY)[2];
    expect(okon.title).toBe("Report card · First Term, 2026/2027");
    expect(okon.printedOn).toBe("Printed 19 October 2026");
    expect(okon.student).toMatchObject({
      className: "JSS 2 Gold",
      subjectsTaken: "2",
      numberInClass: "3",
      position: "3rd of 3",
      total: "121.5",
      average: "60.75",
      nextTermBegins: "Tuesday 5 January 2027",
    });
  });

  it("leaves out the next term date when the term has none", () => {
    const data = input();
    data.nextTermBeginsOn = null;
    expect(buildReportCards(data, TODAY)[0].student.nextTermBegins).toBeNull();
  });

  it("writes the subject rows and column heads with the results helpers", () => {
    const okon = buildReportCards(input(), TODAY)[2];
    expect(okon.columns).toEqual({ parts: ["CA 1 (20)", "CA 2 (20)", "Exam (60)"], total: "Total (100)" });
    expect(okon.rows[0]).toEqual({
      subject: "Mathematics",
      parts: ["10", "15", "40"],
      total: "65",
      grade: "B",
      position: "3rd",
      classAverage: "71.00",
      highest: "77",
      lowest: "65",
      remark: "Very good",
    });
    expect(okon.rows[1]).toMatchObject({ subject: "Basic Science", parts: ["12.5", "14", "30"], total: "56.5", grade: "C" });
  });

  it("shows dashes and no key without a grade scale", () => {
    const card = buildReportCards(input({ bands: [] }), TODAY)[0];
    expect(card.rows[0]).toMatchObject({ grade: "–", remark: "–" });
    expect(card.gradeKey).toBeNull();
  });

  it("gives an empty teacher's comment as null (blank lines) and both headings in the section's words", () => {
    const [, bello, okon] = buildReportCards(input(), TODAY);
    expect(bello.teacherComment).toEqual({ heading: "Form master’s comment", text: null, formMaster: "Mrs Funke Adewale" });
    expect(okon.teacherComment.text).toBe("Hardworking and well behaved.");
    expect(okon.headComment).toEqual({ heading: "Principal’s comment", text: "A good result." });
    expect(okon.signer).toEqual({ name: "Mr Samuel Adeleke", title: "Principal", signature: null });
  });

  it("leaves out the form master's name when none is assigned", () => {
    const data = input();
    data.formMaster = null;
    expect(buildReportCards(data, TODAY)[0].teacherComment.formMaster).toBeNull();
  });

  it("shows the logo only on the school logo plan, and Powered by only on basic", () => {
    const logo = { data: Buffer.from("png"), format: "png" as const };
    const data = { ...input(), logo };
    expect(buildReportCards(data, TODAY)[0].school).toMatchObject({ logo, poweredBy: false, contact: "+234 803 000 0000", motto: null });
    const basic = buildReportCards({ ...data, school: { ...data.school, plan: "basic" } }, TODAY)[0];
    expect(basic.school).toMatchObject({ logo: null, poweredBy: true });
  });

  it("shares one image object across every card, so it embeds once", () => {
    const cards = buildReportCards(worstCaseInput({ students: 3 }), TODAY);
    expect(cards[0].school.logo).toBe(cards[2].school.logo);
    expect(cards[0].signer.signature).toBe(cards[2].signer.signature);
  });
});

describe("helpers", () => {
  it("names the file with the session's slash as a dash (AC-3)", () => {
    expect(reportCardFileName("GHS", "JSS 2 Gold", 1, "2026/2027")).toBe("GHS JSS 2 Gold First Term 2026-2027 report cards.pdf");
  });

  it("writes the grade key high to low, each band up to the next less 0.1 (AC-6)", () => {
    expect(gradeKeyLine(SCALE, 1000)).toBe(
      "A 70 to 100 Excellent · B 60 to 69.9 Very good · C 50 to 59.9 Credit · D 45 to 49.9 Pass · E 40 to 44.9 Fair · F 0 to 39.9 Fail",
    );
    expect(gradeKeyLine([...SCALE].reverse(), 1000)?.startsWith("A 70 to 100")).toBe(true);
    expect(gradeKeyLine([{ grade: "A", min: 69.5, remark: "Top" }, { grade: "B", min: 0, remark: "" }], 1000)).toBe("A 69.5 to 100 Top · B 0 to 69.4");
    expect(gradeKeyLine([], 1000)).toBeNull();
  });

  it("formats dates as the card prints them", () => {
    expect(longDate("2027-01-11")).toBe("Monday 11 January 2027");
    expect(lagosDate(new Date("2026-10-18T09:00:00Z"))).toBe("18 October 2026");
  });
});
