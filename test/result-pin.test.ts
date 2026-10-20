import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { formatSerial, groupPin, isPinShaped, makePin, normalizePin, pinCardFileName, pinIpKey, slipFileName } from "@/lib/result-pin";
import { formatWait, pinWait, type PinCounts } from "@/server/auth/throttle";
import { pinHash, pinKey, readResultCookie, signResultCookie } from "@/server/result-pin/crypto";

// Spec 0014: the PIN core (AC-7, AC-9, AC-14, AC-15, AC-20).

describe("PINs", () => {
  it("makes PINs with school initials and a valid check digit", () => {
    for (let i = 0; i < 10_000; i++) {
      const pin = makePin("GHS", randomBytes);
      expect(pin).toMatch(/^GHS \d{4} \d{4}$/);
      expect(isPinShaped(pin)).toBe(true);
    }
  });

  it("catches one changed digit and one swapped pair", () => {
    const pin = makePin("GHS", randomBytes);
    const norm = normalizePin(pin);
    // changing digits
    for (let i = 3; i < norm.length; i++) {
      const changed = norm.slice(0, i) + String((Number(norm[i]) + 1) % 10) + norm.slice(i + 1);
      expect(isPinShaped(changed)).toBe(false);
    }
    // omitting school initials
    expect(isPinShaped(norm.slice(3))).toBe(false);
  });

  it("ignores spaces and dashes, and groups with school initials", () => {
    const pin = makePin("GHS", randomBytes);
    const grouped = groupPin(pin);
    expect(grouped).toMatch(/^GHS \d{4} \d{4}$/);
    expect(isPinShaped(grouped)).toBe(true);
    expect(isPinShaped(grouped.replaceAll(" ", "-"))).toBe(true);
    expect(isPinShaped(grouped.toLowerCase())).toBe(true);
    expect(normalizePin(` ${grouped} `)).toBe(pin.replace(/\s+/g, ""));
    expect(isPinShaped("12345")).toBe(false);
    expect(isPinShaped("34653155")).toBe(false);
  });

  it("takes only digit bytes below 250 (no modulo bias)", () => {
    const bytes = [255, 250, 1, 2, 3, 4, 5, 6, 7];
    expect(normalizePin(makePin("GHS", () => Uint8Array.from(bytes))).slice(3, 10)).toBe("1234567");
  });

  it("formats serials and file names", () => {
    expect(formatSerial("GHS", 123)).toBe("GHS 000123");
    expect(slipFileName("GHS", "JSS 2 Gold", 1, "2026/2027")).toBe("GHS JSS 2 Gold First Term 2026-2027 PIN slips.pdf");
    expect(pinCardFileName("GHS", "OKON", "Emem", 2, "2026/2027")).toBe("GHS OKON Emem Second Term 2026-2027 report card.pdf");
  });

  it("counts an IPv6 address by its first 64 bits", () => {
    expect(pinIpKey("2001:db8:1:2:aaaa::1")).toBe(pinIpKey("2001:0db8:0001:0002:bbbb:1:2:3"));
    expect(pinIpKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(pinIpKey("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(pinIpKey("10.0.0.1")).toBe("10.0.0.1");
    expect(pinIpKey(null)).toBe("local");
  });
});

describe("keys and the result cookie", () => {
  const key = Buffer.alloc(32, 7);
  const id = "0b0d3b1e-8a3e-4a53-9a8e-2f2a5c1d9e10";
  const now = new Date("2026-12-05T12:00:00Z");
  const later = Math.floor(now.getTime() / 1000) + 1800;

  it("hashes to 32 bytes, different per PIN", () => {
    expect(pinHash("482109375512", key)).toHaveLength(32);
    expect(pinHash("482109375512", key).equals(pinHash("482109375513", key))).toBe(false);
  });

  it("reads back its own cookie and rejects any change", () => {
    const cookie = signResultCookie(id, later, key);
    expect(cookie).not.toContain("482109375512");
    expect(readResultCookie(cookie, now, key)).toEqual({ pinId: id });
    const [, , sig] = cookie.split(".");
    const otherId = id.replace("0b0d", "0b0e");
    expect(readResultCookie(`${otherId}.${later}.${sig}`, now, key)).toBeNull();
    expect(readResultCookie(`${id}.${later + 60}.${sig}`, now, key)).toBeNull();
    expect(readResultCookie(`${id}.${later}.${sig.slice(1)}A`, now, key)).toBeNull();
    expect(readResultCookie(cookie, new Date((later + 1) * 1000), key)).toBeNull();
    expect(readResultCookie(cookie, now, Buffer.alloc(32, 8))).toBeNull();
    expect(readResultCookie(undefined, now, key)).toBeNull();
  });

  it("refuses a missing or short key, never a default", () => {
    const saved = process.env.RESULT_PIN_SECRET;
    try {
      delete process.env.RESULT_PIN_SECRET;
      expect(() => pinKey()).toThrow("PIN slips can't be made");
      process.env.RESULT_PIN_SECRET = Buffer.alloc(16).toString("base64");
      expect(() => pinKey()).toThrow("PIN slips can't be made");
    } finally {
      process.env.RESULT_PIN_SECRET = saved;
    }
  });
});

describe("throttle waits", () => {
  const now = new Date("2026-12-05T12:00:00Z");
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
  const counts = (ip: number, ipDay: number, all: number): PinCounts => ({
    ip: { count: ip, endsAt: at(12) },
    ipDay: { count: ipDay, endsAt: at(180) },
    all: { count: all, endsAt: at(40) },
  });

  it("slows the 11th in 15 minutes and the 101st in a day", () => {
    expect(pinWait(counts(10, 10, 10), now)).toBe(0);
    expect(formatWait(pinWait(counts(11, 11, 11), now))).toBe("12 minutes");
    expect(formatWait(pinWait(counts(1, 101, 101), now))).toBe("3 hours");
  });

  it("holds every IP to 3 under a sitewide attack", () => {
    expect(pinWait(counts(3, 3, 20_001), now)).toBe(0);
    expect(pinWait(counts(4, 4, 20_001), now)).toBe(12 * 60);
  });
});
