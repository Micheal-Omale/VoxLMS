import { eq } from "drizzle-orm";

import { createAuth } from "@/server/auth/config";
import { createLoginForStaff, makeSetupLink } from "@/server/auth/service";

import { staff } from "../schema";
import type { SeedDb } from "./client";

/** Gives the demo school's teachers logins and prints fresh setup links (development branches only). */
export async function printDemoSetupLinks(db: SeedDb, schoolId: string) {
  const deps = { auth: createAuth(db, { withNextCookies: false }), db };
  const teachers = await db.select().from(staff).where(eq(staff.schoolId, schoolId));
  for (const teacher of teachers) {
    let userId = teacher.userId;
    if (!userId) {
      const created = await createLoginForStaff(deps, { schoolId, staffId: teacher.id, confirmSamePerson: true, actorUserId: null });
      if (!created.ok) {
        console.log(`  ${teacher.fullName}: no login (${created.reason})`);
        continue;
      }
      userId = created.userId;
    }
    const link = await makeSetupLink(deps, { userId, kind: "first", actorUserId: null });
    console.log(`  ${teacher.title ?? ""} ${teacher.fullName} (${teacher.phone}): ${link.url}`);
  }
}
