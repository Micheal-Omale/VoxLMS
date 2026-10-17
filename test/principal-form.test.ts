// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { savePrincipalAction } from "@/app/admin/schools/setup-actions";
import { PrincipalForm } from "@/app/admin/schools/[schoolId]/details/principal-form";

// Spec 0007, AC-1 and AC-2: the Principal block's title and name, and the
// confirm before a fix. The server action is mocked; its rules have data tests.

vi.mock("@/app/admin/schools/setup-actions", () => ({ savePrincipalAction: vi.fn() }));

const save = vi.mocked(savePrincipalAction);
const sent = (call: number) => save.mock.calls[call][2] as FormData;
const nameField = () => screen.getByLabelText("Name, as printed on report cards");

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ ok: true, message: "Principal saved." });
});
afterEach(cleanup);

describe("setting the principal (AC-1)", () => {
  it("saves the name the first time without asking", async () => {
    const user = userEvent.setup();
    render(h(PrincipalForm, { schoolId: "school-1", initial: { title: "Principal", name: "" } }));
    expect(screen.getByLabelText("Title")).toHaveValue("Principal");

    await user.type(nameField(), "Mr Samuel Adeleke");
    await user.click(screen.getByRole("button", { name: "Save principal" }));

    expect(await screen.findByText("Principal saved.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(sent(0).get("principalTitle")).toBe("Principal");
    expect(sent(0).get("principalName")).toBe("Mr Samuel Adeleke");
  });

  it("offers the suggested titles", () => {
    render(h(PrincipalForm, { schoolId: "school-1", initial: { title: "Principal", name: "" } }));
    const options = [...document.querySelectorAll("#principal-titles option")].map((o) => o.getAttribute("value"));
    expect(options).toEqual(["Principal", "Head teacher", "Proprietor", "Proprietress", "Head of school"]);
  });

  it("shows the server's refusal under the name and keeps what was typed", async () => {
    const user = userEvent.setup();
    save.mockResolvedValueOnce({ ok: false, field: "principalName", error: "Type the principal's name as printed on report cards, 3 to 80 characters.", values: { principalTitle: "Principal", principalName: "Ab" } });
    render(h(PrincipalForm, { schoolId: "school-1", initial: { title: "Principal", name: "" } }));
    nameField().removeAttribute("minlength");

    await user.type(nameField(), "Ab");
    await user.click(screen.getByRole("button", { name: "Save principal" }));

    expect(await screen.findByText("Type the principal's name as printed on report cards, 3 to 80 characters.")).toBeInTheDocument();
    expect(nameField()).toHaveValue("Ab");
    expect(nameField()).toHaveAttribute("aria-invalid", "true");
  });
});

describe("fixing the principal (AC-2)", () => {
  const initial = { title: "Principal", name: "Mr Samuel Adeleke" };

  it("asks first, saying past terms change too, and saves on Save the change", async () => {
    const user = userEvent.setup();
    render(h(PrincipalForm, { schoolId: "school-1", initial }));
    await user.clear(nameField());
    await user.type(nameField(), "Mr Samuel Adeleke Jr");
    await user.click(screen.getByRole("button", { name: "Save principal" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Change the principal on report cards?")).toBeInTheDocument();
    expect(within(dialog).getByText("This shows on every report card the principal signs, reprints of past terms included.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Save the change" }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(sent(0).get("principalName")).toBe("Mr Samuel Adeleke Jr");
  });

  it("asks before a title change too", async () => {
    const user = userEvent.setup();
    render(h(PrincipalForm, { schoolId: "school-1", initial }));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Proprietor");
    await user.click(screen.getByRole("button", { name: "Save principal" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("saves nothing when Keep it as it was is pressed", async () => {
    const user = userEvent.setup();
    render(h(PrincipalForm, { schoolId: "school-1", initial }));
    await user.clear(nameField());
    await user.type(nameField(), "Mrs Funke Alade");
    await user.click(screen.getByRole("button", { name: "Save principal" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Keep it as it was" }));

    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(save).not.toHaveBeenCalled();
  });

  it("saves without asking when nothing changed", async () => {
    const user = userEvent.setup();
    render(h(PrincipalForm, { schoolId: "school-1", initial }));
    await user.click(screen.getByRole("button", { name: "Save principal" }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
