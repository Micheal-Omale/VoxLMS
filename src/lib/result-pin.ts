import { termName } from "./term-label";

// Result PIN pieces with no secrets (spec 0014, AC-7, AC-9). The keyed hash
// and the cookie signature live in src/server/result-pin/crypto.ts.

/** The Luhn check digit for a run of digits (the one bank cards use). */
export function luhnDigit(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    // Doubled from the rightmost digit, since the check digit goes after it.
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * 11 random digits, then the Luhn digit. Each digit comes from one byte
 * below 250, so every digit is equally likely (no modulo bias).
 */
export function makePin(randomBytes: (size: number) => Uint8Array) {
  let digits = "";
  while (digits.length < 11) {
    for (const byte of randomBytes(16)) {
      if (byte < 250 && digits.length < 11) digits += String(byte % 10);
    }
  }
  return digits + luhnDigit(digits);
}

/** What the parent typed, without spaces and dashes. */
export const normalizePin = (text: string) => text.replace(/[\s\-‐-―]/g, "");

/** 12 digits whose last is the Luhn digit of the first 11 (AC-12, step 1). */
export function isPinShaped(text: string) {
  const pin = normalizePin(text);
  return /^\d{12}$/.test(pin) && luhnDigit(pin.slice(0, 11)) === pin[11];
}

/** "4821 0937 5512" */
export const groupPin = (pin: string) => pin.replace(/(\d{4})(?=\d)/g, "$1 ");

/** "GHS 000123" (AC-9). */
export const formatSerial = (code: string, serial: number) => `${code} ${String(serial).padStart(6, "0")}`;

const session = (name: string) => name.replaceAll("/", "-");

/** "GHS JSS 2 Gold First Term 2026-2027 PIN slips.pdf" (AC-6). */
export function slipFileName(schoolCode: string, className: string, termNumber: number, sessionName: string) {
  return `${schoolCode} ${className} ${termName(termNumber)} ${session(sessionName)} PIN slips.pdf`;
}

/** "GHS OKON Emem First Term 2026-2027 report card.pdf" (AC-17). */
export function pinCardFileName(schoolCode: string, surname: string, otherNames: string, termNumber: number, sessionName: string) {
  return `${schoolCode} ${surname} ${otherNames} ${termName(termNumber)} ${session(sessionName)} report card.pdf`.replace(/\s+/g, " ");
}

/**
 * The throttle key for an address (AC-15): an IPv6 address counts by its
 * first 64 bits (one home or phone network); none at all is `local`.
 */
export function pinIpKey(raw: string | null) {
  const ip = raw?.trim();
  if (!ip) return "local";
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail] = ip.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = tail === undefined ? front : [...front, ...Array(8 - front.length - back.length).fill("0"), ...back];
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g || "0", 16).toString(16))
    .join(":")}::/64`;
}

/** One printed slip, in the order AC-8 lays it out. Only the slip PDF ever holds `pin`. */
export type PinSlip = {
  school: string;
  /** "Result PIN · First Term, 2026/2027" */
  heading: string;
  /** "OKON Emem · JSS 2 Gold" */
  student: string;
  /** "4821 0937 5512" */
  pin: string;
  /** "Serial GHS 000123" */
  serial: string;
  /** "Check the result at voxlms.com/result" */
  checkAt: string;
};

export const SLIP_WARNING = "Keep this slip safe. Anyone with this PIN can see this result.";
export const SLIPS_PER_PAGE = 10;
