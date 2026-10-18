// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScoresSection } from "@/app/[school]/classes/[classId]/scores-section";

// Spec 0009, AC-1 and AC-2: the class page's subject list with progress, and
// the term picker. The progress itself is counted in SQL (test/score-entry.test.ts).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);

const first = { id: "t1", number: 1, isCurrent: true };
const subject = (name: string, takers: number, complete: number, isElective = false) => ({
  classSubjectId: `cs-${name}`,
  classId: "c1",
  name,
  isElective,
  takers,
  complete,
});

function renderSection(over: Partial<Parameters<typeof ScoresSection>[0]["progress"]> = {}) {
  const progress = {
    cls: { id: "c1", name: "SS 1 Science" },
    session: { id: "s", name: "2026/2027" },
    terms: [first],
    term: first,
    subjects: [subject("Mathematics", 6, 6), subject("Physics", 6, 4), subject("Further Mathematics", 3, 1, true), subject("Economics", 0, 0, true)],
    ...over,
  } as unknown as Parameters<typeof ScoresSection>[0]["progress"];
  return render(h(ScoresSection, { slug: "gracehigh", classId: "c1", progress }));
}

const row = (name: string) => screen.getByRole("link", { name: new RegExp(`^${name}`) });

describe("the Scores section (AC-1)", () => {
  it("shows N of M complete for each subject and Done when every taker is complete", () => {
    renderSection();
    expect(row("Mathematics")).toHaveTextContent("6 of 6 complete");
    expect(row("Mathematics")).toHaveTextContent("Done");
    expect(row("Physics")).toHaveTextContent("4 of 6 complete");
    expect(row("Physics")).not.toHaveTextContent("Done");
  });

  it("counts subjects done out of subjects anyone takes", () => {
    renderSection();
    const summary = screen.getByRole("heading", { name: "Scores" }).nextElementSibling;
    expect(summary).toHaveTextContent("1 of 3 subjects done");
  });

  it("says No students take this yet for an elective nobody takes, and never marks it Done", () => {
    renderSection();
    expect(row("Economics")).toHaveTextContent("No students take this yet");
    expect(row("Economics")).not.toHaveTextContent("Done");
  });

  it("lists electives after the compulsory subjects, under an Electives label", () => {
    renderSection();
    const text = screen.getByRole("region", { name: "Scores" }).textContent ?? "";
    expect(text.indexOf("Physics")).toBeLessThan(text.indexOf("Electives"));
    expect(text.indexOf("Electives")).toBeLessThan(text.indexOf("Further Mathematics"));
  });

  it("opens each subject's sheet in the current term without a term in the address", () => {
    renderSection();
    expect(row("Physics")).toHaveAttribute("href", "/gracehigh/classes/c1/scores/cs-Physics");
  });

  it("says when no subjects are set for the class", () => {
    renderSection({ subjects: [] });
    expect(screen.getByText(/No subjects are set for this class yet/)).toBeInTheDocument();
  });
});

describe("the term picker (AC-2)", () => {
  it("is hidden while the session has only its current term", () => {
    renderSection();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows for an earlier term, with the closed line, and sheets carry the term", () => {
    renderSection({ terms: [{ id: "t2", number: 2, isCurrent: true }, { ...first, isCurrent: false }], term: { ...first, isCurrent: false } });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("First Term is closed. Scores can only be changed in the current term.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scores" }).nextElementSibling).toHaveTextContent("subjects done in First Term");
    expect(row("Physics")).toHaveAttribute("href", "/gracehigh/classes/c1/scores/cs-Physics?term=t1");
  });

  it("names the current term in the picker", () => {
    renderSection({ terms: [{ id: "t2", number: 2, isCurrent: true }, { ...first, isCurrent: false }], term: { id: "t2", number: 2, isCurrent: true } });
    expect(within(screen.getByRole("combobox")).getByText("Second Term, 2026/2027 (current)")).toBeInTheDocument();
  });
});
