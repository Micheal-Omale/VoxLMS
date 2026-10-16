"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";

import { logAuthEvent } from "./audit";
import { auth } from "./auth";
import { LAST_SCHOOL_COOKIE } from "./destination";
import { requestMeta } from "./request-meta";
import { getViewer, requireViewer } from "./viewer";

export async function signOutAction() {
  const viewer = await getViewer();
  if (viewer?.viewingAsBy) return stopViewAsAction();
  await auth.api.signOut({ headers: await headers() });
  if (viewer) await logAuthEvent(db, { kind: "sign_out", userId: viewer.userId, meta: await requestMeta() });
  redirect("/login");
}

/** Ends "view as" and returns our team member to the admin area. */
export async function stopViewAsAction() {
  const viewer = await getViewer();
  if (!viewer?.viewingAsBy) redirect("/login");
  await auth.api.stopImpersonating({ headers: await headers() });
  await logAuthEvent(db, { kind: "view_as_ended", userId: viewer.userId, actorUserId: viewer.viewingAsBy, meta: await requestMeta() });
  redirect("/admin");
}

/** Remembers the school a teacher picked, then opens it. Only their own schools are accepted. */
export async function chooseSchoolAction(slug: string) {
  const viewer = await requireViewer();
  const chosen = viewer.schools.find((s) => s.slug === slug);
  if (!chosen) redirect("/choose-school");
  (await cookies()).set(LAST_SCHOOL_COOKIE, chosen.slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 3600,
    path: "/",
  });
  redirect(`/${chosen.slug}`);
}
