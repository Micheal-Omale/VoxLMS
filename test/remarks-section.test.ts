// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RemarksSection } from "@/app/[school]/classes/[classId]/remarks-section";
import type { ClassRemarks, ClassResults } from "@/server/data";

// Spec 0011, AC-1: the class page's Remarks section.

afterEach(cleanup);

const results = (isCurrent = true) =>
  ({ cls: { id: "class-1", name: "JSS 2 Gold" }, term: { id: "term-1", number: 1, isCurrent } }) as unknown as ClassResults;

const remarks = (rows: Partial<ClassRemarks["rows"][number]>[], signerTitle = "Principal"): ClassRemarks => ({
  signerTitle,
  hasSigner: true,
  teacherTitle: "Form master",
  rows: rows.map((r, i) => ({ studentId: `s${i}`, teacherRemark: null, head: { kind: "waiting" }, automatic: null, lastChange: null, ...r })),
});

describe("the Remarks section (AC-1)", () => {
  it("counts teacher's comments and the head's comments still waiting, in the signer's words", () => {
    render(
      h(RemarksSection, {
        slug: "gracehigh",
        results: results(),
        remarks: remarks(
          [
            { teacherRemark: "Good.", head: { kind: "automatic", text: "Fine." } },
            { teacherRemark: null, head: { kind: "typed", text: "Typed." } },
            { teacherRemark: "Ok.", head: { kind: "waiting" } },
          ],
          "Head teacher",
        ),
      }),
    );
    expect(screen.getByText(/have a teacher’s comment/)).toHaveTextContent("2 of 3 have a teacher’s comment");
    expect(screen.getByText(/waits for all scores/)).toHaveTextContent("1 head teacher’s comment waits for all scores.");
    expect(screen.getByText("Open remarks").closest("a")).toHaveAttribute("href", "/gracehigh/classes/class-1/remarks");
  });

  it("says nothing waits when every result is complete, and invites the first comments", () => {
    render(h(RemarksSection, { slug: "gracehigh", results: results(), remarks: remarks([{ head: { kind: "automatic", text: "Fine." } }]) }));
    expect(screen.queryByText(/waits? for all scores/)).not.toBeInTheDocument();
    expect(screen.getByText("Write comments").closest("a")).toBeInTheDocument();
  });

  it("opens an earlier term's sheet read only, keeping the term in the address", () => {
    render(h(RemarksSection, { slug: "gracehigh", results: results(false), remarks: remarks([{}]) }));
    expect(screen.getByText("First Term is closed, so its remarks are read only.")).toBeInTheDocument();
    expect(screen.getByText("View remarks").closest("a")).toHaveAttribute("href", "/gracehigh/classes/class-1/remarks?term=term-1");
  });

  it("shows a plain empty state for a class with no students", () => {
    render(h(RemarksSection, { slug: "gracehigh", results: results(), remarks: remarks([]) }));
    expect(screen.getByText("No students in JSS 2 Gold yet, so there are no comments to write.")).toBeInTheDocument();
    expect(document.querySelector("a")).toBeNull();
  });
});
