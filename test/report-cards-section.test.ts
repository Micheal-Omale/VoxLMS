// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReportCardsSection } from "@/app/[school]/classes/[classId]/report-cards-section";
import type { Readiness } from "@/lib/report-card";

// Spec 0012, AC-1 and AC-2: the class page's Report cards section.

afterEach(cleanup);

function show(readiness: Readiness, isCurrentTerm = true, teacherTitle = "Form master") {
  return render(h(ReportCardsSection, { slug: "gracehigh", classId: "class-1", termId: "term-1", isCurrentTerm, teacherTitle, readiness }));
}

describe("the Report cards section", () => {
  it("offers the download when ready, linking to the PDF route (AC-1)", () => {
    show({ ready: true, count: 32, missingTeacherComments: 0 });
    expect(screen.getByText(/^Ready:/)).toHaveTextContent("Ready: 32 report cards, one A4 page each");
    expect(screen.getByText("One PDF for the whole class. Print it in black and white.")).toBeInTheDocument();
    const link = screen.getByRole("button", { name: "Download report cards" });
    expect(link).toHaveAttribute("href", "/gracehigh/classes/class-1/report-cards");
    expect(link).toHaveAttribute("download");
    expect(screen.queryByText(/lines to write on/)).not.toBeInTheDocument();
  });

  it("carries the chosen term for an earlier term", () => {
    show({ ready: true, count: 32, missingTeacherComments: 0 }, false);
    expect(screen.getByRole("button", { name: "Download report cards" })).toHaveAttribute("href", "/gracehigh/classes/class-1/report-cards?term=term-1");
  });

  it("warns about missing teacher's comments in the section's words", () => {
    show({ ready: true, count: 32, missingTeacherComments: 3 }, true, "Class teacher");
    expect(screen.getByText(/lines to write on/)).toHaveTextContent("3 students have no class teacher’s comment. Their cards leave lines to write on.");
  });

  it("turns the button off and lists who to chase while scores are missing (AC-2)", () => {
    show({
      ready: false,
      reason: {
        kind: "incomplete",
        message: "Report cards print when every score is in. Still missing:",
        students: [{ name: "OKON Emem", missing: "Mathematics: Exam · Basic Science: CA 2" }],
        more: 4,
      },
    });
    const button = screen.getByRole("button", { name: "Download report cards" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Report cards print when every score is in/);
    expect(screen.getByText("OKON Emem:")).toBeInTheDocument();
    expect(screen.getByText("Mathematics: Exam · Basic Science: CA 2")).toBeInTheDocument();
    expect(screen.getByText(/more$/)).toHaveTextContent("and 4 more");
    expect(screen.queryByText(/^Ready:/)).not.toBeInTheDocument();
  });

  it("explains a missing signer or split under the button", () => {
    show({ ready: false, reason: { kind: "no_signer", message: "Report cards need the principal’s name. The VoxLMS team adds it." } });
    expect(screen.getByRole("button", { name: "Download report cards" })).toBeDisabled();
    expect(screen.getByText("Report cards need the principal’s name. The VoxLMS team adds it.")).toBeInTheDocument();
  });

  it("shows a plain empty state with no students or subjects", () => {
    show({ ready: false, reason: { kind: "no_students", message: "No students in JSS 2 Gold yet, so there are no report cards to print." } });
    expect(screen.getByText("No students in JSS 2 Gold yet, so there are no report cards to print.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
