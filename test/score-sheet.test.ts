// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScoreSheet } from "@/components/score-sheet/score-sheet";
import type { ReadOnlyReason, SaveOutcome, SaveRequest, SheetSnapshot } from "@/components/score-sheet/types";

// Spec 0009: the score sheet's typed work rules (AC-4 to AC-10). The save is a
// mock; saveScores' own rules have data tests (test/score-entry.test.ts).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const KEY = "score-draft:user-1:term-1:cs-1";
const students = [
  { id: "s1", surname: "Abubakar", otherNames: "Sadiq", number: "GHS/001" },
  { id: "s2", surname: "Okon", otherNames: "Emem", number: "GHS/002" },
  { id: "s3", surname: "Udo", otherNames: "Godswill", number: "GHS/003" },
];
const columns = [
  { key: "ca1", label: "CA 1", max: 20 },
  { key: "ca2", label: "CA 2", max: 20 },
  { key: "exam", label: "Exam", max: 60 },
];
const sheet = (scores: SheetSnapshot["scores"] = {}, list = students): SheetSnapshot => ({ students: list, columns, scale: [], scores });

const onSave = vi.fn<(request: SaveRequest) => Promise<SaveOutcome>>();

function renderSheet(snapshot = sheet(), readOnly: ReadOnlyReason | null = null, onOpenHistory?: (student: { id: string }) => void) {
  return render(h(ScoreSheet, { draftKey: KEY, termName: "First Term", sheet: snapshot, readOnly, onSave, onOpenHistory }));
}

const row = (name: string) => screen.getByRole("group", { name: new RegExp(name) });
const field = (name: string, label: string) => within(row(name)).getByLabelText(new RegExp(`^${label},`));
const saveButton = () => screen.getByRole("button", { name: /Save scores|Try again/ });

beforeEach(() => {
  localStorage.clear();
  onSave.mockReset();
});
afterEach(cleanup);

describe("paste a column (AC-10)", () => {
  it("fills downwards, tidies trailing zeros, keeps bad values circled, and counts lines left over", async () => {
    renderSheet();
    fireEvent.paste(field("Abubakar", "Exam"), { clipboardData: { getData: () => "48.00\r\n\r\nabc\r\n70\r\n12.50\r\n" } });
    expect(field("Abubakar", "Exam")).toHaveValue("48");
    expect(field("Okon", "Exam")).toHaveValue(""); // a blank line leaves that student unchanged
    expect(field("Udo", "Exam")).toHaveValue("abc");
    expect(field("Udo", "Exam")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Exam must be a number like 15 or 12.5. You wrote abc.")).toBeInTheDocument();
    expect(screen.getByText(/Pasted 2 scores into Exam, from ABUBAKAR Sadiq down\. .* 2 lines were left over\./)).toBeInTheDocument();
  });

  it("refuses more than one column", () => {
    renderSheet();
    fireEvent.paste(field("Abubakar", "CA 1"), { clipboardData: { getData: () => "12\t15\n14\t16" } });
    expect(screen.getByText("Paste one column at a time.")).toBeInTheDocument();
    expect(field("Abubakar", "CA 1")).toHaveValue("");
  });
});

describe("saving (AC-4, AC-5)", () => {
  it("blocks Save while a typed score is above its maximum", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "Exam"), "61");
    expect(screen.getByText("Exam is out of 60. You wrote 61.")).toBeInTheDocument();
    await user.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("sends each change with the value it replaced, and retries the same frozen save after a failure", async () => {
    const user = userEvent.setup();
    renderSheet(sheet({ s1: { ca1: "10" } }));
    await user.clear(field("Abubakar", "CA 1"));
    await user.type(field("Abubakar", "CA 1"), "12");
    onSave.mockRejectedValueOnce(new Error("Failed to fetch"));
    await user.click(saveButton());
    expect(await screen.findByText("Couldn't save. Your scores are kept on this phone. Try again.")).toBeInTheDocument();
    const first = onSave.mock.calls[0][0];
    expect(first.changes).toEqual([{ studentId: "s1", componentKey: "ca1", expected: "10", value: "12" }]);
    expect(JSON.parse(localStorage.getItem(KEY)!).entries.s1.ca1).toEqual({ value: "12", base: "10" });

    // Typed after the tap: waits for the next Save.
    await user.type(field("Okon", "CA 1"), "9");
    onSave.mockResolvedValueOnce({ kind: "saved", updatedAt: new Date().toISOString() });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText(/1 student changed, not saved yet/);
    expect(onSave.mock.calls[1][0]).toEqual(first);
    expect(JSON.parse(localStorage.getItem(KEY)!).entries).toEqual({ s2: { ca1: { value: "9", base: "" } } });
  });

  it("says the app was updated when the server no longer knows the action", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "12");
    onSave.mockRejectedValueOnce(new Error("Server Action unavailable."));
    await user.click(saveButton());
    expect(await screen.findByText("VoxLMS was updated. Reload the page; your scores are kept on this phone.")).toBeInTheDocument();
  });
});

describe("conflicts (AC-7)", () => {
  it("shows the newer saved value beside mine, and Keep mine saves over it", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "12");
    onSave.mockResolvedValueOnce({ kind: "conflict", studentIds: ["s1"], sheet: sheet({ s1: { ca1: "15" } }) });
    await user.click(saveButton());
    expect(await screen.findByText(/CA 1 15\. Yours are in the boxes\./)).toBeInTheDocument();
    expect(field("Abubakar", "CA 1")).toHaveValue("12");
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Keep mine" }));
    expect(saveButton()).toBeEnabled();
    onSave.mockResolvedValueOnce({ kind: "saved", updatedAt: new Date().toISOString() });
    await user.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].changes).toEqual([{ studentId: "s1", componentKey: "ca1", expected: "15", value: "12" }]);
  });

  it("Use saved drops the typed values for that row", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "12");
    onSave.mockResolvedValueOnce({ kind: "conflict", studentIds: ["s1"], sheet: sheet({ s1: { ca1: "15" } }) });
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "Use saved" }));
    expect(field("Abubakar", "CA 1")).toHaveValue("15");
    expect(screen.queryByRole("button", { name: "Keep mine" })).not.toBeInTheDocument();
  });

  it("restores a draft typed over a value someone has since changed as a conflict, never overwriting it", async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: { s1: { ca1: { value: "14", base: "12" } }, s2: { ca1: { value: "9", base: "" } } } }));
    renderSheet(sheet({ s1: { ca1: "15" }, s2: { ca1: "9" } }));
    expect(await screen.findByText(/CA 1 15\. Yours are in the boxes\./)).toBeInTheDocument();
    expect(field("Abubakar", "CA 1")).toHaveValue("14");
    // Okon's typed 9 now equals the saved 9, so it drops out.
    expect(within(row("Okon")).queryByRole("button", { name: "Keep mine" })).not.toBeInTheDocument();
    expect(screen.getByText(/Unsaved scores for 1 student were kept on this phone/)).toBeInTheDocument();
  });
});

describe("an out of date sheet (AC-8)", () => {
  it("names a student who left, drops their row, and keeps the rest typed", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "12");
    await user.type(field("Okon", "CA 1"), "13");
    onSave.mockResolvedValueOnce({ kind: "stale", removedStudentIds: ["s2"], sheet: sheet({}, [students[0], students[2]]) });
    await user.click(saveButton());
    expect(await screen.findByText("OKON Emem is no longer in this subject, so their scores were not saved.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Okon/ })).not.toBeInTheDocument();
    expect(field("Abubakar", "CA 1")).toHaveValue("12");
    expect(screen.getByText(/1 student changed, not saved yet/)).toBeInTheDocument();
  });
});

describe("read only sheets (AC-6, AC-9, AC-13)", () => {
  it("lists scores never saved before the term closed, and Discard clears them", async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: { s1: { exam: { value: "48", base: "" } } } }));
    renderSheet(sheet(), "closed");
    expect(screen.getByText("First Term is closed. Scores can only be changed in the current term.")).toBeInTheDocument();
    expect(await screen.findByText(/1 score typed on this phone was never saved before First Term closed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save scores" })).not.toBeInTheDocument();
    expect(field("Abubakar", "Exam")).toHaveAttribute("readonly");
    expect(field("Abubakar", "Exam")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Discard these scores" }));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(screen.queryByText(/never saved before/)).not.toBeInTheDocument();
  });

  it("turns read only when a save finds the term closed, keeping the draft", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "Exam"), "48");
    onSave.mockResolvedValueOnce({ kind: "closed" });
    await user.click(saveButton());
    expect(await screen.findByText(/1 score typed on this phone was never saved before First Term closed/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEY)!).entries.s1.exam.value).toBe("48");
  });

  it("never reads or makes a draft while viewing as", async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: { s1: { exam: { value: "48", base: "" } } } }));
    renderSheet(sheet(), "viewingAs");
    expect(screen.getByText("You are viewing as this person. Nothing can be saved.")).toBeInTheDocument();
    expect(screen.queryByText(/never saved/)).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });
});

describe("moving around the sheet (AC-4)", () => {
  it("moves along the row on Enter, then to the next student, and up and down a column with the arrows", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(field("Abubakar", "CA 1"));
    await user.keyboard("{Enter}");
    expect(field("Abubakar", "CA 2")).toHaveFocus();
    await user.click(field("Abubakar", "Exam"));
    await user.keyboard("{Enter}");
    expect(field("Okon", "CA 1")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(field("Udo", "CA 1")).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(field("Okon", "CA 1")).toHaveFocus();
  });

  it("takes digits and one decimal place only", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "1a2.55");
    expect(field("Abubakar", "CA 1")).toHaveValue("12.5");
  });

  it("shows a dash for a part not entered, and no total until every part is in", async () => {
    renderSheet(sheet({ s1: { ca1: "15", ca2: "16" } }));
    expect(within(row("Abubakar")).getByText("Exam not entered yet")).toBeInTheDocument();
    expect(within(row("Abubakar")).getByLabelText("No total yet")).toBeInTheDocument();
    expect(field("Abubakar", "Exam")).toHaveAttribute("placeholder", "–");
  });
});

describe("score history from the name (AC-11)", () => {
  it("opens the history for the student whose name is tapped", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderSheet(sheet(), null, onOpenHistory);
    await user.click(screen.getByRole("button", { name: /Okon Emem, see score history/ }));
    expect(onOpenHistory).toHaveBeenCalledWith(expect.objectContaining({ id: "s2" }));
  });

  it("opens history on a read only sheet too", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderSheet(sheet(), "closed", onOpenHistory);
    await user.click(screen.getByRole("button", { name: /Abubakar Sadiq, see score history/ }));
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });
});

describe("requests that go wrong (AC-5, AC-13)", () => {
  afterEach(() => vi.useRealTimers());

  it("counts a request with no reply after 20 seconds as failed, so Save can be tried again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "12");
    onSave.mockReturnValueOnce(new Promise(() => {}));
    await user.click(saveButton());
    expect(screen.getByText("Saving scores…")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(19_000);
    expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await screen.findByText("Couldn't save. Your scores are kept on this phone. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("asks the teacher to sign in again when signed out, keeping the draft", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "12");
    onSave.mockResolvedValueOnce({ kind: "signedOut" });
    await user.click(saveButton());
    expect(await screen.findByText("You were signed out. Sign in again; your scores are kept on this phone.")).toBeInTheDocument();
    expect(screen.getByText("Sign in").closest("a")).toHaveAttribute("href", "/login");
    expect(JSON.parse(localStorage.getItem(KEY)!).entries.s1.ca1.value).toBe("12");
  });

  it("turns read only and keeps the draft when the teacher no longer has the class", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "12");
    onSave.mockResolvedValueOnce({ kind: "notFound" });
    await user.click(saveButton());
    expect(await screen.findByText("You no longer have this class. Your typed scores are kept on this phone.")).toBeInTheDocument();
    expect(field("Abubakar", "CA 1")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Save scores" })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEY)!).entries.s1.ca1.value).toBe("12");
  });

  it("asks for a reload when the server says a score didn't match the sheet", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "12");
    onSave.mockResolvedValueOnce({ kind: "invalid", studentId: "s1", componentKey: "ca1" });
    await user.click(saveButton());
    expect(await screen.findByText(/didn't match the sheet. Reload the page/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
  });

  it("keeps Save off and says so while offline", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(field("Abubakar", "CA 1"), "12");
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fireEvent(window, new Event("offline"));
    expect(await screen.findByText("You are offline. Your scores are kept on this phone until you can save.")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    online.mockRestore();
  });
});
