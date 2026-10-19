import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { PinKeyMissing } from "@/server/data/errors";

// The one secret behind result PINs (spec 0014, AC-7, AC-14, AC-20). The PIN
// hash and the cookie signature use it under different labels, so one key
// backs up both uses and neither can stand in for the other.

/** The key from RESULT_PIN_SECRET (base64, 32 bytes or more). */
export function pinKey(): Buffer {
  const raw = process.env.RESULT_PIN_SECRET;
  const key = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (key.length < 32) {
    console.error("RESULT_PIN_SECRET is missing or shorter than 32 bytes");
    throw new PinKeyMissing();
  }
  return key;
}

/** HMAC SHA256 of "pin:" + the 12 digits: what the database keeps instead of the PIN. */
export const pinHash = (digits: string, key = pinKey()) => createHmac("sha256", key).update(`pin:${digits}`).digest();

const signature = (key: Buffer, pinId: string, expiresAt: number) =>
  createHmac("sha256", key).update(`cookie:${pinId}.${expiresAt}`).digest();

/** `{pinId}.{expiresAtSeconds}.{signature}`: a signed slip id, never the PIN. */
export function signResultCookie(pinId: string, expiresAtSeconds: number, key = pinKey()) {
  return `${pinId}.${expiresAtSeconds}.${signature(key, pinId, expiresAtSeconds).toString("base64url")}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The slip id when the signature holds (checked in constant time) and the cookie has not expired; else null. */
export function readResultCookie(value: string | undefined, now = new Date(), key = pinKey()): { pinId: string } | null {
  const parts = value?.split(".");
  if (!parts || parts.length !== 3) return null;
  const [pinId, expires, sig] = parts;
  if (!UUID.test(pinId) || !/^\d{1,12}$/.test(expires)) return null;
  const expiresAt = Number(expires);
  const given = Buffer.from(sig, "base64url");
  const expected = signature(key, pinId, expiresAt);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (expiresAt * 1000 <= now.getTime()) return null;
  return { pinId };
}
