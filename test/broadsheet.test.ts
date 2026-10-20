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
  it("renders the master compilation matrix with full CA + exam breakdown by default (AC-3)", () => {
    const res = testResults();
    render(h(BroadsheetView, { results: res, schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    // Title and metadata
    expect(screen.getByText(/JSS 2 Gold Master Compilation Sheet/i)).toBeInTheDocument();
    expect(screen.getByText(/Provisional \(1 incomplete\)/i)).toBeInTheDocument();

    // Subject column groups
    expect(screen.getAllByText("English Studies").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mathematics").length).toBeGreaterThan(0);

    // Sub-headers for CA 1, CA 2, Exam, Tot, Grd by default
    expect(screen.getAllByText("CA 1").length).toBe(2);
    expect(screen.getAllByText("CA 2").length).toBe(2);
    expect(screen.getAllByText("Tot").length).toBe(2);
    expect(screen.getAllByText("Grd").length).toBe(2);

    // Students rendered
    expect(screen.getByText("OKON")).toBeInTheDocument();
    expect(screen.getByText("BELLO")).toBeInTheDocument();
    expect(screen.getByText("EZE")).toBeInTheDocument();

    // Ranks and scores
    expect(screen.getAllByText("1st").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2nd").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ranked").length).toBe(2);
  });

  it("highlights missing scores and incomplete students (AC-4)", () => {
    const res = testResults();
    render(h(BroadsheetView, { results: res, schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    // Eze is incomplete (missing exam)
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
  });

  it("toggles between full breakdown and totals only (AC-5)", async () => {
    const user = userEvent.setup();
    const res = testResults();
    render(h(BroadsheetView, { results: res, schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    expect(screen.getAllByText("CA 1").length).toBe(2);

    // Switch to Totals Only
    await user.click(screen.getByRole("button", { name: /Totals Only/i }));

    expect(screen.queryByText("CA 1")).not.toBeInTheDocument();
    expect(screen.getAllByText("Total").length).toBeGreaterThan(0);

    // Switch back to Full Breakdown
    await user.click(screen.getByRole("button", { name: /Full Breakdown/i }));
    expect(screen.getAllByText("CA 1").length).toBe(2);
  });

  it("filters to incomplete students only (AC-5)", async () => {
    const user = userEvent.setup();
    const res = testResults();
    render(h(BroadsheetView, { results: res, schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    expect(screen.getByText("OKON")).toBeInTheDocument();
    expect(screen.getByText("BELLO")).toBeInTheDocument();
    expect(screen.getByText("EZE")).toBeInTheDocument();

    // Click Incomplete Only filter
    await user.click(screen.getByRole("button", { name: /Incomplete Only/i }));

    expect(screen.queryByText("OKON")).not.toBeInTheDocument();
    expect(screen.queryByText("BELLO")).not.toBeInTheDocument();
    expect(screen.getByText("EZE")).toBeInTheDocument();
  });

  it("contains no downloadable export buttons (AC-1)", () => {
    const res = testResults();
    render(h(BroadsheetView, { results: res, schoolCode: "GHS", backHref: "/ghs/classes/c1" }));

    expect(screen.queryByText(/Download Excel/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Export/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Download PDF/i)).not.toBeInTheDocument();
  });
});
