// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addStudentAction } from "@/app/admin/schools/enrol-actions";
import { ClassRegister } from "@/app/admin/schools/[schoolId]/students/[classId]/class-register";
import type { ClassRoster } from "@/server/data/students";

// Spec 0008, AC-5 and AC-6: the quick add row under the register. The server
// action is mocked; addStudent's rules have data tests (test/enrolment.test.ts).

vi.mock("@/app/admin/schools/enrol-actions", () => ({
  addStudentAction: vi.fn(),
  setStudentLeftAction: vi.fn(),
  saveStudentAction: vi.fn(),
  moveStudentAction: vi.fn(),
  removeStudentAction: vi.fn(),
  removeStudentPhotoAction: vi.fn(),
  addGuardianAction: vi.fn(),
  saveGuardianAction: vi.fn(),
  unlinkGuardianAction: vi.fn(),
  makePrimaryGuardianAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const add = vi.mocked(addStudentAction);

const roster = {
  cls: { id: "class-1", name: "JSS 2 Gold", isActive: true, sectionId: "s", sectionName: "Junior Secondary", teacherTitle: "Form master", schoolCode: "GHS" },
  term: { id: "term-1", number: 1, startsOn: "2026-09-14", sessionId: "session-1", sessionName: "2026/2027" },
  formTeacher: null,
  teachers: [],
  electiveSubjects: [],
  otherClasses: [],
  students: [],
} as unknown as ClassRoster;

async function typeStudent(user: ReturnType<typeof userEvent.setup>, surname: string, other: string) {
  await user.click(screen.getByLabelText("Surname"));
  await user.keyboard(surname);
  await user.tab();
  await user.keyboard(other);
  await user.tab();
  // Typing G picks Girl, and Enter saves, without leaving the keyboard.
  await user.keyboard("g{Enter}");
}

beforeEach(() => {
  add.mockReset();
  add.mockResolvedValue({ ok: true, studentId: "new", studentNo: "GHS-0023" });
});
afterEach(cleanup);

describe("the quick add row (AC-5)", () => {
  it("saves on Enter, then clears the row and puts the cursor back on surname", async () => {
    const user = userEvent.setup();
    render(h(ClassRegister, { schoolId: "school-1", roster }));
    expect(screen.getByText(/No students in JSS 2 Gold yet/)).toBeInTheDocument();

    await typeStudent(user, "Okafor", "Chinedu");

    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0]).toEqual(["school-1", "class-1", { surname: "Okafor", otherNames: "Chinedu", gender: "female", admissionNo: "", confirmDuplicate: false }]);
    await vi.waitFor(() => expect(screen.getByLabelText("Surname")).toHaveValue(""));
    expect(screen.getByLabelText("Other names")).toHaveValue("");
    expect(screen.getByLabelText("Surname")).toHaveFocus();
  });

  it("asks for a gender before saving", async () => {
    const user = userEvent.setup();
    render(h(ClassRegister, { schoolId: "school-1", roster }));
    await user.type(screen.getByLabelText("Surname"), "Okafor");
    await user.type(screen.getByLabelText("Other names"), "Chinedu{Enter}");
    expect(await screen.findByText("Choose boy or girl.")).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
  });

  it("keeps what was typed when the save is refused, and shows why", async () => {
    const user = userEvent.setup();
    add.mockResolvedValueOnce({ ok: false, field: "admissionNo", error: "GHS/24/015 already belongs to OKON Emem." });
    render(h(ClassRegister, { schoolId: "school-1", roster }));
    await user.type(screen.getByLabelText(/Admission no/), "GHS/24/015");
    await typeStudent(user, "Okafor", "Chinedu");

    expect(await screen.findByText("GHS/24/015 already belongs to OKON Emem.")).toBeInTheDocument();
    expect(screen.getByLabelText("Surname")).toHaveValue("Okafor");
    expect(screen.getByLabelText(/Admission no/)).toHaveValue("GHS/24/015");
    expect(screen.getByLabelText(/Admission no/)).toHaveAttribute("aria-invalid", "true");
  });
});

describe("the same name warning (AC-6)", () => {
  it("asks 'Add anyway?' and sends the confirm on yes", async () => {
    const user = userEvent.setup();
    add.mockResolvedValueOnce({ ok: false, field: "surname", needsConfirm: true, error: "There is already an OKAFOR Chinedu in JSS 2 Gold. Add anyway?" });
    render(h(ClassRegister, { schoolId: "school-1", roster }));
    await typeStudent(user, "Okafor", "Chinedu");

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("There is already an OKAFOR Chinedu in JSS 2 Gold. Add anyway?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Add anyway" }));

    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(add.mock.calls[1][2]).toMatchObject({ surname: "Okafor", confirmDuplicate: true });
  });
});
