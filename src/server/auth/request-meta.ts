import "server-only";

import { headers } from "next/headers";

import type { RequestMeta } from "./audit";

/** The device's IP (Vercel sets x-real-ip) and browser. Missing IP throttles as "unknown". */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return { ip, userAgent: h.get("user-agent") };
}
