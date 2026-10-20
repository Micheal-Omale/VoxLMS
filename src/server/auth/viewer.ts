import "server-only";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { school, session as sessionTable } from "@/db/schema";
import { type SchoolContext, schoolContext } from "@/server/data";

import { auth } from "./auth";
import { createAuth, SHARED_DEVICE_HOURS, TEAM_SESSION_HOURS } from "./config";
import { activeSchoolsFor } from "./service";

// Who is signed in (spec 0004). Cached for one request with React's cache,
// never with 'use cache', so it can't leak between people.

export type Viewer = {
  userId: string;
  name: string;
  phone: string | null;
  isTeam: boolean;
  /** Set while our team is viewing as this person: the team member's user id. */
  viewingAsBy: string | null;
  sessionId: string;
  passwordConfirmedAt: Date | null;
  schools: Awaited<ReturnType<typeof activeSchoolsFor>>;
};

const hoursAgo = (hours: number) => Date.now() - hours * 3600 * 1000;

export const getViewer = cache(async (): Promise<Viewer | null> => viewerFrom(await auth.api.getSession({ headers: await headers() })));

// Never writes cookies: no next-cookies plugin, and no session refresh.
const quietAuth = createAuth(db, { withNextCookies: false });

/**
 * The same, for Server Actions that must answer with a result instead of
 * redirecting. Inside a Server Action any cookie write (Better Auth clearing
 * a dead session's cookie) makes Next re-render the page, whose sign in check
 * then redirects before the action's own answer arrives (spec 0009, AC-5).
 */
export async function getActionViewer(): Promise<Viewer | null> {
  return viewerFrom(await quietAuth.api.getSession({ headers: await headers(), query: { disableRefresh: true } }));
}

async function viewerFrom(found: Awaited<ReturnType<typeof auth.api.getSession>>): Promise<Viewer | null> {
  if (!found) return null;
  const { session, user } = found;

  const [row] = await db
    .select({ sharedDevice: sessionTable.sharedDevice, passwordConfirmedAt: sessionTable.passwordConfirmedAt })
    .from(sessionTable)
    .where(eq(sessionTable.id, session.id));
  const isTeam = user.role === "admin" && !session.impersonatedBy;
  const created = new Date(session.createdAt).getTime();
  // Hard limits, whatever the browser does with its cookies (AC-5).
  const tooOld =
    (row?.sharedDevice && created < hoursAgo(SHARED_DEVICE_HOURS)) ||
    (isTeam && created < hoursAgo(TEAM_SESSION_HOURS));
  if (!row || tooOld) {
    await db.delete(sessionTable).where(eq(sessionTable.id, session.id));
    return null;
  }

  return {
    userId: user.id,
    name: user.name,
    phone: (user as { username?: string | null }).username ?? null,
    isTeam,
    viewingAsBy: session.impersonatedBy ?? null,
    sessionId: session.id,
    passwordConfirmedAt: row.passwordConfirmedAt,
    schools: await activeSchoolsFor(db, user.id),
  };
}

/** Pages for signed in people only. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/**
 * The school named in the address, for someone allowed in it (AC-7, AC-8).
 * Anyone else gets "not found". Teachers act only on their own classes;
 * while our team is viewing as someone, nothing can be saved.
 */
export async function requireSchoolContext(slug: string): Promise<{ ctx: SchoolContext; viewer: Viewer; school: typeof school.$inferSelect }> {
  const viewer = await requireViewer();
  const resolved = await schoolContextFor(viewer, slug);
  if (!resolved) notFound();
  return { viewer, ...resolved };
}

/**
 * The same check without redirecting, for Server Actions that must answer
 * with a result the screen can act on. Null means not found.
 */
export async function schoolContextFor(viewer: Viewer, slug: string): Promise<{ ctx: SchoolContext; school: typeof school.$inferSelect } | null> {
  const [found] = await db.select().from(school).where(eq(school.slug, slug));
  if (!found) return null;

  if (viewer.isTeam) {
    return { school: found, ctx: schoolContext({ schoolId: found.id, userId: viewer.userId, actor: { kind: "admin", readOnly: false } }) };
  }
  const membership = viewer.schools.find((s) => s.schoolId === found.id);
  if (!membership) return null;
  const isPrincipal = membership.role === "principal";
  return {
    school: found,
    ctx: schoolContext({
      schoolId: found.id,
      userId: viewer.userId,
      actor: isPrincipal
        ? { kind: "principal", staffId: membership.staffId, readOnly: viewer.viewingAsBy !== null }
        : { kind: "teacher", staffId: membership.staffId, readOnly: viewer.viewingAsBy !== null },
    }),
  };
}

export async function requireTeam(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!viewer.isTeam) notFound();
  return viewer;
}

const FRESH_MINUTES = 15;

/** True if the team member typed their password in the last 15 minutes (AC-9). */
export function isFresh(viewer: Viewer) {
  return viewer.passwordConfirmedAt !== null && viewer.passwordConfirmedAt.getTime() > Date.now() - FRESH_MINUTES * 60 * 1000;
}

export async function markPasswordConfirmed(viewer: Viewer) {
  await db
    .update(sessionTable)
    .set({ passwordConfirmedAt: new Date() })
    .where(and(eq(sessionTable.id, viewer.sessionId), eq(sessionTable.userId, viewer.userId)));
}

/** Our team working on one school, addressed by its id in the team area (spec 0005). */
export async function requireTeamSchoolContext(schoolId: string): Promise<{ ctx: SchoolContext; viewer: Viewer }> {
  const viewer = await requireTeam();
  if (!/^[0-9a-f-]{36}$/.test(schoolId)) notFound();
  const [found] = await db.select({ id: school.id }).from(school).where(eq(school.id, schoolId));
  if (!found) notFound();
  return { viewer, ctx: schoolContext({ schoolId: found.id, userId: viewer.userId, actor: { kind: "admin", readOnly: false } }) };
}
