// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ResultsSection } from "@/app/[school]/classes/[classId]/results-section";
import { computeClassResults, type ResultsInput } from "@/lib/results";
import type { ClassResults } from "@/server/data";

// Spec 0010, AC-8 and AC-9: the class page's Results section and a student's
// breakdown. The figures come from computeClassResults (test/results.test.ts).

afterEach(cleanup);

const split = [
  { key: "ca", label: "CA", max: 40 },
  { key: "exam", label: "Exam", max: 60 },
];
const bands = [
  { grade: "A", min: 70, remark: "Excellent" },
  { grade: "B", min: 60, remark: "Very good" },
  { grade: "F", min: 0, remark: "Fail" },
];
const student = (studentId: string, surname: string, otherNames: string, studentNo: number) => ({ studentId, surname, otherNames, studentNo, admissionNo: null });
const students = [
  student("a", "Okon", "Emem", 1),
  student("b", "Bello", "Abdulrahman", 2),
  student("c", "Eze", "Chukwuemeka", 3),
  student("d", "Abubakar", "Sadiq", 4),
  student("e", "Ojo", "Precious", 5),
];
const ids = students.map((s) => s.studentId);
const subjects = [
  { classSubjectId: "eng", name: "English Studies", shortName: "ENG", isElective: false, takerIds: ids },
  { classSubjectId: "mth", name: "Mathematics", shortName: "MTH", isElective: false, takerIds: ids },
];
const both = (eng: [string, string], mth: [string, string?]): Record<string, Record<string, string>> => ({
  eng: { ca: eng[0], exam: eng[1] },
  mth: mth[1] === undefined ? { ca: mth[0] } : { ca: mth[0], exam: mth[1] },
});
// Okon 80, Bello and Eze tie on 65, Abubakar 50; Ojo has no Mathematics Exam.
const scores: ResultsInput["scores"] = {
  a: both(["30", "50"], ["30", "50"]),
  b: both(["25", "45"], ["20", "40"]),
  c: both(["20", "40"], ["25", "45"]),
  d: both(["20", "30"], ["20", "30"]),
  e: both(["35", "34.5"], ["30"]),
};

function results(input: Partial<ResultsInput> = {}): ClassResults {
  const full = { split, gradeBands: bands, subjects, students, scores, ...input };
  return {
    cls: { id: "c1", name: "JSS 2 Gold" },
    term: { id: "t1", number: 1, isCurrent: true },
    section: { name: "Junior Secondary" },
    session: { name: "2026/2027" },
    split: full.split,
    hasGradeScale: full.gradeBands.length > 0,
    ...computeClassResults(full),
  };
}

const show = (r = results()) => render(h(ResultsSection, { results: r, schoolCode: "GHS" }));
const section = () => screen.getByRole("region", { name: "Results" });

describe("the Results section (AC-8)", () => {
  it("shows the number in class and class average, and says the results are provisional and why", () => {
    show();
    expect(section()).toHaveTextContent("5 in class");
    // (80 + 65 + 65 + 50) / 4 = 65.00
    expect(section()).toHaveTextContent("Class average 65.00");
    expect(section()).toHaveTextContent("Provisional: 1 student incomplete.");
    expect(section()).not.toHaveTextContent("Final");
  });

  it("lists ranked students in position order, sharing a tie in surname order, with total and average", () => {
    show();
    const rows = within(screen.getByRole("list", { name: "JSS 2 Gold positions" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^1stOkon Emem.*160.*80\.00/),
      expect.stringMatching(/^2ndBello Abdulrahman.*130.*65\.00/),
      expect.stringMatching(/^2ndEze Chukwuemeka.*130.*65\.00/),
      expect.stringMatching(/^4thAbubakar Sadiq.*100.*50\.00/),
    ]);
  });

  it("groups incomplete students with exactly what is missing", () => {
    show();
    const rows = within(screen.getByRole("list", { name: "JSS 2 Gold incomplete" })).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Ojo Precious");
    expect(rows[0]).toHaveTextContent("Missing Mathematics: Exam");
  });

  it("says when a student takes no subjects yet", () => {
    show(results({ subjects: [{ ...subjects[0], takerIds: ["a", "b", "c", "d"] }] }));
    expect(within(screen.getByRole("list", { name: "JSS 2 Gold incomplete" })).getByRole("listitem")).toHaveTextContent("Takes no subjects yet");
  });

  it("says Final with no banner once every score is in", () => {
    show(results({ students: students.slice(0, 4) }));
    expect(section()).toHaveTextContent("Final");
    expect(section()).not.toHaveTextContent("Provisional");
    expect(screen.queryByRole("list", { name: "JSS 2 Gold incomplete" })).not.toBeInTheDocument();
  });

  it("makes every row a button at least as tall as the 44px rule asks", () => {
    show();
    for (const button of within(section()).getAllByRole("button")) expect(button.className).toContain("min-h-14");
  });
});

describe("empty states (AC-9)", () => {
  it("names the section and session when the split is not set, and shows no figures", () => {
    show(results({ split: [] }));
    expect(section()).toHaveTextContent("Results need the score split for Junior Secondary, 2026/2027. The VoxLMS team sets it.");
    expect(section()).not.toHaveTextContent("in class");
    expect(within(section()).queryAllByRole("button")).toHaveLength(0);
  });

  it("says when the class has no students or no subjects", () => {
    show(results({ students: [] }));
    expect(section()).toHaveTextContent("No students in JSS 2 Gold yet");
    cleanup();
    show(results({ subjects: [] }));
    expect(section()).toHaveTextContent("No subjects are set for JSS 2 Gold yet");
  });
});

describe("a student's breakdown (AC-8)", () => {
  it("opens from a row with every subject's parts and figures, then the overall position", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: /Bello Abdulrahman/ }));
    const panel = await screen.findByRole("dialog", { name: "Bello Abdulrahman" });
    expect(panel).toHaveTextContent("Results · First Term, 2026/2027 · GHS-0002");

    const list = within(panel).getByRole("list", { name: "Subjects" });
    expect(within(list).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["English Studies", "Mathematics"]);
    const block = (name: string) => within(list).getByRole("heading", { name }).closest("li")!;
    const english = block("English Studies");
    expect(english).toHaveTextContent("CA25/40");
    expect(english).toHaveTextContent("Exam45/60");
    expect(english).toHaveTextContent("Total70");
    expect(english).toHaveTextContent("GradeAExcellent");
    // English: Okon 80, Ojo 69.5 (complete in English), Bello 70 → Bello 2nd.
    expect(english).toHaveTextContent("Position2nd");
    expect(english).not.toHaveTextContent("Provisional");
    const maths = block("Mathematics");
    expect(maths).toHaveTextContent("Total60");
    expect(maths).toHaveTextContent("GradeB");
    // Mathematics is provisional while Ojo's Exam is missing.
    expect(maths).toHaveTextContent("Provisional");
    expect(maths).toHaveTextContent("Highest80");
    expect(maths).toHaveTextContent("Lowest50");

    const overall = within(panel).getByRole("region", { name: "Overall" });
    expect(overall).toHaveTextContent("Total130");
    expect(overall).toHaveTextContent("Average65.00");
    expect(overall).toHaveTextContent("Position2nd of 5");
    expect(overall).toHaveTextContent("Provisional");
  });

  it("shows a missing part as a dash, never a 0, and names what keeps the student incomplete", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: /Ojo Precious/ }));
    const panel = await screen.findByRole("dialog", { name: "Ojo Precious" });
    const maths = within(panel).getByRole("heading", { name: "Mathematics" }).closest("li")!;
    expect(maths).toHaveTextContent("Exam–/60");
    expect(maths).toHaveTextContent("Exam not entered yet");
    expect(maths).toHaveTextContent("Total–");
    expect(maths).toHaveTextContent("Position–");
    expect(within(panel).getByRole("region", { name: "Overall" })).toHaveTextContent("Incomplete: Mathematics: Exam");
  });

  it("shows grades as dashes without a grade scale", async () => {
    show(results({ gradeBands: [] }));
    await userEvent.click(screen.getByRole("button", { name: /Okon Emem/ }));
    const panel = await screen.findByRole("dialog", { name: "Okon Emem" });
    const english = within(panel).getByRole("heading", { name: "English Studies" }).closest("li")!;
    expect(english).toHaveTextContent("Total80");
    expect(english).toHaveTextContent("Grade–");
    expect(english).toHaveTextContent("Position1st");
  });
});

describe("more of the section and the breakdown", () => {
  it("shows a dash for the class average while nobody is ranked (AC-6)", () => {
    show(results({ scores: {} }));
    expect(section()).toHaveTextContent("Class average –");
    expect(section()).toHaveTextContent("Provisional: 5 students incomplete.");
    expect(screen.queryByRole("list", { name: "JSS 2 Gold positions" })).not.toBeInTheDocument();
  });

  it("opens a row from the keyboard and closes the breakdown with Escape", async () => {
    const user = userEvent.setup();
    show();
    await user.tab();
    expect(screen.getByRole("button", { name: /Okon Emem/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Okon Emem" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Okon Emem" })).not.toBeInTheDocument());
  });

  it("writes a subject position as a plain ordinal and keeps \"of N\" for the class position (AC-3, AC-8)", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: /Bello Abdulrahman/ }));
    const panel = await screen.findByRole("dialog", { name: "Bello Abdulrahman" });
    const english = within(panel).getByRole("heading", { name: "English Studies" }).closest("li")!;
    expect(english).toHaveTextContent("Position2nd");
    expect(english).not.toHaveTextContent("2nd of");
  });

  it("marks a student's own incomplete subject as provisional too (AC-8)", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: /Ojo Precious/ }));
    const panel = await screen.findByRole("dialog", { name: "Ojo Precious" });
    const maths = within(panel).getByRole("heading", { name: "Mathematics" }).closest("li")!;
    expect(maths).toHaveTextContent("Provisional");
    const english = within(panel).getByRole("heading", { name: "English Studies" }).closest("li")!;
    expect(english).not.toHaveTextContent("Provisional");
  });

  it("lists electives after compulsory subjects and labels them (AC-1, AC-8)", async () => {
    const user = userEvent.setup();
    const french = { classSubjectId: "fre", name: "French", shortName: "FRE", isElective: true, takerIds: ["a"] };
    show(results({ subjects: [...subjects, french], scores: { ...scores, a: { ...scores.a, fre: { ca: "30", exam: "40" } } } }));
    await user.click(screen.getByRole("button", { name: /Okon Emem/ }));
    const panel = await screen.findByRole("dialog", { name: "Okon Emem" });
    const headings = within(within(panel).getByRole("list", { name: "Subjects" })).getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["English Studies", "Mathematics", "FrenchElective"]);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /Bello Abdulrahman/ }));
    const bello = await screen.findByRole("dialog", { name: "Bello Abdulrahman" });
    expect(within(bello).queryByRole("heading", { name: /French/ })).not.toBeInTheDocument();
  });

  it("says in the breakdown when a student takes no subjects (AC-2)", async () => {
    const user = userEvent.setup();
    show(results({ subjects: [{ ...subjects[0], takerIds: ["a", "b", "c", "d"] }] }));
    await user.click(screen.getByRole("button", { name: /Ojo Precious/ }));
    const panel = await screen.findByRole("dialog", { name: "Ojo Precious" });
    expect(panel).toHaveTextContent("Ojo takes no subjects yet.");
    expect(within(panel).getByRole("region", { name: "Overall" })).toHaveTextContent("Incomplete: takes no subjects yet");
  });

  it("drops the provisional mark from Overall once the class is final (AC-7)", async () => {
    const user = userEvent.setup();
    show(results({ students: students.slice(0, 4) }));
    await user.click(screen.getByRole("button", { name: /Okon Emem/ }));
    const panel = await screen.findByRole("dialog", { name: "Okon Emem" });
    const overall = within(panel).getByRole("region", { name: "Overall" });
    expect(overall).toHaveTextContent("Position1st of 4");
    expect(overall).not.toHaveTextContent("Provisional");
  });

  it("shows the school's admission number when the student has one", async () => {
    const user = userEvent.setup();
    const withAdmission = students.map((s) => (s.studentId === "a" ? { ...s, admissionNo: "GHS/2024/015" } : s));
    show(results({ students: withAdmission }));
    await user.click(screen.getByRole("button", { name: /Okon Emem/ }));
    expect(await screen.findByRole("dialog", { name: "Okon Emem" })).toHaveTextContent("GHS/2024/015");
  });
});

