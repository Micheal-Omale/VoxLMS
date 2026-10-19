// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RemarksSheet } from "@/components/remarks-sheet/remarks-sheet";
import type { ReadOnlyReason, RemarksSaveOutcome, RemarksSaveRequest, RemarksSnapshot } from "@/components/remarks-sheet/types";

// Spec 0011: the Remarks sheet's typed work rules (AC-2 to AC-9). The save is
// a mock; saveRemarks' own rules have data tests (test/remarks-data.test.ts).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const KEY = "remark-draft:user-1:term-1:class-1";
const students = [
  { id: "s1", surname: "Abubakar", otherNames: "Sadiq", number: "GHS/001", average: 7245, position: 1 },
  { id: "s2", surname: "Okon", otherNames: "Emem", number: "GHS/002", average: null, position: null },
  { id: "s3", surname: "Udo", otherNames: "Godswill", number: "GHS/003", average: 5100, position: 2 },
];
const EXCELLENT = "An excellent result. Keep it up.";
const GOOD = "A good result, with room to do even better.";

function sheet(saved: RemarksSnapshot["saved"] = {}, list = students, lastChange: RemarksSnapshot["lastChange"] = {}): RemarksSnapshot {
  return { students: list, saved, automatic: { s1: EXCELLENT, s2: null, s3: GOOD }, lastChange };
}

const onSave = vi.fn<(request: RemarksSaveRequest) => Promise<RemarksSaveOutcome>>();

function renderSheet(snapshot = sheet(), readOnly: ReadOnlyReason | null = null, signerTitle = "Principal") {
  return render(h(RemarksSheet, { draftKey: KEY, termName: "First Term", signerTitle, sheet: snapshot, readOnly, onSave }));
}

const row = (name: string) => screen.getByRole("group", { name: new RegExp(name) });
const teacherBox = (name: string) => within(row(name)).getByLabelText("Teacher’s comment");
const headBox = (name: string) => within(row(name)).getByLabelText("Principal’s comment");
const inRow = (name: string, button: RegExp) => within(row(name)).getByRole("button", { name: button });
const saveButton = () => screen.getByRole("button", { name: /Save comments|Try again/ });

beforeEach(() => {
  localStorage.clear();
  onSave.mockReset();
});
afterEach(cleanup);

describe("the sheet (AC-2, AC-4)", () => {
  it("shows each student's figures, and the head's comment as automatic or waiting under the signer's title", () => {
    renderSheet(sheet(), null, "Head teacher");
    expect(within(row("Abubakar")).getByText("72.45")).toBeInTheDocument();
    expect(within(row("Abubakar")).getByText("1st")).toBeInTheDocument();
    expect(within(row("Okon")).getByText("Incomplete")).toBeInTheDocument();
    expect(within(row("Abubakar")).getByText(EXCELLENT)).toBeInTheDocument();
    expect(within(row("Abubakar")).getByText("Automatic")).toBeInTheDocument();
    expect(within(row("Okon")).getByText("Waits for all scores")).toBeInTheDocument();
    expect(screen.getAllByText("Head teacher’s comment").length).toBeGreaterThan(0);
    expect(screen.getByText("1 head teacher’s comment waits for all scores")).toBeInTheDocument();
    expect(screen.getByText(/have a teacher’s comment/)).toHaveTextContent("0 of 3 have a teacher’s comment");
  });

  it("shows who last changed a row, and nothing for a row never saved", () => {
    renderSheet(sheet({ s1: { teacher: "Good." } }, students, { s1: { by: "Mrs Okafor", at: new Date().toISOString() } }));
    expect(within(row("Abubakar")).getByText(/Last changed by Mrs Okafor,/)).toBeInTheDocument();
    expect(within(row("Okon")).queryByText(/Last changed/)).not.toBeInTheDocument();
  });
});

describe("the teacher's comment (AC-3)", () => {
  it("fills an empty box from a quick pick, then adds the next pick after one space", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(inRow("Abubakar", /Quick picks/));
    await user.click(within(row("Abubakar")).getByRole("button", { name: "Hardworking and well behaved." }));
    await user.click(within(row("Abubakar")).getByRole("button", { name: "Should read more at home." }));
    expect(teacherBox("Abubakar")).toHaveValue("Hardworking and well behaved. Should read more at home.");
  });

  it("never replaces typed text with a pick", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(teacherBox("Okon"), "Quiet.");
    await user.click(inRow("Okon", /Quick picks/));
    await user.click(within(row("Okon")).getByRole("button", { name: "Shows steady improvement." }));
    expect(teacherBox("Okon")).toHaveValue("Quiet. Shows steady improvement.");
  });

  it("tidies spaces and line breaks on leaving the box", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(teacherBox("Abubakar"), "  A good{Enter}{Enter}term's   work. ");
    await user.tab();
    expect(teacherBox("Abubakar")).toHaveValue("A good term's work.");
  });

  it("shows a counter from 160, circles over 200 and blocks Save until fixed", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(teacherBox("Abubakar"));
    await user.paste("a".repeat(185));
    expect(within(row("Abubakar")).getByText("185 of 200")).toBeInTheDocument();
    await user.paste("a".repeat(16));
    expect(teacherBox("Abubakar")).toHaveAttribute("aria-invalid", "true");
    expect(within(row("Abubakar")).getByText(/Comments fit in 200 characters/)).toBeInTheDocument();
    expect(screen.getByText("1 comment needs fixing before you can save.")).toBeInTheDocument();
    await user.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
    // Nothing is cut off: all 201 characters are still there.
    expect((teacherBox("Abubakar") as HTMLTextAreaElement).value).toHaveLength(201);
  });

  it("sends an emptied saved comment as a clear", async () => {
    const user = userEvent.setup();
    renderSheet(sheet({ s1: { teacher: "Old words." } }));
    await user.clear(teacherBox("Abubakar"));
    onSave.mockResolvedValueOnce({ kind: "saved", updatedAt: new Date().toISOString() });
    await user.click(saveButton());
    expect(onSave.mock.calls[0][0].changes).toEqual([{ studentId: "s1", field: "teacher", expected: "Old words.", value: null }]);
  });
});

describe("the head's comment (AC-4)", () => {
  it("Type over opens a box seeded with the automatic text, saved as typed", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(inRow("Abubakar", /Type over/));
    expect(headBox("Abubakar")).toHaveValue(EXCELLENT);
    expect(within(row("Abubakar")).getByText("Typed")).toBeInTheDocument();
    await user.clear(headBox("Abubakar"));
    await user.type(headBox("Abubakar"), "Top of the class.");
    onSave.mockResolvedValueOnce({ kind: "saved", updatedAt: new Date().toISOString() });
    await user.click(saveButton());
    expect(onSave.mock.calls[0][0].changes).toEqual([{ studentId: "s1", field: "head", expected: null, value: "Top of the class." }]);
  });

  it("Type over on a waiting comment opens an empty box", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(inRow("Okon", /Type over/));
    expect(headBox("Okon")).toHaveValue("");
  });

  it("Use automatic clears a saved typed comment on save", async () => {
    const user = userEvent.setup();
    renderSheet(sheet({ s3: { head: "Typed before." } }));
    expect(headBox("Udo")).toHaveValue("Typed before.");
    await user.click(inRow("Udo", /Use automatic/));
    expect(within(row("Udo")).getByText(GOOD)).toBeInTheDocument();
    expect(within(row("Udo")).getByText("Automatic, not saved yet")).toBeInTheDocument();
    onSave.mockResolvedValueOnce({ kind: "saved", updatedAt: new Date().toISOString() });
    await user.click(saveButton());
    expect(onSave.mock.calls[0][0].changes).toEqual([{ studentId: "s3", field: "head", expected: "Typed before.", value: null }]);
  });
});

describe("saving (AC-5)", () => {
  it("keeps typed comments on the device, retries the same frozen save, and says when it landed", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(teacherBox("Abubakar"), "Well done.");
    expect(JSON.parse(localStorage.getItem(KEY)!).entries.s1.teacher).toEqual({ value: "Well done.", base: "" });
    onSave.mockRejectedValueOnce(new Error("Failed to fetch"));
    await user.click(saveButton());
    expect(await screen.findByText("Couldn't save. Your comments are kept on this phone. Try again.")).toBeInTheDocument();
    const first = onSave.mock.calls[0][0];
    onSave.mockResolvedValueOnce({ kind: "saved", updatedAt: new Date().toISOString() });
    await user.click(saveButton());
    await waitFor(() => expect(screen.getByText(/^Saved/)).toBeInTheDocument());
    expect(onSave.mock.calls[1][0]).toEqual(first);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("brings back unsaved comments after a refresh", () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: { s2: { teacher: { value: "Kept.", base: "" } } } }));
    renderSheet();
    expect(teacherBox("Okon")).toHaveValue("Kept.");
    expect(screen.getByText("Unsaved comments for 1 student were kept on this phone")).toBeInTheDocument();
  });

  it("takes the fresh sheet a save returns, with its last change lines", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(teacherBox("Abubakar"), "Well done.");
    const at = new Date().toISOString();
    onSave.mockResolvedValueOnce({ kind: "saved", updatedAt: at, sheet: sheet({ s1: { teacher: "Well done." } }, students, { s1: { by: "Mrs Okafor", at } }) });
    await user.click(saveButton());
    expect(await within(row("Abubakar")).findByText(/Last changed by Mrs Okafor/)).toBeInTheDocument();
    expect(screen.getByText(/have a teacher’s comment/)).toHaveTextContent("1 of 3");
  });
});

describe("conflicts (AC-6)", () => {
  it("shows the newer saved text beside mine; Keep mine saves over it", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(teacherBox("Abubakar"), "Mine.");
    onSave.mockResolvedValueOnce({ kind: "conflict", studentIds: ["s1"], sheet: sheet({ s1: { teacher: "Theirs." } }) });
    await user.click(saveButton());
    expect(await within(row("Abubakar")).findByText("Teacher’s comment: “Theirs.”")).toBeInTheDocument();
    expect(teacherBox("Abubakar")).toHaveValue("Mine.");
    expect(saveButton()).toBeDisabled();
    await user.click(inRow("Abubakar", /Keep mine/));
    onSave.mockResolvedValueOnce({ kind: "saved", updatedAt: new Date().toISOString() });
    await user.click(saveButton());
    expect(onSave.mock.calls[1][0].changes).toEqual([{ studentId: "s1", field: "teacher", expected: "Theirs.", value: "Mine." }]);
  });

  it("Use saved drops my text for that row, and typed text equal to the saved text drops out", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(teacherBox("Abubakar"), "Mine.");
    await user.type(teacherBox("Udo"), "Same.");
    onSave.mockResolvedValueOnce({ kind: "conflict", studentIds: ["s1"], sheet: sheet({ s1: { teacher: "Theirs." }, s3: { teacher: "Same." } }) });
    await user.click(saveButton());
    await user.click(await within(row("Abubakar")).findByRole("button", { name: /Use saved/ }));
    expect(teacherBox("Abubakar")).toHaveValue("Theirs.");
    expect(screen.getByText("No comments written yet")).toBeInTheDocument();
  });
});

describe("an out of date sheet (AC-8)", () => {
  it("names a student who left, drops their row, and keeps the rest typed", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(teacherBox("Okon"), "Gone.");
    await user.type(teacherBox("Udo"), "Still here.");
    onSave.mockResolvedValueOnce({ kind: "stale", removedStudentIds: ["s2"], sheet: sheet({}, [students[0], students[2]]) });
    await user.click(saveButton());
    expect(await screen.findByText("OKON Emem is no longer in this class, so their comments were not saved.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Okon/ })).not.toBeInTheDocument();
    expect(teacherBox("Udo")).toHaveValue("Still here.");
  });
});

describe("read only sheets (AC-7, AC-12)", () => {
  it("lists comments never saved before the term closed, and Discard clears them", async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: { s1: { teacher: { value: "Too late.", base: "" } } } }));
    renderSheet(sheet(), "closed");
    expect(screen.getByText("First Term is closed. Remarks can only be changed in the current term.")).toBeInTheDocument();
    expect(screen.getByText("1 comment typed on this phone was never saved before First Term closed")).toBeInTheDocument();
    expect(screen.getByText("Too late.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard these comments" }));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("turns read only when a save finds the term closed", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(teacherBox("Abubakar"), "Late.");
    onSave.mockResolvedValueOnce({ kind: "closed" });
    await user.click(saveButton());
    expect(await screen.findByText("First Term is closed. Remarks can only be changed in the current term.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save comments/ })).not.toBeInTheDocument();
  });

  it("shows typed head's comments and offers nothing to change while viewing as", () => {
    renderSheet(sheet({ s1: { head: "Typed." } }), "viewingAs");
    expect(screen.getByText("You are viewing as this person. Nothing can be saved.")).toBeInTheDocument();
    expect(within(row("Abubakar")).getByText("Typed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Type over|Quick picks/ })).not.toBeInTheDocument();
  });
});
