// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HistoryPanel } from "@/app/[school]/classes/[classId]/scores/[classSubjectId]/history-panel";
import { scoreHistoryAction } from "@/app/[school]/classes/score-actions";

// Spec 0009, AC-11: a student's score history, opened from their name. The
// action is mocked; getScoreHistory's rules have data tests.

vi.mock("@/app/[school]/classes/score-actions", () => ({ scoreHistoryAction: vi.fn(), saveScoresAction: vi.fn() }));
const history = vi.mocked(scoreHistoryAction);

const student = { id: "s1", surname: "Okon", otherNames: "Emem", number: "GHS/015" };
const open = () =>
  render(
    h(HistoryPanel, { slug: "gracehigh", termId: "t1", classSubjectId: "cs1", subjectName: "Mathematics", termName: "First Term", student, onClose: vi.fn() }),
  );

beforeEach(() => history.mockReset());
afterEach(cleanup);

describe("score history (AC-11)", () => {
  it("lists each part's changes newest first, with who and when in Lagos time", async () => {
    history.mockResolvedValue({
      ok: true,
      parts: [
        {
          key: "ca1",
          label: "CA 1",
          changes: [
            { oldValue: "12", newValue: "15", changedAt: "2026-10-17T13:14:00.000Z", by: "VoxLMS team (Ada)" },
            { oldValue: null, newValue: "12", changedAt: "2026-10-16T08:05:00.000Z", by: "Mrs Funke Adewale" },
          ],
        },
        { key: "exam", label: "Exam", changes: [] },
      ],
    });
    open();
    const ca1 = await screen.findByRole("region", { name: "CA 1" });
    const rows = within(ca1).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("12");
    expect(rows[0]).toHaveTextContent("15");
    expect(rows[0]).toHaveTextContent("VoxLMS team (Ada) · 17 Oct 2026, 2:14 pm");
    expect(rows[1]).toHaveTextContent("Mrs Funke Adewale · 16 Oct 2026, 9:05 am");
    expect(within(screen.getByRole("region", { name: "Exam" })).getByText("No changes")).toBeInTheDocument();
    expect(history).toHaveBeenCalledWith("gracehigh", { termId: "t1", classSubjectId: "cs1", studentId: "s1" });
  });

  it("names the student, subject and term in the panel heading", async () => {
    history.mockResolvedValue({ ok: true, parts: [] });
    open();
    expect(await screen.findByRole("dialog", { name: "Okon Emem" })).toBeInTheDocument();
    expect(screen.getByText(/Score history · Mathematics · First Term/)).toBeInTheDocument();
  });

  it("marks a cleared score", async () => {
    history.mockResolvedValue({ ok: true, parts: [{ key: "ca1", label: "CA 1", changes: [{ oldValue: "12", newValue: null, changedAt: "2026-10-17T13:14:00.000Z", by: "Mrs Funke Adewale" }] }] });
    open();
    expect(await screen.findByText("(cleared)")).toBeInTheDocument();
  });

  it("says No changes yet for a student with no saves", async () => {
    history.mockResolvedValue({ ok: true, parts: [{ key: "ca1", label: "CA 1", changes: [] }] });
    open();
    expect(await screen.findByText("No changes yet.")).toBeInTheDocument();
  });

  it("offers Try again when the history could not be loaded, and loads it on retry", async () => {
    const user = userEvent.setup();
    history.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce({ ok: true, parts: [{ key: "ca1", label: "CA 1", changes: [] }] });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the history. Check your connection and try again.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No changes yet.")).toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["signedOut" as const, "You were signed out. Sign in again to see the history."],
    ["notFound" as const, "OKON Emem is no longer on this sheet. Reload the page."],
  ])("explains a %s answer instead of showing an empty history (AC-13)", async (kind, message) => {
    history.mockResolvedValue({ ok: false, kind });
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
