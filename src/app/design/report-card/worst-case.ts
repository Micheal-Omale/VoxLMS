import { readFileSync } from "node:fs";
import path from "node:path";

import type { CardImage, ReportCardInput } from "@/lib/report-card";
import { computeClassResults, type ResultsPart } from "@/lib/results";

// The worst case class of spec 0012, AC-10, on made up data: 20 subjects with
// the longest real names, up to 5 split parts, 200 character comments, a long
// school name and address, and 45 students. The preview draws it, and the fit
// and size tests render it.

const SUBJECTS = [
  "English Language", "General Mathematics", "Basic Science and Technology", "Physical and Health Education",
  "Cultural and Creative Arts", "Christian Religious Studies", "Islamic Religious Studies", "National Values Education",
  "Pre-Vocational Studies", "Agricultural Science", "Literature in English", "Business Studies", "Computer Studies",
  "Further Mathematics", "Technical Drawing", "Home Economics", "Security Education", "Civic Education", "French", "Yoruba Language",
];

const SPLITS: Record<number, ResultsPart[]> = {
  1: [{ key: "exam", label: "Exam", max: 100 }],
  2: [{ key: "ca", label: "CA", max: 40 }, { key: "exam", label: "Exam", max: 60 }],
  3: [{ key: "ca1", label: "CA 1", max: 20 }, { key: "ca2", label: "CA 2", max: 20 }, { key: "exam", label: "Exam", max: 60 }],
  4: [{ key: "ca1", label: "CA 1", max: 10 }, { key: "ca2", label: "CA 2", max: 10 }, { key: "test", label: "Test", max: 20 }, { key: "exam", label: "Exam", max: 60 }],
  5: [
    { key: "ca1", label: "CA 1", max: 10 }, { key: "ca2", label: "CA 2", max: 10 }, { key: "ca3", label: "CA 3", max: 10 },
    { key: "proj", label: "Project", max: 10 }, { key: "exam", label: "Exam", max: 60 },
  ],
};

const SCALE = [
  { grade: "A1", min: 75, remark: "Excellent" }, { grade: "B2", min: 70, remark: "Very good" }, { grade: "B3", min: 65, remark: "Good" },
  { grade: "C4", min: 60, remark: "Credit" }, { grade: "C5", min: 55, remark: "Credit" }, { grade: "C6", min: 50, remark: "Credit" },
  { grade: "D7", min: 45, remark: "Pass" }, { grade: "E8", min: 40, remark: "Pass" }, { grade: "F9", min: 0, remark: "Fail, needs serious improvement" },
];

const SURNAMES = ["Oluwaseyifunmi", "Adewale", "Okonkwo-Eze", "Bello", "Chukwuemeka", "Ibrahim", "Olatunji", "Nwachukwu", "Danjuma", "Ogunleye"];
const OTHER = ["Oluwadamilare Chukwuemeka Babatunde", "Aisha Temitope", "Chiamaka Grace", "Emeka", "Fatima Oluwakemi", "Tolulope", "Ifeoma Blessing", "Yusuf", "Adaeze Precious", "Kehinde"];

const COMMENT_200 =
  "A very hardworking and well behaved student who takes part in every lesson, helps classmates and keeps neat notes. More reading at home will lift the weaker subjects next term. Keep up the steady effort.";
const HEAD_200 =
  "An excellent result across almost every subject this term. The school is proud of this steady work and good conduct. Keep reading every day, ask questions in class, and aim even higher next term. Well done.";

const readImage = (file: string): CardImage => ({ data: readFileSync(path.join(process.cwd(), "src", "app", "design", "report-card", file)), format: "png" });

/** The made up class, final and ready to print. `parts` is 1 to 5. */
export function worstCaseInput({ parts = 5, plan = "school_logo", students = 45 }: { parts?: number; plan?: "basic" | "school_logo"; students?: number } = {}): ReportCardInput {
  const split = SPLITS[Math.min(5, Math.max(1, parts))];
  const people = Array.from({ length: students }, (_, i) => ({
    studentId: `s${i}`,
    surname: SURNAMES[i % SURNAMES.length],
    otherNames: OTHER[(i * 3) % OTHER.length],
    studentNo: 1000 + i,
    // Every third student has no admission number, so the VoxLMS number shows.
    admissionNo: i % 3 === 2 ? null : `GGSS/2024/${String(i + 1).padStart(4, "0")}`,
  }));
  const subjects = SUBJECTS.map((name, i) => ({
    classSubjectId: `cs${i}`,
    name,
    shortName: name.slice(0, 4).toUpperCase(),
    isElective: i >= 17,
    takerIds: people.map((p) => p.studentId),
  }));
  const scores: Record<string, Record<string, Record<string, string>>> = {};
  people.forEach((p, si) => {
    scores[p.studentId] = {};
    subjects.forEach((subject, ci) => {
      const row: Record<string, string> = {};
      split.forEach((part, pi) => {
        const share = ((si * 37 + ci * 11 + pi * 17 + si * ci + si * si * (ci + 2)) % 17) / 20 + 0.12;
        row[part.key] = String(Math.min(part.max, Math.round(part.max * share * 2) / 2));
      });
      scores[p.studentId][subject.classSubjectId] = row;
    });
  });

  const figures = computeClassResults({ split, gradeBands: SCALE, subjects, students: people, scores });
  return {
    results: {
      cls: { id: "demo", name: "SSS 3 Science Gold" },
      term: { id: "t1", number: 1, isCurrent: true },
      section: { name: "Senior Secondary" },
      session: { name: "2026/2027" },
      split,
      ...figures,
    },
    remarks: {
      rows: people.map((p, i) => ({
        studentId: p.studentId,
        // Every fifth student has no teacher's comment, so the blank lines show.
        teacherRemark: i % 5 === 4 ? null : COMMENT_200,
        head: { kind: "typed" as const, text: HEAD_200 },
      })),
    },
    school: {
      name: "Government Girls’ Secondary School and Model Comprehensive College, Ikot Ekpene",
      code: "GGSS",
      address: "Plot 14 to 18, Old Aba Road, Behind the Local Government Secretariat, Ikot Ekpene, Akwa Ibom State",
      phone: "0803 123 4567, 0812 765 4321",
      email: "admissions.office@governmentgirlsikotekpene.edu.ng",
      motto: "Knowledge, Discipline and Service to the Nation",
      plan,
    },
    teacherTitle: "Form master",
    formMaster: { title: "Mrs", name: "Ngozi Chiamaka Okonkwo-Adebayo" },
    signer: { title: "Principal", name: "Dr (Mrs) Oluwakemi Adebisi Oyelaran-Nwachukwu" },
    gradeBands: SCALE,
    nextTermBeginsOn: "2027-01-05",
    genders: Object.fromEntries(people.map((p, i) => [p.studentId, i % 2 === 0 ? "female" : "male"])),
    logo: readImage("demo-logo.png"),
    signature: readImage("demo-signature.png"),
  };
}
