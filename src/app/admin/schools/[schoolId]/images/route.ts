import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { NotFound } from "@/server/data";
import { type ImageOwner, MAX_IMAGE_BYTES, saveImage } from "@/server/data/setup";
import { saveStudentPhoto } from "@/server/data/students";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Uploads a logo (spec 0005, AC-4), the principal's or a section head's
// signature (spec 0007, AC-8), or a student's passport photo (spec 0008, AC-7).
// The browser has already shrunk the image and re-drawn it (PNG, or JPEG for
// photos), which also strips phone photo metadata such as location.
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
  if (!(file instanceof File) || (kind !== "logo" && kind !== "signature" && kind !== "student_photo")) {
    return Response.json({ ok: false, error: "Choose an image to upload." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (kind === "student_photo") {
    const studentId = String(form.get("studentId") ?? "");
    if (!UUID.test(studentId)) return Response.json({ ok: false, error: "That student is no longer in this school. Refresh the page." }, { status: 404 });
    const result = await saveStudentPhoto(ctx, { studentId, bytes }).catch((error: unknown) => {
      if (error instanceof NotFound) return { ok: false as const, error: "That student is no longer in this school. Refresh the page." };
      throw error;
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
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
  const result = await saveImage(ctx, { ...owner, bytes }).catch((error: unknown) => {
    if (error instanceof NotFound) return { ok: false as const, error: "That section is no longer in this school. Refresh the page." };
    throw error;
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
