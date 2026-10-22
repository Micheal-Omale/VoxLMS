import { computeClassResults } from "@/lib/results";
import type { ClassResults } from "@/server/data";

import { demoColumns, demoColumnsFive, demoScale, demoStudents } from "./demo-data";

// Twenty made-up subjects; the preview shows the first 8 unless ?subjects=20.
const SUBJECTS = [
  "English Studies", "Mathematics", "Basic Science", "Basic Technology", "Social Studies", "Civic Education", "Yoruba",
  "Computer Studies", "Agricultural Science", "Home Economics", "Business Studies", "Christian Religious Studies",
  "Cultural and Creative Arts", "Physical and Health Education", "French", "Security Education", "Hausa", "Igbo",
  "Literature in English", "Music",
];

export function demoResults({ five, count, state }: { five: boolean; count: number; state?: string }): ClassResults {
  const split = five ? demoColumnsFive : demoColumns;
  const names = SUBJECTS.slice(0, count);
  // The last two subjects are electives taken by every other student.
  const subjects = names.map((name, i) => {
    const isElective = i >= count - 2;
    return {
      classSubjectId: `cs${i}`,
      name,
      shortName: name.slice(0, 3).toUpperCase(),
      isElective,
      takerIds: demoStudents.filter((_, s) => !isElective || s % 2 === 0).map((s) => s.id),
    };
  });
  const students = demoStudents.map((s, i) => ({ studentId: s.id, surname: s.surname, otherNames: s.otherNames, studentNo: 101 + i, admissionNo: `GHS/2024/${String(i + 1).padStart(3, "0")}` }));

  // A fixed spread of marks; Ojo and Okafor are missing a part unless ?state=final.
  const scores: Record<string, Record<string, Record<string, string>>> = {};
  demoStudents.forEach((s, si) => {
    scores[s.id] = {};
    subjects.forEach((subject, ci) => {
      const row: Record<string, string> = {};
      split.forEach((part, pi) => {
        const share = ((si * 37 + ci * 11 + pi * 17 + si * ci) % 17) / 20 + 0.1;
        row[part.key] = String(Math.round(part.max * share * 2) / 2);
      });
      scores[s.id][subject.classSubjectId] = row;
    });
  });
  // Two students with the same marks share a position.
  scores.s3 = structuredClone(scores.s1);
  if (state !== "final") {
    delete scores.s13.cs1.exam;
    delete scores.s14.cs2[split[1].key];
    delete scores.s14.cs3.exam;
  }

  const figures = computeClassResults({ split, gradeBands: demoScale, subjects, students, scores });
  return {
    cls: { id: "demo", name: "JSS 2 Gold" },
    term: { id: "t1", number: 1, isCurrent: true },
    section: { name: "Junior Secondary" },
    session: { name: "2026/2027" },
    split: state === "nosplit" ? [] : split,
    hasGradeScale: true,
    ...figures,
  };
}
