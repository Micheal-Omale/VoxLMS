import { describe, expect, it } from "vitest";

import {
  addPick,
  DEFAULT_REMARK_BANDS,
  fromHundredths,
  headRemarkFor,
  remarkBandsProblem,
  remarkLength,
  resolveHeadRemark,
  sameRemark,
  tidyRemark,
  toHundredths,
} from "@/lib/remarks";

// Spec 0011 (remarks): the pure rules.

describe("tidyRemark (AC-3)", () => {
  it("trims the ends and folds spaces, tabs and line breaks into one space", () => {
    expect(tidyRemark("  A good\n\nterm's   work.\t ")).toBe("A good term's work.");
    expect(tidyRemark("Line one\r\nline two")).toBe("Line one line two");
  });

  it("makes empty and blank text null", () => {
    expect(tidyRemark("")).toBeNull();
    expect(tidyRemark(" \n\t ")).toBeNull();
    expect(tidyRemark(null)).toBeNull();
  });

  it("compares and counts tidy text", () => {
    expect(sameRemark("A  good term.", " A good term. ")).toBe(true);
    expect(sameRemark("", null)).toBe(true);
    expect(sameRemark("A", "B")).toBe(false);
    expect(remarkLength(`  ${"a".repeat(200)}  `)).toBe(200);
  });
});

describe("addPick (AC-3)", () => {
  it("fills an empty box", () => {
    expect(addPick("", "Shows steady improvement.")).toBe("Shows steady improvement.");
    expect(addPick("   ", "Shows steady improvement.")).toBe("Shows steady improvement.");
  });

  it("adds to the end after one space and never replaces", () => {
    expect(addPick("Hardworking.", "Should read more at home.")).toBe("Hardworking. Should read more at home.");
    expect(addPick("Hardworking.  ", "Should read more at home.")).toBe("Hardworking. Should read more at home.");
  });
});

describe("hundredths", () => {
  it("parses lowest averages from text, never through a float", () => {
    expect(toHundredths("70")).toBe(7000);
    expect(toHundredths("62.5")).toBe(6250);
    expect(toHundredths("69.99")).toBe(6999);
    expect(toHundredths("0")).toBe(0);
    expect(toHundredths("100")).toBe(10000);
  });

  it("refuses anything outside 0 to 100 or with more than 2 decimal places", () => {
    for (const bad of ["101", "100.01", "-1", "50.123", "abc", "", "5e1"]) expect(toHundredths(bad)).toBeNull();
  });

  it("writes the shortest text back", () => {
    expect(fromHundredths(7000)).toBe("70");
    expect(fromHundredths(6250)).toBe("62.5");
    expect(fromHundredths(6205)).toBe("62.05");
    expect(fromHundredths(0)).toBe("0");
  });
});

describe("headRemarkFor (AC-4)", () => {
  const remark = (min: string) => DEFAULT_REMARK_BANDS.find((b) => b.minAverage === min)!.remark;

  it("takes the highest band the exact average reaches", () => {
    expect(headRemarkFor(7245, DEFAULT_REMARK_BANDS)).toBe(remark("70"));
    expect(headRemarkFor(7000, DEFAULT_REMARK_BANDS)).toBe(remark("70"));
    expect(headRemarkFor(6999, DEFAULT_REMARK_BANDS)).toBe(remark("60"));
    expect(headRemarkFor(0, DEFAULT_REMARK_BANDS)).toBe(remark("0"));
    expect(headRemarkFor(10000, DEFAULT_REMARK_BANDS)).toBe(remark("70"));
  });

  it("works whatever order the bands come in, with decimal lowest averages", () => {
    const bands = [
      { minAverage: "0", remark: "Low" },
      { minAverage: "62.5", remark: "High" },
    ];
    expect(headRemarkFor(6250, bands)).toBe("High");
    expect(headRemarkFor(6249, bands)).toBe("Low");
  });
});

describe("resolveHeadRemark (AC-4)", () => {
  it("keeps a typed comment whatever the average", () => {
    expect(resolveHeadRemark("Well done.", null, DEFAULT_REMARK_BANDS)).toEqual({ kind: "typed", text: "Well done." });
    expect(resolveHeadRemark("Well done.", 2000, DEFAULT_REMARK_BANDS)).toEqual({ kind: "typed", text: "Well done." });
  });

  it("is automatic for a complete student and waits for an incomplete one", () => {
    expect(resolveHeadRemark(null, 5500, DEFAULT_REMARK_BANDS)).toEqual({ kind: "automatic", text: "A good result, with room to do even better." });
    expect(resolveHeadRemark(null, null, DEFAULT_REMARK_BANDS)).toEqual({ kind: "waiting" });
    expect(resolveHeadRemark("  ", null, DEFAULT_REMARK_BANDS)).toEqual({ kind: "waiting" });
  });
});

describe("remarkBandsProblem (AC-10)", () => {
  const band = (minAverage: string, remark = "Wording.") => ({ minAverage, remark });

  it("accepts the defaults", () => {
    expect(remarkBandsProblem(DEFAULT_REMARK_BANDS)).toBeNull();
  });

  it("needs 2 to 10 bands", () => {
    expect(remarkBandsProblem([band("0")])?.index).toBeNull();
    expect(remarkBandsProblem(Array.from({ length: 11 }, (_, i) => band(String(i * 5))))).toMatchObject({ index: null });
    expect(remarkBandsProblem(Array.from({ length: 10 }, (_, i) => band(String(i * 5))))).toBeNull();
  });

  it("needs one band at 0", () => {
    expect(remarkBandsProblem([band("10"), band("50")])?.error).toMatch(/start at 0/);
  });

  it("names the band with a bad or repeated lowest average", () => {
    expect(remarkBandsProblem([band("0"), band("101")])).toMatchObject({ index: 1 });
    expect(remarkBandsProblem([band("0"), band("50.123")])).toMatchObject({ index: 1 });
    expect(remarkBandsProblem([band("0"), band("50"), band("50.00")])).toMatchObject({ index: 2, error: expect.stringMatching(/Bands 2 and 3/) });
  });

  it("names the band with empty or too long wording, after tidying", () => {
    expect(remarkBandsProblem([band("0"), band("50", "  \n ")])).toMatchObject({ index: 1 });
    expect(remarkBandsProblem([band("0"), band("50", "a".repeat(201))])).toMatchObject({ index: 1 });
    expect(remarkBandsProblem([band("0"), band("50", ` ${"a".repeat(200)} `)])).toBeNull();
  });
});
