"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { auth } from "@/server/auth/auth";
import { destinationFor } from "@/server/auth/destination";
import { requestMeta } from "@/server/auth/request-meta";
import { setPasswordWithLink, signInWithPhone } from "@/server/auth/service";

export type SetupState = { error: string; field: "password" | "repeat" | "link" } | null;

export async function setPasswordAction(token: string, _previous: SetupState, formData: FormData): Promise<SetupState> {
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");
  if (password !== repeat) return { error: "The two passwords don't match. Type the same password twice.", field: "repeat" };

  const meta = await requestMeta();
  const set = await setPasswordWithLink({ auth, db }, { token, password, meta });
  if (!set.ok) return { error: set.message, field: set.reason === "rule" ? "password" : "link" };

  // Signed in straight away with the password they just chose.
  const signedIn = await signInWithPhone(
    { auth, db },
    { phone: `+${set.username}`, password, sharedDevice: false, meta, headers: await headers() },
  );
  redirect(signedIn.ok ? await destinationFor(signedIn.userId, signedIn.isTeam) : "/login");
}
