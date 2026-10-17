// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageUpload } from "@/app/admin/schools/[schoolId]/image-upload";
import { headFix, principalFix } from "@/app/admin/schools/[schoolId]/fix-copy";

// Spec 0007, AC-2, AC-3 and AC-8: whose signature an upload is, and the confirm
// before replacing one. jsdom has no canvas, so the browser's image shrinking
// and the network are stubbed at their edges.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const fetchMock = vi.fn();
const photo = () => new File(["photo"], "signature.jpg", { type: "image/jpeg" });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const sentForm = (call = 0) => fetchMock.mock.calls[call][1].body as FormData;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, assetId: "a1" })));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 300, height: 100, close: () => {} })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: () => {},
    getImageData: (_x: number, _y: number, w: number, hgt: number) => ({ data: new Uint8ClampedArray(w * hgt * 4) }),
    putImageData: () => {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => done(new Blob(["png"], { type: "image/png" })));
  URL.createObjectURL = vi.fn(() => "blob:preview");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const signature = (props: Partial<Parameters<typeof ImageUpload>[0]> = {}) =>
  render(
    h(ImageUpload, {
      schoolId: "school-1",
      kind: "signature",
      owner: { signer: "principal" },
      label: "Principal’s signature",
      hint: "Sign on plain white paper and take a photo.",
      currentUrl: null,
      confirmReplace: principalFix("signature"),
      ...props,
    }),
  );

describe("the first signature (AC-1, AC-2)", () => {
  it("says No signature yet, then uploads without asking", async () => {
    const user = userEvent.setup();
    signature();
    expect(screen.getByText("No signature yet")).toBeInTheDocument();

    await user.upload(fileInput(), photo());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Current principal’s signature" })).toHaveAttribute("src", "blob:preview");
  });

  it("sends the principal as the owner (AC-8)", async () => {
    const user = userEvent.setup();
    signature();
    await user.upload(fileInput(), photo());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/admin/schools/school-1/images");
    expect(sentForm().get("kind")).toBe("signature");
    expect(sentForm().get("signer")).toBe("principal");
    expect(sentForm().get("sectionId")).toBeNull();
  });

  it("sends the section as the owner for a section head's signature (AC-8)", async () => {
    const user = userEvent.setup();
    signature({ owner: { signer: "section", sectionId: "section-1" }, label: "Head teacher’s signature", confirmReplace: headFix("Primary", "signature") });
    await user.upload(fileInput(), photo());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentForm().get("signer")).toBe("section");
    expect(sentForm().get("sectionId")).toBe("section-1");
  });
});

describe("replacing a signature (AC-2, AC-3)", () => {
  it("asks first, naming the section for a head's signature, and Keep it as it was uploads nothing", async () => {
    const user = userEvent.setup();
    signature({ owner: { signer: "section", sectionId: "section-1" }, currentUrl: "/admin/schools/school-1/images/old", confirmReplace: headFix("Primary", "signature") });

    await user.upload(fileInput(), photo());
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Replace the signature of Primary’s head?")).toBeInTheDocument();
    expect(within(dialog).getByText("This shows on every Primary report card, reprints of past terms included.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep it as it was" }));

    await vi.waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/admin/schools/school-1/images/old");
  });

  it("uploads the new principal signature once Use the new signature is pressed", async () => {
    const user = userEvent.setup();
    signature({ currentUrl: "/admin/schools/school-1/images/old" });

    await user.upload(fileInput(), photo());
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("This shows on every report card the principal signs, reprints of past terms included.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Use the new signature" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentForm().get("signer")).toBe("principal");
  });

  it("replaces a logo without asking, since logos have no confirm", async () => {
    const user = userEvent.setup();
    render(h(ImageUpload, { schoolId: "school-1", kind: "logo", label: "School logo", hint: "A clear photo.", currentUrl: "/school-logo/old" }));

    await user.upload(fileInput(), photo());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(sentForm().get("signer")).toBeNull();
  });
});

describe("refusals", () => {
  it("refuses a file that isn't a photo before uploading", async () => {
    const user = userEvent.setup({ applyAccept: false });
    signature();
    await user.upload(fileInput(), new File(["%PDF"], "signature.pdf", { type: "application/pdf" }));

    expect(await screen.findByText("Choose a JPG, PNG or WebP image.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's refusal, such as a section without its own head (AC-4)", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "Junior Secondary has no head of its own, so the principal signs its report cards." }), { status: 400 }),
    );
    signature({ owner: { signer: "section", sectionId: "junior" } });
    await user.upload(fileInput(), photo());

    expect(await screen.findByText("Junior Secondary has no head of its own, so the principal signs its report cards.")).toBeInTheDocument();
    expect(screen.getByText("No signature yet")).toBeInTheDocument();
  });
});
