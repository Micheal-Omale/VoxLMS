// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  applySaved,
  canonical,
  conflictedStudents,
  countEntries,
  type Draft,
  keepMine,
  readDraft,
  reconcile,
  same,
  shownRows,
  takeSaved,
  toChanges,
  typeValue,
  writeDraft,
} from "@/components/score-sheet/draft";

// Spec 0009: the scores typed on a device until the server confirms them,
// each with the saved value it was typed over (AC-5, AC-7, AC-8).

const columns = [
  { key: "ca1", label: "CA 1", max: 20 },
  { key: "exam", label: "Exam", max: 60 },
];
const students = [
  { id: "s1", surname: "Abubakar", otherNames: "Sadiq" },
  { id: "s2", surname: "Okon", otherNames: "Emem" },
];

describe("canonical and same", () => {
  it("treats 12, 12.0, 12. and ' 12 ' as one score", () => {
    expect(["12", "12.0", "12.", " 12 "].map(canonical)).toEqual(["12", "12", "12", "12"]);
    expect(same("12.0", "12")).toBe(true);
  });

  it("treats empty, a lone point and missing as no score", () => {
    expect([canonical(""), canonical("."), canonical(undefined), canonical(null)]).toEqual(["", "", "", ""]);
    expect(same(undefined, "")).toBe(true);
  });

  it("keeps text that is not a score as typed, so it never matches a real score", () => {
    expect(canonical("abc")).toBe("abc");
    expect(same("abc", "")).toBe(false);
  });
});

describe("typeValue", () => {
  it("records a typed value with the saved value it was typed over (AC-5)", () => {
    const draft = typeValue({}, { s1: { ca1: "10" } }, "s1", "ca1", "12");
    expect(draft).toEqual({ s1: { ca1: { value: "12", base: "10" } } });
  });

  it("keeps the first base when the same field is typed again", () => {
    let draft = typeValue({}, { s1: { ca1: "10" } }, "s1", "ca1", "12");
    draft = typeValue(draft, { s1: { ca1: "10" } }, "s1", "ca1", "14");
    expect(draft.s1.ca1).toEqual({ value: "14", base: "10" });
  });

  it("removes the change when the teacher types back the saved value", () => {
    let draft = typeValue({}, { s1: { ca1: "10" } }, "s1", "ca1", "12");
    draft = typeValue(draft, { s1: { ca1: "10" } }, "s1", "ca1", "10.0");
    expect(draft).toEqual({});
  });

  it("records clearing a saved score as a change to empty (AC-4)", () => {
    expect(typeValue({}, { s1: { ca1: "10" } }, "s1", "ca1", "")).toEqual({ s1: { ca1: { value: "", base: "10" } } });
  });
});

describe("shownRows", () => {
  it("shows typed values over saved ones, and leaves missing parts out", () => {
    const draft: Draft = { s1: { exam: { value: "48", base: "" } } };
    expect(shownRows(draft, { s1: { ca1: "15" } }, students, columns)).toEqual({ s1: { ca1: "15", exam: "48" }, s2: {} });
  });
});

describe("conflicts (AC-7)", () => {
  const draft: Draft = { s1: { ca1: { value: "12", base: "10" } }, s2: { ca1: { value: "9", base: "" } } };

  it("flags only students whose typed value was typed over a value that has since changed", () => {
    expect([...conflictedStudents(draft, { s1: { ca1: "15" } })]).toEqual(["s1"]);
  });

  it("Keep mine makes every typed part in the row a change against the newer saved values", () => {
    const kept = keepMine(draft, { s1: { ca1: "15" } }, "s1");
    expect(kept.s1.ca1).toEqual({ value: "12", base: "15" });
    expect(conflictedStudents(kept, { s1: { ca1: "15" } }).size).toBe(0);
  });

  it("Use saved drops the typed values for that row only", () => {
    expect(takeSaved(draft, "s1")).toEqual({ s2: draft.s2 });
  });
});

describe("reconcile (AC-5, AC-8)", () => {
  it("drops a typed value that now equals the saved one", () => {
    const { draft } = reconcile({ s1: { ca1: { value: "15", base: "10" } } }, { s1: { ca1: "15" } }, students, columns);
    expect(draft).toEqual({});
  });

  it("keeps the old base, so a value someone changed meanwhile becomes a conflict", () => {
    const { draft } = reconcile({ s1: { ca1: { value: "14", base: "12" } } }, { s1: { ca1: "15" } }, students, columns);
    expect(conflictedStudents(draft, { s1: { ca1: "15" } }).has("s1")).toBe(true);
  });

  it("drops and reports students and parts no longer on the sheet", () => {
    const { draft, dropped } = reconcile(
      { gone: { ca1: { value: "5", base: "" } }, s1: { ca3: { value: "7", base: "" }, exam: { value: "40", base: "" } } },
      {},
      students,
      columns,
    );
    expect(draft).toEqual({ s1: { exam: { value: "40", base: "" } } });
    expect(dropped).toEqual({ studentIds: ["gone"], columnKeys: ["ca3"] });
  });
});

describe("toChanges (AC-5)", () => {
  it("sends each change with the value it replaced, null for empty, in canonical form", () => {
    const draft: Draft = { s1: { ca1: { value: "12.0", base: "" }, exam: { value: "", base: "45" } } };
    expect(toChanges(draft)).toEqual([
      { studentId: "s1", componentKey: "ca1", expected: null, value: "12" },
      { studentId: "s1", componentKey: "exam", expected: "45", value: null },
    ]);
  });
});

describe("applySaved (AC-5)", () => {
  it("stores the saved values and clears the matching typed entries", () => {
    const draft: Draft = { s1: { ca1: { value: "12", base: "10" } } };
    const result = applySaved(draft, { s1: { ca1: "10", exam: "40" } }, [{ studentId: "s1", componentKey: "ca1", expected: "10", value: "12" }]);
    expect(result).toEqual({ draft: {}, saved: { s1: { ca1: "12", exam: "40" } } });
  });

  it("keeps a value typed after the Save tap as a change against the value just saved", () => {
    const draft: Draft = { s1: { ca1: { value: "13", base: "10" } } };
    const result = applySaved(draft, { s1: { ca1: "10" } }, [{ studentId: "s1", componentKey: "ca1", expected: "10", value: "12" }]);
    expect(result.draft).toEqual({ s1: { ca1: { value: "13", base: "12" } } });
  });

  it("removes a cleared score from the saved values", () => {
    const result = applySaved({}, { s1: { ca1: "10", exam: "40" } }, [{ studentId: "s1", componentKey: "ca1", expected: "10", value: null }]);
    expect(result.saved).toEqual({ s1: { exam: "40" } });
  });
});

describe("the draft on this device (AC-5, AC-9)", () => {
  beforeEach(() => localStorage.clear());

  it("writes and reads back a draft", () => {
    const draft: Draft = { s1: { ca1: { value: "12", base: "10" } } };
    writeDraft("k", draft);
    expect(readDraft("k")).toEqual(draft);
    expect(countEntries(draft)).toBe(1);
  });

  it("removes the stored draft once nothing is left", () => {
    writeDraft("k", { s1: { ca1: { value: "12", base: "10" } } });
    writeDraft("k", {});
    expect(localStorage.getItem("k")).toBeNull();
  });

  it("treats an old format, broken JSON or a missing key as no draft", () => {
    localStorage.setItem("old", JSON.stringify({ s1: { ca1: "12" } }));
    localStorage.setItem("broken", "{not json");
    expect([readDraft("old"), readDraft("broken"), readDraft("missing")]).toEqual([{}, {}, {}]);
  });
});
