import { describe, expect, it } from "vitest";

import { gradeFor } from "@/components/score-sheet/score-math";
import {
  computeClassResults,
  divHalfUp,
  formatHundredths,
  formatTenths,
  gradeOf,
  missingLabel,
  ordinal,
  positions,
  type ResultsInput,
  toTenths,
} from "@/lib/results";

// Spec 0010: the results rules (AC-1 to AC-7) against a class worked out by
// hand (AC-12). The withdrawn student is left out by the loader, so it is
// covered by the database tests in results-data.test.ts.

const split = [
  { key: "ca1", label: "CA 1", max: 20 },
  { key: "ca2", label: "CA 2", max: 20 },
  { key: "exam", label: "Exam", max: 60 },
];
const bands = [
  { grade: "A", min: 70, remark: "Excellent" },
  { grade: "B", min: 60, remark: "Very good" },
  { grade: "C", min: 50, remark: "Credit" },
  { grade: "D", min: 45, remark: "Pass" },
  { grade: "E", min: 40, remark: "Fair" },
  { grade: "F", min: 0, remark: "Fail" },
];

const student = (studentId: string, surname: string, studentNo: number) => ({ studentId, surname, otherNames: "Test", studentNo, admissionNo: null });

// Eight students; Halima and Ade take the elective French.
const students = [
  student("ade", "Ade", 1),
  student("bola", "Bola", 2),
  student("chi", "Chi", 3),
  student("dayo", "Dayo", 4),
  student("emeka", "Emeka", 5),
  student("funmi", "Funmi", 6),
  student("gbenga", "Gbenga", 7),
  student("halima", "Halima", 8),
];
const everyone = students.map((s) => s.studentId);
const subjects = [
  { classSubjectId: "maths", name: "Mathematics", shortName: "MTH", isElective: false, takerIds: everyone },
  { classSubjectId: "english", name: "English Language", shortName: "ENG", isElective: false, takerIds: everyone },
  { classSubjectId: "bsc", name: "Basic Science", shortName: "BSC", isElective: false, takerIds: everyone },
  { classSubjectId: "french", name: "French", shortName: "FRE", isElective: true, takerIds: ["ade", "halima"] },
];

const p = (ca1: string, ca2: string, exam?: string): Record<string, string> => (exam === undefined ? { ca1, ca2 } : { ca1, ca2, exam });

// The worked sheet. Totals per subject (CA 1 + CA 2 + Exam):
//            Maths   English  BSc   French | total  average   exact
// Chi        80      80       80           | 240    80.00
// Dayo       75      75       75           | 225    75.00
// Ade        69.5    67.2     66    67     | 269.7  67.43     67.425 (half up)
// Bola       67.3    67       68           | 202.3  67.43     67.4333
// Emeka      60      60       60           | 180    60.00
// Halima     50      50       50    50     | 200    50.00
// Gbenga     20      40       30           | 90     30.00     (Maths Exam typed 0)
// Funmi      24+—    55       50           | incomplete: Maths Exam not entered
function sampleScores(): ResultsInput["scores"] {
  return {
    chi: { maths: p("16", "16", "48"), english: p("16", "16", "48"), bsc: p("16", "16", "48") },
    dayo: { maths: p("15", "15", "45"), english: p("15", "15", "45"), bsc: p("15", "15", "45") },
    ade: { maths: p("14.5", "15", "40"), english: p("13.2", "14", "40"), bsc: p("13", "13", "40"), french: p("13", "14", "40") },
    bola: { maths: p("13.3", "14", "40"), english: p("13", "14", "40"), bsc: p("14", "14", "40") },
    emeka: { maths: p("12", "12", "36"), english: p("12", "12", "36"), bsc: p("12", "12", "36") },
    halima: { maths: p("10", "10", "30"), english: p("10", "10", "30"), bsc: p("10", "10", "30"), french: p("10", "10", "30") },
    gbenga: { maths: p("10", "10", "0"), english: p("8", "8", "24"), bsc: p("6", "6", "18") },
    funmi: { maths: p("12", "12"), english: p("11", "11", "33"), bsc: p("10", "10", "30") },
  };
}

const sample = (scores = sampleScores()): ResultsInput => ({ split, gradeBands: bands, subjects, students, scores });
const byId = (r: ReturnType<typeof computeClassResults>, id: string) => r.students.find((s) => s.studentId === id)!;
const subjectOf = (r: ReturnType<typeof computeClassResults>, id: string, subjectId: string) =>
  byId(r, id).subjects.find((s) => s.classSubjectId === subjectId);

describe("arithmetic helpers", () => {
  it("reads scores as tenths from their text", () => {
    expect(toTenths("12")).toBe(120);
    expect(toTenths("12.5")).toBe(125);
    expect(toTenths("0")).toBe(0);
    expect(toTenths("100")).toBe(1000);
    expect(() => toTenths("abc")).toThrow();
    expect(() => toTenths("12.55")).toThrow();
  });

  it("divides with halves going up (AC-2)", () => {
    // 67.455 becomes 67.46, 67.454 becomes 67.45 (in thousandths over 10).
    expect(divHalfUp(67455, 10)).toBe(6746);
    expect(divHalfUp(67454, 10)).toBe(6745);
    expect(divHalfUp(67445, 10)).toBe(6745);
    expect(divHalfUp(5, 2)).toBe(3);
    expect(divHalfUp(7, 7)).toBe(1);
    expect(divHalfUp(0, 3)).toBe(0);
    expect(() => divHalfUp(1, 0)).toThrow();
  });

  it("ranks with shared positions and skips the next (AC-3)", () => {
    expect(positions([80, 75, 67, 67, 60])).toEqual([1, 2, 3, 3, 5]);
    expect(positions([5, 5, 5])).toEqual([1, 1, 1]);
    expect(positions([])).toEqual([]);
  });

  it("writes ordinals with no tie mark (AC-3)", () => {
    const cases: [number, string][] = [
      [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"],
      [21, "21st"], [22, "22nd"], [23, "23rd"], [101, "101st"], [111, "111th"], [112, "112th"],
    ];
    for (const [n, text] of cases) expect(ordinal(n)).toBe(text);
  });

  it("formats totals with one decimal only when needed, averages always with two", () => {
    expect(formatTenths(695)).toBe("69.5");
    expect(formatTenths(700)).toBe("70");
    expect(formatTenths(0)).toBe("0");
    expect(formatHundredths(6740)).toBe("67.40");
    expect(formatHundredths(6743)).toBe("67.43");
    expect(formatHundredths(5)).toBe("0.05");
  });

  it("names the missing parts the way the report card will", () => {
    expect(missingLabel([{ subjectName: "Mathematics", partLabels: ["Exam"] }, { subjectName: "Basic Science", partLabels: ["CA 2"] }])).toBe(
      "Mathematics: Exam · Basic Science: CA 2",
    );
    expect(missingLabel([{ subjectName: "French", partLabels: ["CA 1", "Exam"] }])).toBe("French: CA 1, Exam");
    expect(missingLabel([])).toBe("takes no subjects yet");
  });
});

describe("grades (AC-1)", () => {
  it("compares the exact total with each band's lowest score", () => {
    expect(gradeOf(695, bands)?.grade).toBe("B");
    expect(gradeOf(700, bands)?.grade).toBe("A");
    expect(gradeOf(0, bands)?.grade).toBe("F");
    expect(gradeOf(700, [])).toBeUndefined();
  });

  it("agrees with the score sheet's live grade for every total from 0 to 100 in halves", () => {
    for (let tenths = 0; tenths <= 1000; tenths += 5) {
      expect(gradeOf(tenths, bands)?.grade, `total ${tenths / 10}`).toBe(gradeFor(tenths / 10, bands)?.grade);
    }
  });
});

describe("the hand calculated sample class (AC-12)", () => {
  const r = computeClassResults(sample());

  it("works out every subject total, grade and remark (AC-1)", () => {
    expect(subjectOf(r, "ade", "maths")).toMatchObject({ total: 695, grade: "B", remark: "Very good", missing: [] });
    expect(subjectOf(r, "chi", "maths")).toMatchObject({ total: 800, grade: "A", remark: "Excellent" });
    expect(subjectOf(r, "gbenga", "maths")).toMatchObject({ total: 200, grade: "F" });
    expect(subjectOf(r, "bola", "maths")).toMatchObject({ total: 673, grade: "B" });
    expect(subjectOf(r, "halima", "french")).toMatchObject({ total: 500, grade: "C" });
    expect(subjectOf(r, "ade", "maths")?.scores).toEqual({ ca1: "14.5", ca2: "15", exam: "40" });
  });

  it("counts a typed 0 as a real score (AC-2)", () => {
    expect(subjectOf(r, "gbenga", "maths")?.total).toBe(200);
    expect(byId(r, "gbenga")).toMatchObject({ status: "ranked", total: 900, average: 3000 });
  });

  it("works out each student's total and two place average on their own number of subjects (AC-2)", () => {
    expect(byId(r, "chi")).toMatchObject({ total: 2400, average: 8000 });
    expect(byId(r, "dayo")).toMatchObject({ total: 2250, average: 7500 });
    // 269.7 / 4 = 67.425, half up to 67.43.
    expect(byId(r, "ade")).toMatchObject({ total: 2697, average: 6743 });
    // 202.3 / 3 = 67.4333 to 67.43.
    expect(byId(r, "bola")).toMatchObject({ total: 2023, average: 6743 });
    expect(byId(r, "emeka")).toMatchObject({ total: 1800, average: 6000 });
    expect(byId(r, "halima")).toMatchObject({ total: 2000, average: 5000 });
  });

  it("shares a position on equal two place averages and skips the next (AC-3)", () => {
    const order = r.students.map((s) => [s.studentId, s.position]);
    expect(order).toEqual([
      ["chi", 1],
      ["dayo", 2],
      ["ade", 3],
      ["bola", 3],
      ["emeka", 5],
      ["halima", 6],
      ["gbenga", 7],
      ["funmi", null],
    ]);
  });

  it("leaves a student with a missing part unranked, naming what is missing (AC-2)", () => {
    const funmi = byId(r, "funmi");
    expect(funmi).toMatchObject({ status: "incomplete", total: null, average: null, position: null });
    expect(funmi.missing).toEqual([{ subjectName: "Mathematics", partLabels: ["Exam"] }]);
    expect(missingLabel(funmi.missing)).toBe("Mathematics: Exam");
    expect(subjectOf(r, "funmi", "maths")).toMatchObject({ total: null, grade: null, position: null, missing: ["Exam"], scores: { ca1: "12", ca2: "12" } });
  });

  it("still gives an incomplete student positions in their complete subjects (AC-5)", () => {
    expect(subjectOf(r, "funmi", "english")).toMatchObject({ total: 550, position: 6, provisional: false });
    expect(subjectOf(r, "funmi", "bsc")).toMatchObject({ total: 500, position: 6 });
  });

  it("ranks each subject's complete takers, sharing ties (AC-5)", () => {
    const pos = (subjectId: string) => everyone.map((id) => subjectOf(r, id, subjectId)?.position ?? null);
    // ade, bola, chi, dayo, emeka, funmi, gbenga, halima
    expect(pos("maths")).toEqual([3, 4, 1, 2, 5, null, 7, 6]);
    expect(pos("english")).toEqual([3, 4, 1, 2, 5, 6, 8, 7]);
    expect(pos("bsc")).toEqual([4, 3, 1, 2, 5, 6, 8, 6]);
    expect(pos("french")).toEqual([1, null, null, null, null, null, null, 2]);
  });

  it("works out each subject's class average, highest and lowest over complete takers (AC-5)", () => {
    const fig = (id: string) => {
      const s = r.subjects.find((x) => x.classSubjectId === id)!;
      return [s.takers, s.completeTakers, s.classAverage, s.highest, s.lowest, s.provisional];
    };
    // Maths: 421.8 / 7 = 60.257 → 60.26; provisional while Funmi's Exam is missing.
    expect(fig("maths")).toEqual([8, 7, 6026, 800, 200, true]);
    // English: 494.2 / 8 = 61.775 → 61.78 (half up).
    expect(fig("english")).toEqual([8, 8, 6178, 800, 400, false]);
    // Basic Science: 479 / 8 = 59.875 → 59.88.
    expect(fig("bsc")).toEqual([8, 8, 5988, 800, 300, false]);
    // French counts only its two registered takers: 117 / 2 = 58.50.
    expect(fig("french")).toEqual([2, 2, 5850, 670, 500, false]);
  });

  it("marks a complete student's subject provisional while other takers are incomplete in it (AC-7)", () => {
    expect(subjectOf(r, "chi", "maths")).toMatchObject({ position: 1, provisional: true });
    expect(subjectOf(r, "chi", "english")?.provisional).toBe(false);
  });

  it("works out the class average from the ranked averages and keeps it provisional (AC-6, AC-7)", () => {
    // (80 + 75 + 67.43 + 67.43 + 60 + 50 + 30) / 7 = 61.4086 → 61.41
    expect(r).toMatchObject({ numberInClass: 8, incompleteCount: 1, final: false, classAverage: 6141 });
  });

  it("only lists the subjects a student takes, compulsory first then electives (AC-1)", () => {
    expect(byId(r, "ade").subjects.map((s) => s.classSubjectId)).toEqual(["maths", "english", "bsc", "french"]);
    expect(byId(r, "bola").subjects.map((s) => s.classSubjectId)).toEqual(["maths", "english", "bsc"]);
  });

  it("turns final once the missing part is entered (AC-7)", () => {
    const scores = sampleScores();
    scores.funmi.maths.exam = "30";
    const done = computeClassResults(sample(scores));
    expect(done).toMatchObject({ final: true, incompleteCount: 0 });
    expect(byId(done, "funmi")).toMatchObject({ status: "ranked", total: 1590, average: 5300, position: 6 });
    expect(byId(done, "halima").position).toBe(7);
    expect(done.subjects.every((s) => !s.provisional)).toBe(true);
  });
});

describe("edge cases", () => {
  it("shows dashes for grades without a scale while every other figure works (AC-1)", () => {
    const r = computeClassResults({ ...sample(), gradeBands: [] });
    expect(subjectOf(r, "chi", "maths")).toMatchObject({ total: 800, grade: null, remark: null, position: 1 });
    expect(byId(r, "chi")).toMatchObject({ average: 8000, position: 1 });
  });

  it("makes nobody complete without a split (AC-7, AC-9)", () => {
    const r = computeClassResults({ ...sample(), split: [] });
    expect(r).toMatchObject({ final: false, incompleteCount: 8, classAverage: null });
    expect(r.subjects.every((s) => s.classAverage === null && s.highest === null)).toBe(true);
  });

  it("says a student who takes no subjects is incomplete, and the class stays provisional (AC-2)", () => {
    const r = computeClassResults({
      split,
      gradeBands: bands,
      subjects: [{ classSubjectId: "french", name: "French", shortName: "FRE", isElective: true, takerIds: ["ade"] }],
      students: [student("ade", "Ade", 1), student("zara", "Zara", 2)],
      scores: { ade: { french: p("10", "10", "30") } },
    });
    expect(byId(r, "zara")).toMatchObject({ status: "incomplete", subjects: [], missing: [], position: null });
    expect(missingLabel(byId(r, "zara").missing)).toBe("takes no subjects yet");
    expect(byId(r, "ade")).toMatchObject({ position: 1, average: 5000 });
    expect(r).toMatchObject({ final: false, numberInClass: 2, incompleteCount: 1, classAverage: 5000 });
  });

  it("shows dashes for a subject with no complete takers (AC-5)", () => {
    const r = computeClassResults({ ...sample(), scores: {} });
    expect(r.subjects[0]).toMatchObject({ completeTakers: 0, classAverage: null, highest: null, lowest: null, provisional: true });
    expect(r.classAverage).toBeNull();
  });

  it("is not final with no students or no subjects (AC-7)", () => {
    expect(computeClassResults({ ...sample(), students: [] })).toMatchObject({ final: false, numberInClass: 0, classAverage: null });
    expect(computeClassResults({ ...sample(), subjects: [] }).final).toBe(false);
  });

  it("ignores scores for parts outside the split and for students not enrolled", () => {
    const scores = sampleScores();
    scores.chi.maths.ca3 = "20";
    scores.ghost = { maths: p("20", "20", "60") };
    const r = computeClassResults(sample(scores));
    expect(subjectOf(r, "chi", "maths")?.total).toBe(800);
    expect(r.subjects[0].takers).toBe(8);
    expect(r.subjects[0].highest).toBe(800);
  });

  it("counts a subject once when a student is listed twice as a taker", () => {
    const r = computeClassResults({ ...sample(), subjects: [{ ...subjects[0], takerIds: [...everyone, "chi"] }] });
    expect(r.subjects[0].takers).toBe(8);
    expect(byId(r, "chi").subjects).toHaveLength(1);
  });

  it("orders equal positions and the incomplete group by surname, other names, then student number (AC-8)", () => {
    const tie = [
      { studentId: "z", surname: "okafor", otherNames: "Chidi", studentNo: 9, admissionNo: null },
      { studentId: "y", surname: "Okafor", otherNames: "Chidi", studentNo: 3, admissionNo: null },
      { studentId: "x", surname: "Adeyemi", otherNames: "Tolu", studentNo: 5, admissionNo: null },
      { studentId: "w", surname: "Okáfor", otherNames: "Ada", studentNo: 7, admissionNo: null },
    ];
    const r = computeClassResults({
      split,
      gradeBands: bands,
      subjects: [{ classSubjectId: "maths", name: "Mathematics", shortName: "MTH", isElective: false, takerIds: tie.map((t) => t.studentId) }],
      students: tie,
      scores: {},
    });
    expect(r.students.map((s) => s.studentId)).toEqual(["x", "w", "y", "z"]);
  });
});

describe("more boundaries", () => {
  it("trims spaces around a score and reads the top mark of 100", () => {
    expect(toTenths(" 12.5 ")).toBe(125);
    expect(formatTenths(toTenths("100"))).toBe("100");
    expect(() => toTenths("")).toThrow();
    expect(() => toTenths("-1")).toThrow();
  });

  it("grades against a band that starts at a half mark (AC-1)", () => {
    const halfBands = [
      { grade: "P", min: 49.5, remark: "Pass" },
      { grade: "F", min: 0, remark: "Fail" },
    ];
    expect(gradeOf(495, halfBands)?.grade).toBe("P");
    expect(gradeOf(494, halfBands)?.grade).toBe("F");
  });

  it("picks the right band whatever order the scale arrives in (AC-1)", () => {
    expect(gradeOf(695, [...bands].reverse())?.grade).toBe("B");
  });

  it("names a missing subject with no part labels when there is no split", () => {
    expect(missingLabel([{ subjectName: "Mathematics", partLabels: [] }])).toBe("Mathematics");
  });

  it("gives every student the same position when all averages are equal (AC-3)", () => {
    const same: ResultsInput["scores"] = Object.fromEntries(everyone.map((id) => [id, { maths: p("10", "10", "30"), english: p("10", "10", "30"), bsc: p("10", "10", "30"), french: p("10", "10", "30") }]));
    const r = computeClassResults(sample(same));
    expect(new Set(r.students.map((s) => s.position))).toEqual(new Set([1]));
    expect(r.classAverage).toBe(5000);
  });

  it("returns the same figures for the same inputs every time (no clock, no randomness)", () => {
    expect(computeClassResults(sample())).toEqual(computeClassResults(sample()));
  });
});
