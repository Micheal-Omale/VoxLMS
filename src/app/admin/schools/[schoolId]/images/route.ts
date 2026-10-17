import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { NotFound } from "@/server/data";
import { type ImageOwner, MAX_IMAGE_BYTES, saveImage } from "@/server/data/setup";

// Uploads a logo (spec 0005, AC-4), or the principal's or a section head's
// signature (spec 0007, AC-8). The browser has already shrunk the image and
// re-drawn it as a PNG, which also strips phone photo metadata such as location.
export async function POST(request: Request, { params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES + 64 * 1024) {
    return Response.json({ ok: false, error: "That image is too large. Use one under 300 KB." }, { status: 413 });
  }
  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File) || (kind !== "logo" && kind !== "signature")) {
    return Response.json({ ok: false, error: "Choose an image to upload." }, { status: 400 });
  }
  const signer = form.get("signer");
  if (kind === "signature" && signer !== "principal" && signer !== "section") {
    return Response.json({ ok: false, error: "Choose whose signature this is." }, { status: 400 });
  }
  const owner: ImageOwner =
    kind === "logo"
      ? { kind }
      : signer === "principal"
        ? { kind, signer }
        : { kind, signer: "section", sectionId: String(form.get("sectionId") ?? "") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await saveImage(ctx, { ...owner, bytes }).catch((error: unknown) => {
    if (error instanceof NotFound) return { ok: false as const, error: "That section is no longer in this school. Refresh the page." };
    throw error;
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
