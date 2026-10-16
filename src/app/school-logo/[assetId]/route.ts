import { db } from "@/db";
import { readLogo } from "@/server/data/setup";

// A school's logo, public and cached for a year: a new upload gets a new id.
// Signatures are never served here (spec 0005, AC-4).
export async function GET(_request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const id = assetId.replace(/\.png$/, "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const logo = await readLogo(db, id);
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
