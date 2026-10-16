import "server-only";

import { cookies } from "next/headers";

import { db } from "@/db";

import { activeSchoolsFor } from "./service";

export const LAST_SCHOOL_COOKIE = "voxlms_school";

/** Where to send someone after signing in (AC-7). */
export async function destinationFor(userId: string, isTeam: boolean): Promise<string> {
  if (isTeam) return "/admin";
  const schools = await activeSchoolsFor(db, userId);
  if (schools.length === 1) return `/${schools[0].slug}`;
  if (schools.length === 0) return "/choose-school";
  const last = (await cookies()).get(LAST_SCHOOL_COOKIE)?.value;
  const remembered = schools.find((s) => s.slug === last);
  return remembered ? `/${remembered.slug}` : "/choose-school";
}
