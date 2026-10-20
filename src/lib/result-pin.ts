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
 * 7 random digits, then the Luhn digit (8 digits total).
 * Preceded by the school's initials (code), e.g. "GHS 3465 3155".
 */
export function makePin(schoolCode: string, randomBytes: (size: number) => Uint8Array) {
  let digits = "";
  while (digits.length < 7) {
    for (const byte of randomBytes(16)) {
      if (byte < 250 && digits.length < 7) digits += String(byte % 10);
    }
  }
  const full = digits + luhnDigit(digits);
  return `${schoolCode.toUpperCase()} ${full.slice(0, 4)} ${full.slice(4, 8)}`;
}

/** What the parent typed, uppercased and without spaces and dashes. */
export const normalizePin = (text: string) => text.trim().toUpperCase().replace(/[\s\-‐-―]/g, "");

/** School initials (2 to 6 letters) + 8 digits whose last is the Luhn digit of the first 7 (AC-12, step 1). */
export function isPinShaped(text: string) {
  const pin = normalizePin(text);
  const match = /^([A-Z]{2,6})(\d{8})$/.exec(pin);
  if (!match) return false;
  const digits = match[2];
  return luhnDigit(digits.slice(0, 7)) === digits[7];
}

/** "GHS 3465 3155" */
export function groupPin(pin: string) {
  const norm = normalizePin(pin);
  const match = /^([A-Z]{2,6})(\d{4})(\d{4})$/.exec(norm);
  if (match) return `${match[1]} ${match[2]} ${match[3]}`;
  return norm.replace(/(\d{4})(?=\d)/g, "$1 ");
}

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
  /** "GHS 3465 3155" */
  pin: string;
  /** "Serial GHS 000123" (optional) */
  serial?: string;
  /** "Check the result at voxlms.com/result" */
  checkAt: string;
};

export const SLIP_WARNING = "Keep this slip safe. Anyone with this PIN can see this result.";
export const SLIPS_PER_PAGE = 10;
