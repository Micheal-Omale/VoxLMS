"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { db } from "@/db";
import { school, staff, user } from "@/db/schema";
import { logAuthEvent } from "@/server/auth/audit";
import { auth } from "@/server/auth/auth";
import { requestMeta } from "@/server/auth/request-meta";
import {
  changePhone,
  createLoginForStaff,
  makeSetupLink,
  setLoginEnabled,
  signOutEverywhere,
} from "@/server/auth/service";
import { isFresh, markPasswordConfirmed, requireTeam } from "@/server/auth/viewer";

// Our team's login tools (spec 0004, AC-9, AC-13). Every action checks the
// caller is on our team; sensitive ones need the password typed in the last
// 15 minutes, and answer { needPassword: true } until it is.

export type AdminResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; needPassword: true }
  | { ok: false; error: string; confirm?: { name: string; schools: string[] } };

const deps = () => ({ auth, db });

async function freshTeam() {
  const viewer = await requireTeam();
  return { viewer, fresh: isFresh(viewer) };
}

/** Re-enter the team member's own password; unlocks sensitive actions for 15 minutes. */
export async function confirmPasswordAction(password: string): Promise<AdminResult> {
  const viewer = await requireTeam();
  try {
    await auth.api.verifyPassword({ body: { password }, headers: await headers() });
  } catch {
    return { ok: false, error: "That password is not right." };
  }
  await markPasswordConfirmed(viewer);
  return { ok: true };
}

export async function createLoginAction(schoolId: string, staffId: string, confirmSamePerson: boolean): Promise<AdminResult<{ userId: string }>> {
  const viewer = await requireTeam();
  const result = await createLoginForStaff(deps(), {
    schoolId,
    staffId,
    confirmSamePerson,
    actorUserId: viewer.userId,
    meta: await requestMeta(),
  });
  if (result.ok) return { ok: true, userId: result.userId };
  if (result.reason === "confirm") {
    return { ok: false, error: "This phone number already has a login.", confirm: result.existing };
  }
  return {
    ok: false,
    error: result.reason === "already" ? "This person already has a login." : "This staff member's phone number isn't a Nigerian mobile number.",
  };
}

export type SetupLinkView = { url: string; whatsappUrl: string; qrSvg: string; expiresAt: string; kind: "first" | "reset" };

export async function makeSetupLinkAction(userId: string, kind: "first" | "reset"): Promise<AdminResult<{ link: SetupLinkView }>> {
  const { viewer, fresh } = await freshTeam();
  if (!fresh) return { ok: false, needPassword: true };
  const link = await makeSetupLink(deps(), { userId, kind, actorUserId: viewer.userId, meta: await requestMeta() });
  const qrSvg = await QRCode.toString(link.url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#16224a", light: "#ffffff" } });
  return { ok: true, link: { url: link.url, whatsappUrl: link.whatsappUrl, qrSvg, expiresAt: link.expiresAt.toISOString(), kind } };
}

export async function changePhoneAction(userId: string, newPhone: string): Promise<AdminResult> {
  const { viewer, fresh } = await freshTeam();
  if (!fresh) return { ok: false, needPassword: true };
  const result = await changePhone(deps(), { userId, newPhone, actorUserId: viewer.userId, meta: await requestMeta() });
  if (result.ok) return { ok: true };
  if (result.reason === "staff") return { ok: false, error: `${result.staffName} at ${result.schoolName} already uses that number. Nothing was changed.` };
  return { ok: false, error: result.reason === "taken" ? "Another login already uses that number." : "That isn't a Nigerian mobile number." };
}

export async function signOutEverywhereAction(userId: string): Promise<AdminResult> {
  const viewer = await requireTeam();
  await signOutEverywhere(deps(), { userId, actorUserId: viewer.userId, meta: await requestMeta() });
  return { ok: true };
}

export async function setLoginEnabledAction(userId: string, enabled: boolean): Promise<AdminResult> {
  const { viewer, fresh } = await freshTeam();
  if (!fresh) return { ok: false, needPassword: true };
  if (userId === viewer.userId) return { ok: false, error: "You can't switch off your own login." };
  await setLoginEnabled(deps(), { userId, enabled, actorUserId: viewer.userId, meta: await requestMeta() });
  return { ok: true };
}

/** Opens a school as a teacher, read only, for at most one hour. */
export async function startViewAsAction(userId: string, schoolId: string): Promise<AdminResult> {
  const { viewer, fresh } = await freshTeam();
  if (!fresh) return { ok: false, needPassword: true };
  const [target] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  if (!target) return { ok: false, error: "That login no longer exists." };
  if (target.role === "admin") return { ok: false, error: "You can't view as another VoxLMS team member." };
  const [place] = await db
    .select({ slug: school.slug })
    .from(staff)
    .innerJoin(school, eq(school.id, staff.schoolId))
    .where(and(eq(staff.userId, userId), eq(staff.schoolId, schoolId), eq(staff.status, "active")));
  if (!place) return { ok: false, error: "This person isn't active staff at this school." };

  await auth.api.impersonateUser({ body: { userId }, headers: await headers() });
  const endsAt = new Date(Date.now() + 3600 * 1000);
  await logAuthEvent(db, {
    kind: "view_as_started",
    userId,
    actorUserId: viewer.userId,
    schoolId,
    meta: await requestMeta(),
    detail: { endsAt: endsAt.toISOString() },
  });
  redirect(`/${place.slug}`);
}
