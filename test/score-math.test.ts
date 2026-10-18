import { describe, expect, it } from "vitest";

import { cellProblem, readCell, readRow, tidyPasted } from "@/components/score-sheet/score-math";
import { termLabel, termName } from "@/lib/term-label";

// Spec 0009: the sheet's per cell rules (AC-4) and pasted lines (AC-10).

const exam = { key: "exam", label: "Exam", max: 60 };
const ca = { key: "ca1", label: "CA 1", max: 20 };

describe("readCell (AC-4)", () => {
  it("reads a score within its maximum", () => {
    expect(readCell("48", exam)).toEqual({ kind: "ok", value: 48 });
    expect(readCell("60", exam)).toEqual({ kind: "ok", value: 60 });
  });

  it("marks a score above its maximum", () => {
    expect(readCell("61", exam)).toEqual({ kind: "over", value: 61, max: 60 });
  });

  it("marks pasted text that is not a score as bad, keeping it as typed (AC-10)", () => {
    expect(readCell("abc", exam)).toEqual({ kind: "bad", text: "abc" });
    expect(readCell("12.55", exam)).toEqual({ kind: "bad", text: "12.55" });
  });

  it("treats empty and a lone point as not entered", () => {
    expect(readCell("", exam)).toEqual({ kind: "empty" });
    expect(readCell(".", exam)).toEqual({ kind: "empty" });
  });
});

describe("cellProblem (AC-4, AC-10)", () => {
  it("says what is wrong in the teacher's words", () => {
    expect(cellProblem(readCell("61", exam), exam)).toBe("Exam is out of 60. You wrote 61.");
    expect(cellProblem(readCell("abc", exam), exam)).toBe("Exam must be a number like 15 or 12.5. You wrote abc.");
  });

  it("is quiet for a good or empty cell", () => {
    expect(cellProblem(readCell("48", exam), exam)).toBeNull();
    expect(cellProblem(readCell("", exam), exam)).toBeNull();
  });
});

describe("readRow (AC-4)", () => {
  it("shows no total while a part is missing, never counting it as 0", () => {
    expect(readRow({ ca1: "15" }, [ca, exam], [])).toEqual({ kind: "partial", missing: [exam] });
  });

  it("treats a bad pasted value like an over maximum one", () => {
    expect(readRow({ ca1: "15", exam: "abc" }, [ca, exam], []).kind).toBe("invalid");
  });

  it("totals a complete row, with no grade when there is no grade scale (AC-14)", () => {
    expect(readRow({ ca1: "15", exam: "48" }, [ca, exam], [])).toEqual({ kind: "complete", total: 63, band: undefined });
  });
});

describe("tidyPasted (AC-10)", () => {
  it("removes carriage returns, spaces and trailing zeros after the point", () => {
    expect(["48.00\r", " 12.50 ", "100.0", "0.0", ".50"].map(tidyPasted)).toEqual(["48", "12.5", "100", "0", ".5"]);
  });

  it("leaves whole numbers and anything else unchanged", () => {
    expect(["100", "60", "abc", "1,5", ""].map(tidyPasted)).toEqual(["100", "60", "abc", "1,5", ""]);
  });
});

describe("term names", () => {
  it("names a term alone and with its session", () => {
    expect(termName(1)).toBe("First Term");
    expect(termLabel(3, "2026/2027")).toBe("Third Term, 2026/2027");
  });
});
