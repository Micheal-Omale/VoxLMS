import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { MAX_IMAGE_BYTES, saveImage } from "@/server/data/setup";

// Uploads a logo or a section head's signature (spec 0005, AC-4). The browser
// has already shrunk the image and re-drawn it as a PNG, which also strips
// phone photo metadata such as location.
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
  const sectionId = kind === "signature" ? String(form.get("sectionId") ?? "") : null;
  const result = await saveImage(ctx, { kind, sectionId, bytes: new Uint8Array(await file.arrayBuffer()) });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
