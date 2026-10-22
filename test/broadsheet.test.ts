// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { BroadsheetView } from "@/components/broadsheet/broadsheet-view";
import { computeClassResults, type ResultsInput } from "@/lib/results";
import type { ClassResults } from "@/server/data";

afterEach(cleanup);

const split = [
  { key: "ca1", label: "CA 1", max: 20 },
  { key: "ca2", label: "CA 2", max: 20 },
  { key: "exam", label: "Exam", max: 60 },
];

const bands = [
  { grade: "A", min: 70, remark: "Excellent" },
  { grade: "B", min: 60, remark: "Very good" },
  { grade: "C", min: 50, remark: "Good" },
  { grade: "F", min: 0, remark: "Fail" },
];

const student = (studentId: string, surname: string, otherNames: string, studentNo: number) => ({
  studentId,
  surname,
  otherNames,
  studentNo,
  admissionNo: `GHS/2026/${String(studentNo).padStart(3, "0")}`,
});

const students = [
  student("s1", "Okon", "Emem", 1),
  student("s2", "Bello", "Abdulrahman", 2),
  student("s3", "Eze", "Chukwuemeka", 3),
];

const ids = students.map((s) => s.studentId);

const subjects = [
  { classSubjectId: "eng", name: "English Studies", shortName: "ENG", isElective: false, takerIds: ids },
  { classSubjectId: "mth", name: "Mathematics", shortName: "MTH", isElective: false, takerIds: ids },
];

const scores: ResultsInput["scores"] = {
  // s1 complete: 18 + 17 + 50 = 85 (A), 15 + 16 + 45 = 76 (A)
  s1: {
    eng: { ca1: "18", ca2: "17", exam: "50" },
    mth: { ca1: "15", ca2: "16", exam: "45" },
  },
  // s2 complete: 12 + 14 + 38 = 64 (B), 10 + 12 + 35 = 57 (C)
  s2: {
    eng: { ca1: "12", ca2: "14", exam: "38" },
    mth: { ca1: "10", ca2: "12", exam: "35" },
  },
  // s3 incomplete: missing mth exam!
  s3: {
    eng: { ca1: "15", ca2: "15", exam: "40" },
    mth: { ca1: "12", ca2: "14" },
  },
};

function testResults(): ClassResults {
  const full = { split, gradeBands: bands, subjects, students, scores };
  const figures = computeClassResults(full);
  return {
    cls: { id: "c1", name: "JSS 2 Gold" },
    term: { id: "t1", number: 1, isCurrent: true },
    section: { name: "Junior Secondary" },
    session: { name: "2026/2027" },
    split,
    hasGradeScale: true,
    ...figures,
  };
}

describe("BroadsheetView (Spec 0015)", () => {
  const row = (name: RegExp) => screen.queryByRole("rowheader", { name });

  it("shows every part, total and grade per subject by default (AC-3)", () => {
    render(h(BroadsheetView, { results: testResults(), schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    expect(screen.getByRole("heading", { level: 1, name: "JSS 2 Gold broadsheet" })).toBeInTheDocument();
    expect(document.body).toHaveTextContent("1 student has missing scores");
    expect(screen.getByRole("columnheader", { name: "English Studies" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: /^CA 1/ })).toHaveLength(2);
    expect(screen.getAllByRole("columnheader", { name: "Grade" })).toHaveLength(2);

    expect(row(/OKON Emem/)).toBeInTheDocument();
    expect(row(/BELLO Abdulrahman/)).toBeInTheDocument();
    expect(row(/EZE Chukwuemeka/)).toBeInTheDocument();
    expect(screen.getByText("1st of 3")).toBeInTheDocument();
    expect(screen.getByText("2nd of 3")).toBeInTheDocument();
  });

  it("marks a part not entered and says what is missing (AC-4)", () => {
    render(h(BroadsheetView, { results: testResults(), schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    expect(row(/EZE Chukwuemeka/)).toHaveTextContent("Missing Mathematics: Exam");
    // The missing exam and the subject total it holds back, never a 0.
    expect(screen.getAllByLabelText("Not entered")).toHaveLength(2);
  });

  it("switches between every part and totals only (AC-5)", async () => {
    const user = userEvent.setup();
    render(h(BroadsheetView, { results: testResults(), schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    await user.click(screen.getByRole("button", { name: "Totals only" }));
    expect(screen.queryByRole("columnheader", { name: /^CA 1/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: "Total" }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Every part" }));
    expect(screen.getAllByRole("columnheader", { name: /^CA 1/ })).toHaveLength(2);
  });

  it("shows only the students with missing scores (AC-5)", async () => {
    const user = userEvent.setup();
    render(h(BroadsheetView, { results: testResults(), schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    await user.click(screen.getByRole("button", { name: "Missing scores only" }));

    expect(row(/OKON Emem/)).not.toBeInTheDocument();
    expect(row(/BELLO Abdulrahman/)).not.toBeInTheDocument();
    expect(row(/EZE Chukwuemeka/)).toBeInTheDocument();
  });

  it("contains no downloadable export buttons (AC-1)", () => {
    const res = testResults();
    render(h(BroadsheetView, { results: res, schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    expect(screen.queryByText(/Download Excel/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Export/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Download PDF/i)).not.toBeInTheDocument();
  });
});
