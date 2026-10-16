import "server-only";

import { and, asc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";

import { db } from "@/db";
import { account, authEvent, school, staff, user } from "@/db/schema";

// Read models for our team's admin pages (spec 0004). Callers must have
// passed requireTeam() first.

export async function listSchoolsForTeam() {
  return db
    .select({
      id: school.id,
      slug: school.slug,
      name: school.name,
      code: school.code,
      staff: sql<number>`count(${staff.id})::int`,
      logins: sql<number>`count(${staff.userId})::int`,
    })
    .from(school)
    .leftJoin(staff, and(eq(staff.schoolId, school.id), eq(staff.status, "active")))
    .groupBy(school.id)
    .orderBy(asc(school.name));
}

export type LoginStatus = "none" | "waiting" | "active" | "off";

export async function listStaffWithLogins(schoolId: string) {
  const [found] = await db.select().from(school).where(eq(school.id, schoolId));
  if (!found) return null;
  const members = await db
    .select({
      staffId: staff.id,
      title: staff.title,
      fullName: staff.fullName,
      phone: staff.phone,
      role: staff.role,
      status: staff.status,
      userId: staff.userId,
      banned: user.banned,
      isTeam: sql<boolean>`${user.role} = 'admin'`,
    })
    .from(staff)
    .leftJoin(user, eq(user.id, staff.userId))
    .where(eq(staff.schoolId, schoolId))
    .orderBy(asc(staff.fullName));

  const userIds = members.map((m) => m.userId).filter((id): id is string => id !== null);
  const [withPassword, lastSignIns] = userIds.length
    ? await Promise.all([
        db
          .select({ userId: account.userId })
          .from(account)
          .where(and(inArray(account.userId, userIds), eq(account.providerId, "credential"), isNotNull(account.password))),
        db
          .select({ userId: authEvent.userId, at: max(authEvent.createdAt) })
          .from(authEvent)
          .where(and(inArray(authEvent.userId, userIds), eq(authEvent.kind, "sign_in")))
          .groupBy(authEvent.userId),
      ])
    : [[], []];

  const hasPassword = new Set(withPassword.map((r) => r.userId));
  return {
    school: found,
    staff: members.map((m) => {
      const loginStatus: LoginStatus = !m.userId ? "none" : m.banned ? "off" : hasPassword.has(m.userId) ? "active" : "waiting";
      return {
        ...m,
        loginStatus,
        lastSignInAt: lastSignIns.find((r) => r.userId === m.userId)?.at ?? null,
      };
    }),
  };
}
