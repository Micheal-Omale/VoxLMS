"use server";

import { headers } from "next/headers";

import { db } from "@/db";
import { logAuthEvent } from "@/server/auth/audit";
import { auth } from "@/server/auth/auth";
import { passwordProblem } from "@/server/auth/password-rules";
import { requestMeta } from "@/server/auth/request-meta";
import { requireViewer } from "@/server/auth/viewer";

export type ChangePasswordState =
  | { ok: true }
  | { ok: false; field: "current" | "password" | "repeat"; error: string }
  | null;

/** Changes the signed in person's password and signs out every other device (AC-10). */
export async function changePasswordAction(_previous: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const viewer = await requireViewer();
  if (viewer.viewingAsBy) return { ok: false, field: "current", error: "You are viewing as this person. Nothing can be changed." };

  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");
  if (password !== repeat) return { ok: false, field: "repeat", error: "The two new passwords don't match." };
  const problem = passwordProblem(password, { phoneDigits: viewer.phone, isTeam: viewer.isTeam });
  if (problem) return { ok: false, field: "password", error: problem };

  try {
    await auth.api.changePassword({
      body: { currentPassword: current, newPassword: password, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch {
    return { ok: false, field: "current", error: "Your current password is not right." };
  }
  await logAuthEvent(db, { kind: "password_changed", userId: viewer.userId, meta: await requestMeta() });
  return { ok: true };
}
