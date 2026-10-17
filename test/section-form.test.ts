// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveSectionAction } from "@/app/admin/schools/setup-actions";
import { SectionForm } from "@/app/admin/schools/[schoolId]/sections/section-form";

// Spec 0007, AC-3 and AC-4: the section form's "Has its own head" switch and its
// confirms. The server action is mocked; the data rules have their own tests.

vi.mock("@/app/admin/schools/setup-actions", () => ({
  saveSectionAction: vi.fn(),
  removeSectionAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const save = vi.mocked(saveSectionAction);
/** The form a save sent: the action is bound to the school id, then gets (previous state, form). */
const sent = (call: number) => save.mock.calls[call][2] as FormData;

const withHead = { teacherTitle: "Class teacher", headTitle: "Head teacher", headName: "Mrs Grace Oyelaran" };
const noHead = { teacherTitle: "Form master", headTitle: "Head teacher", headName: "" };

function renderForm(initial: typeof withHead, sectionId: string | null = "section-1") {
  return render(h(SectionForm, { schoolId: "school-1", stage: "primary", sectionName: "Primary", sectionId, initial }));
}

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ ok: true, message: "Section saved." });
});
afterEach(cleanup);

describe("the own head switch", () => {
  it("shows the head's title and name only while it is on, with labelled fields", async () => {
    const user = userEvent.setup();
    renderForm(noHead);
    expect(screen.queryByLabelText("Head’s name, as printed on report cards")).not.toBeInTheDocument();
    expect(screen.getByText("Off: the principal signs Primary’s report cards.")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Has its own head" }));

    expect(screen.getByLabelText("Head’s title")).toHaveValue("Head teacher");
    expect(screen.getByLabelText("Head’s name, as printed on report cards")).toHaveValue("");
    expect(screen.getByText("This head signs Primary’s report cards instead of the principal.")).toBeInTheDocument();
  });

  it("still sends the switch as on after the server refuses a save (covers AC-3, the refused save bug)", async () => {
    const user = userEvent.setup();
    save.mockResolvedValueOnce({ ok: false, field: "headName", error: "Type the head's name as printed on report cards, 3 to 80 characters.", values: { headTitle: "Head teacher", headName: "Ab" } });
    renderForm(noHead);
    await user.click(screen.getByRole("switch", { name: "Has its own head" }));
    const name = screen.getByLabelText("Head’s name, as printed on report cards");
    // The browser's own length check would stop "Ab"; remove it so the server's refusal is what we test.
    name.removeAttribute("minlength");
    await user.type(name, "Ab");
    await user.click(screen.getByRole("button", { name: "Save section" }));
    expect(await screen.findByText("Type the head's name as printed on report cards, 3 to 80 characters.")).toBeInTheDocument();
    expect(sent(0).get("hasOwnHead")).toBe("on");

    await user.clear(screen.getByLabelText("Head’s name, as printed on report cards"));
    await user.type(screen.getByLabelText("Head’s name, as printed on report cards"), "Mrs Grace Oyelaran");
    await user.click(screen.getByRole("button", { name: "Save section" }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("switch", { name: "Has its own head" })).toBeChecked();
    expect(sent(1).get("hasOwnHead")).toBe("on");
    expect(sent(1).get("headName")).toBe("Mrs Grace Oyelaran");
  });

  it("sends the switch as off when the section has no own head", async () => {
    const user = userEvent.setup();
    renderForm(noHead);
    await user.click(screen.getByRole("button", { name: "Save section" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(sent(0).get("hasOwnHead")).not.toBe("on");
  });
});

describe("the confirms before a fix (AC-3 and AC-4)", () => {
  it("asks before switching an own head off, naming the section and the head, and Keep it as it was saves nothing", async () => {
    const user = userEvent.setup();
    renderForm(withHead);
    await user.click(screen.getByRole("switch", { name: "Has its own head" }));
    await user.click(screen.getByRole("button", { name: "Save section" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Let the principal sign Primary’s report cards?")).toBeInTheDocument();
    expect(
      within(dialog).getByText("The principal will sign Primary’s report cards, reprints of past terms included. Mrs Grace Oyelaran’s name and signature will be removed."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep it as it was" }));

    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(save).not.toHaveBeenCalled();
  });

  it("switches the head off once Remove the head is pressed", async () => {
    const user = userEvent.setup();
    renderForm(withHead);
    await user.click(screen.getByRole("switch", { name: "Has its own head" }));
    await user.click(screen.getByRole("button", { name: "Save section" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove the head" }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(sent(0).get("hasOwnHead")).not.toBe("on");
  });

  it("asks before changing an own head's name, then saves the new name", async () => {
    const user = userEvent.setup();
    renderForm(withHead);
    const name = screen.getByLabelText("Head’s name, as printed on report cards");
    await user.clear(name);
    await user.type(name, "Mrs Grace Oyelaran Bello");
    await user.click(screen.getByRole("button", { name: "Save section" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Change Primary’s head on report cards?")).toBeInTheDocument();
    expect(within(dialog).getByText("This shows on every Primary report card, reprints of past terms included.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save the change" }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(sent(0).get("headName")).toBe("Mrs Grace Oyelaran Bello");
    expect(sent(0).get("hasOwnHead")).toBe("on");
  });

  it("saves without asking when nothing about the head changed", async () => {
    const user = userEvent.setup();
    renderForm(withHead);
    const teacher = screen.getByLabelText("Teacher’s title");
    await user.clear(teacher);
    await user.type(teacher, "Form teacher");
    await user.click(screen.getByRole("button", { name: "Save section" }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("saves a new section's own head without asking, since nothing is being replaced", async () => {
    const user = userEvent.setup();
    renderForm(noHead, null);
    await user.click(screen.getByRole("switch", { name: "Has its own head" }));
    await user.type(screen.getByLabelText("Head’s name, as printed on report cards"), "Mrs Grace Oyelaran");
    await user.click(screen.getByRole("button", { name: "Add section" }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(sent(0).get("hasOwnHead")).toBe("on");
  });
});
