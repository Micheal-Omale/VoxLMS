// Made-up data for the design previews only. Never real children's records.
import type { GradeBand, ScoreColumn } from "@/components/score-sheet/score-math";
import type { SheetScores, SheetStudent } from "@/components/score-sheet/score-sheet";

export const demoSchool = { name: "Grace High School" };
export const demoTerm = "First Term, 2026/2027";
export const demoTeacher = { name: "Mrs Funke Adewale", role: "Form teacher, JSS 2 Gold" };

export const demoColumns: ScoreColumn[] = [
  { key: "ca1", label: "CA 1", max: 20 },
  { key: "ca2", label: "CA 2", max: 20 },
  { key: "exam", label: "Exam", max: 60 },
];

// A common junior secondary scale; real scales are set per school section.
export const demoScale: GradeBand[] = [
  { grade: "A", min: 70, remark: "Excellent" },
  { grade: "B", min: 60, remark: "Very good" },
  { grade: "C", min: 50, remark: "Good" },
  { grade: "D", min: 45, remark: "Fair" },
  { grade: "E", min: 40, remark: "Pass" },
  { grade: "F", min: 0, remark: "Fail" },
];

export const demoSubjects = [
  "Mathematics",
  "English Studies",
  "Basic Science",
  "Basic Technology",
  "Social Studies",
  "Civic Education",
  "Yoruba",
  "Computer Studies",
];

export const demoStudents: SheetStudent[] = [
  ["Abubakar", "Sadiq"],
  ["Adebayo", "Oluwaseun"],
  ["Adeyemi", "Tolulope Grace"],
  ["Afolabi", "Temitope"],
  ["Bello", "Abdulrahman"],
  ["Danjuma", "Zainab"],
  ["Eze", "Chukwuemeka"],
  ["Ibrahim", "Hauwa"],
  ["Musa", "Aisha"],
  ["Nwosu", "Ifeoma"],
  ["Obi", "Uchenna"],
  ["Ogunleye", "Damilola"],
  ["Ojo", "Precious"],
  ["Okafor", "Chiamaka"],
  ["Okon", "Emem"],
  ["Etim", "Blessing"],
].map(([surname, otherNames], i) => ({ id: `s${i + 1}`, surname, otherNames }));

const filled: [string, string, string][] = [
  ["17", "15", "48"],
  ["12", "14", "39"],
  ["19", "18", "54"],
  ["9", "11", "27"],
  ["15", "16", "41"],
  ["18", "", ""],
  ["14", "13", "44"],
  ["16", "17", "50"],
  ["11", "", "35"],
  ["20", "19", "57"],
  ["13", "12", "38"],
  ["", "", ""],
  ["", "", ""],
  ["", "", ""],
  ["15", "16", "45"],
  ["", "", ""],
];

export const demoScores: SheetScores = Object.fromEntries(
  demoStudents.map((student, i) => {
    const [ca1, ca2, exam] = filled[i];
    return [student.id, { ca1, ca2, exam }];
  }),
);

// A five part split, so the preview can show the sheet at its widest (spec 0009).
export const demoColumnsFive: ScoreColumn[] = [
  { key: "ca1", label: "CA 1", max: 10 },
  { key: "ca2", label: "CA 2", max: 10 },
  { key: "test", label: "Test", max: 10 },
  { key: "project", label: "Project", max: 10 },
  { key: "exam", label: "Exam", max: 60 },
];

export const demoScoresFive: SheetScores = Object.fromEntries(
  demoStudents.map((student, i) => {
    const [ca1, ca2, exam] = filled[i];
    const half = (v: string) => (v === "" ? "" : String(Math.round(Number(v) / 2)));
    return [student.id, { ca1: half(ca1), ca2: half(ca2), test: half(ca1), project: ca2 === "" ? "" : "10", exam }];
  }),
);
