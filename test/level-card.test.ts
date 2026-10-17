// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveLevelOfferAction } from "@/app/admin/schools/curriculum-actions";
import { type ClassRow, LevelCard } from "@/app/admin/schools/[schoolId]/classes/level-card";

// "Copy the level before's subjects" on the Classes page: ticks what the level
// before gives every arm into this level's unsaved draft. The save is mocked;
// saveLevelOffer has its own data tests (spec 0006).

vi.mock("@/app/admin/schools/curriculum-actions", () => ({
  saveLevelOfferAction: vi.fn(),
  saveClassOfferAction: vi.fn(),
  saveClassAction: vi.fn(),
  removeClassAction: vi.fn(),
  restoreClassAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const save = vi.mocked(saveLevelOfferAction);

const subjects = [
  { id: "maths", name: "Mathematics", isActive: true },
  { id: "english", name: "English Language", isActive: true },
  { id: "crs", name: "Christian Religious Studies", isActive: true },
  { id: "french", name: "French", isActive: true },
  { id: "music", name: "Music", isActive: false },
];

const arm = (id: string, name: string, arm: string | null, offer: ClassRow["offer"]): ClassRow => ({
  id,
  name,
  arm,
  isActive: true,
  studentsNow: 0,
  inUse: false,
  offer,
});

// Primary 1: both arms take Maths and English, CRS as an elective, and switched off Music. Only arm A takes French.
const primary1 = [
  arm("p1a", "Primary 1 A", "A", [
    { subjectId: "maths", isElective: false },
    { subjectId: "english", isElective: false },
    { subjectId: "crs", isElective: true },
    { subjectId: "french", isElective: false },
    { subjectId: "music", isElective: false },
  ]),
  arm("p1b", "Primary 1 B", "B", [
    { subjectId: "maths", isElective: false },
    { subjectId: "english", isElective: false },
    { subjectId: "crs", isElective: true },
    { subjectId: "music", isElective: false },
  ]),
];

async function openPrimary2(primary2Offer: ClassRow["offer"], previous: { name: string; classes: ClassRow[] } | null = { name: "Primary 1", classes: primary1 }) {
  const user = userEvent.setup();
  render(
    h(LevelCard, {
      schoolId: "school-1",
      session: { id: "session-1", name: "2026/2027" },
      level: { id: "pry2", name: "Primary 2" },
      classes: [arm("p2a", "Primary 2 A", "A", primary2Offer), arm("p2b", "Primary 2 B", "B", primary2Offer)],
      previous,
      subjects,
    }),
  );
  await user.click(screen.getByRole("button", { name: /Primary 2/, expanded: false }));
  return user;
}

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ ok: true, changed: 3 });
});
afterEach(cleanup);

describe("Copy the level before's subjects", () => {
  it("ticks what the level before gives every arm, with its electives, and saves nothing yet", async () => {
    const user = await openPrimary2([]);
    await user.click(screen.getByRole("button", { name: "Copy Primary 1’s subjects" }));

    expect(screen.getByRole("checkbox", { name: "Mathematics" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "English Language" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Christian Religious Studies" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Christian Religious Studies: elective" })).toHaveAttribute("aria-pressed", "true");
    // French is only in arm A of Primary 1, and Music is switched off: neither is copied.
    expect(screen.getByRole("checkbox", { name: "French" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Music/ })).not.toBeInTheDocument();

    expect(screen.getByText("Ticked 3 subjects from Primary 1. Check them, then save.")).toBeInTheDocument();
    expect(screen.getByText(/3 not saved yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Has all of Primary 1’s subjects" })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it("only adds: a subject this level already has stays, and one it lacks is not taken away", async () => {
    const user = await openPrimary2([
      { subjectId: "maths", isElective: false },
      { subjectId: "french", isElective: false },
    ]);
    await user.click(screen.getByRole("button", { name: "Copy Primary 1’s subjects" }));

    expect(screen.getByText("Ticked 2 subjects from Primary 1. Check them, then save.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "French" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mathematics" })).toBeChecked();
  });

  it("sends the copied subjects to every arm when Save is pressed", async () => {
    const user = await openPrimary2([]);
    await user.click(screen.getByRole("button", { name: "Copy Primary 1’s subjects" }));
    await user.click(screen.getByRole("button", { name: "Save for all 2 arms" }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [schoolId, levelId, sessionId, changes] = save.mock.calls[0];
    expect([schoolId, levelId, sessionId]).toEqual(["school-1", "pry2", "session-1"]);
    expect(changes).toEqual(
      expect.arrayContaining([
        { subjectId: "maths", offered: true, isElective: false },
        { subjectId: "english", offered: true, isElective: false },
        { subjectId: "crs", offered: true, isElective: true },
      ]),
    );
    expect(changes).toHaveLength(3);
  });

  it("puts the draft back with Undo changes", async () => {
    const user = await openPrimary2([]);
    await user.click(screen.getByRole("button", { name: "Copy Primary 1’s subjects" }));
    await user.click(screen.getByRole("button", { name: "Undo changes" }));

    expect(screen.getByRole("checkbox", { name: "Mathematics" })).not.toBeChecked();
    expect(screen.queryByText(/Ticked 3 subjects/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Primary 1’s subjects" })).toBeEnabled();
  });

  it("has no Copy button for the first level of a section, such as JSS 1 after Primary 6", async () => {
    await openPrimary2([], null);
    const offer = screen.getByRole("region", { name: "Subjects in 2026/2027" });
    expect(within(offer).queryByRole("button", { name: /Copy|Has all of/ })).not.toBeInTheDocument();
  });

  it("has no Copy button when the level before gives no subject to every arm", async () => {
    await openPrimary2([], {
      name: "Primary 1",
      classes: [arm("p1a", "Primary 1 A", "A", [{ subjectId: "french", isElective: false }]), arm("p1b", "Primary 1 B", "B", [])],
    });
    expect(screen.queryByRole("button", { name: /Copy Primary 1’s subjects/ })).not.toBeInTheDocument();
  });
});
