import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { readImageForTeam } from "@/server/data/setup";

// Our team's private preview of a school's images, signatures included. Never cached.
export async function GET(_request: Request, { params }: { params: Promise<{ schoolId: string; assetId: string }> }) {
  const { schoolId, assetId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  if (!/^[0-9a-f-]{36}$/.test(assetId)) return new Response("Not found", { status: 404 });
  const image = await readImageForTeam(ctx, assetId);
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: { "Content-Type": image.mimeType, "Cache-Control": "private, no-store" },
  });
}
