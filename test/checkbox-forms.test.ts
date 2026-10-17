// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signInAction } from "@/app/login/actions";
import { SignInForm } from "@/app/login/sign-in-form";
import { SchoolDetailsForm } from "@/app/admin/schools/school-details-form";

// The refused save bug found in spec 0007's verify: React resets a form after
// its server action returns, and a Base UI checkbox's own hidden input reset to
// unticked while the box still looked ticked. These lock in the fix for the two
// checkboxes that had the same cause as the section switch.

vi.mock("@/app/login/actions", () => ({ signInAction: vi.fn() }));

afterEach(cleanup);

describe("the attendance checkbox on School details", () => {
  const initial = {
    name: "Grace High School",
    slug: "gracehigh",
    code: "GHS",
    address: "14 Adeola Odeku Street, Victoria Island, Lagos",
    motto: "",
    phone: "",
    email: "",
    plan: "school_logo" as const,
    showAttendance: false,
  };

  it("still sends attendance as on after the server refuses a save", async () => {
    const user = userEvent.setup();
    const action = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, field: "slug", error: "Another school already uses that web name.", values: { slug: "gracehigh" } })
      .mockResolvedValueOnce({ ok: true, message: "Saved." });
    render(h(SchoolDetailsForm, { mode: "edit", initial, action }));

    await user.click(screen.getByRole("checkbox", { name: /Report cards show attendance/ }));
    await user.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Another school already uses that web name.")).toBeInTheDocument();
    expect((action.mock.calls[0][1] as FormData).get("showAttendance")).toBe("on");

    await user.click(screen.getByRole("button", { name: "Save details" }));

    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("checkbox", { name: /Report cards show attendance/ })).toBeChecked();
    expect((action.mock.calls[1][1] as FormData).get("showAttendance")).toBe("on");
  });

  it("sends attendance as off when the box is not ticked", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true, message: "Saved." });
    render(h(SchoolDetailsForm, { mode: "edit", initial: { ...initial, showAttendance: true }, action }));

    await user.click(screen.getByRole("checkbox", { name: /Report cards show attendance/ }));
    await user.click(screen.getByRole("button", { name: "Save details" }));

    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((action.mock.calls[0][1] as FormData).get("showAttendance")).not.toBe("on");
  });
});

describe("the shared computer checkbox on sign in", () => {
  const signIn = vi.mocked(signInAction);

  it("still sends shared as on after a wrong password, so the session ends with the browser", async () => {
    const user = userEvent.setup();
    signIn.mockReset();
    signIn.mockResolvedValueOnce({ error: "That phone number or password is not right. Check both and try again.", phone: "08090000099" });
    render(h(SignInForm));

    await user.type(screen.getByLabelText("Phone number"), "08090000099");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("checkbox", { name: "This is a shared computer" }));
    await user.click(screen.getByRole("button", { name: /Sign in/ }));
    expect(await screen.findByText("That phone number or password is not right. Check both and try again.")).toBeInTheDocument();
    expect((signIn.mock.calls[0][1] as FormData).get("shared")).toBe("on");

    await user.type(screen.getByLabelText("Password"), "right-password");
    await user.click(screen.getByRole("button", { name: /Sign in/ }));

    await vi.waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("checkbox", { name: "This is a shared computer" })).toBeChecked();
    expect((signIn.mock.calls[1][1] as FormData).get("shared")).toBe("on");
  });

  it("sends shared as off by default", async () => {
    const user = userEvent.setup();
    signIn.mockReset();
    signIn.mockResolvedValue(null);
    render(h(SignInForm));

    await user.type(screen.getByLabelText("Phone number"), "08090000099");
    await user.type(screen.getByLabelText("Password"), "right-password");
    await user.click(screen.getByRole("button", { name: /Sign in/ }));

    await vi.waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect((signIn.mock.calls[0][1] as FormData).get("shared")).not.toBe("on");
  });
});
