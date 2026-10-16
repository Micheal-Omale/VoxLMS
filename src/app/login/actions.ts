"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { auth } from "@/server/auth/auth";
import { destinationFor } from "@/server/auth/destination";
import { requestMeta } from "@/server/auth/request-meta";
import { signInWithPhone } from "@/server/auth/service";
import { formatWait } from "@/server/auth/throttle";

export type SignInState = { error: string; phone: string } | null;

export async function signInAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const phone = String(formData.get("phone") ?? "").slice(0, 40);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const sharedDevice = formData.get("shared") === "on";

  const result = await signInWithPhone(
    { auth, db },
    { phone, password, sharedDevice, meta: await requestMeta(), headers: await headers() },
  );
  if (!result.ok) {
    const error =
      result.reason === "throttled"
        ? `Too many tries. Wait ${formatWait(result.waitSeconds)}, then try again.`
        : "That phone number or password is not right. Check both and try again.";
    return { error, phone };
  }
  redirect(await destinationFor(result.userId, result.isTeam));
}
