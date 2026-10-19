"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { checkPin, pinMessage } from "@/server/data/pin-results";
import { signResultCookie } from "@/server/result-pin/crypto";

import { RESULT_COOKIE, RESULT_MINUTES } from "./cookie";

// The PIN form's actions (spec 0014, AC-12 to AC-14). The PIN never comes
// back to the page, never goes in a URL or cookie, and is never logged.

/** `keep` refills the field only after a typo (AC-12, step 1); `n` remounts it so it empties otherwise. */
export type PinFormState = { message: string; keep: string; n: number } | null;

export async function checkPinAction(previous: PinFormState, formData: FormData): Promise<PinFormState> {
  const typed = String(formData.get("pin") ?? "").slice(0, 40);
  const n = (previous?.n ?? 0) + 1;
  const result = await checkPin(typed, (await headers()).get("x-real-ip"));
  if (!result.ok) return { message: pinMessage(result), keep: result.reason === "shape" ? typed : "", n };

  const expires = Math.floor(Date.now() / 1000) + RESULT_MINUTES * 60;
  (await cookies()).set(RESULT_COOKIE, signResultCookie(result.pinId, expires), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/result",
    expires: new Date(expires * 1000),
  });
  // A refresh never posts the PIN again.
  redirect("/result");
}

/** "Check another PIN": forget the result and show the empty form. */
export async function clearResultAction() {
  (await cookies()).delete({ name: RESULT_COOKIE, path: "/result" });
  redirect("/result");
}
