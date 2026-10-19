import { inArray, sql } from "drizzle-orm";

import { signInThrottle } from "@/db/schema";
import type { Executor } from "@/server/data/context";

// Wrong password throttle (spec 0004, AC-6). Slows guessing, never locks.

type Rule = { key: string; max: number; windowSeconds: number };

export function signInRules(phoneDigits: string, ip: string, adminUserId?: string): Rule[] {
  const rules: Rule[] = [
    { key: `phone_ip:${phoneDigits}:${ip}`, max: 5, windowSeconds: 15 * 60 },
    { key: `phone:${phoneDigits}`, max: 30, windowSeconds: 60 * 60 },
    { key: `ip:${ip}`, max: 50, windowSeconds: 60 * 60 },
  ];
  if (adminUserId) rules.push({ key: `admin:${adminUserId}`, max: 10, windowSeconds: 24 * 60 * 60 });
  return rules;
}

/** Seconds to wait before another try is allowed, or 0. */
export async function secondsToWait(db: Executor, rules: Rule[], now = new Date()): Promise<number> {
  const rows = await db
    .select()
    .from(signInThrottle)
    .where(inArray(signInThrottle.key, rules.map((r) => r.key)));
  let wait = 0;
  for (const rule of rules) {
    const row = rows.find((r) => r.key === rule.key);
    if (!row || row.failures < rule.max) continue;
    const endsAt = row.windowStartedAt.getTime() + rule.windowSeconds * 1000;
    wait = Math.max(wait, Math.ceil((endsAt - now.getTime()) / 1000));
  }
  return Math.max(wait, 0);
}

/** Counts one wrong try against every rule, atomically (no read then write race). */
export async function recordFailure(db: Executor, rules: Rule[]) {
  for (const rule of rules) {
    await db
      .insert(signInThrottle)
      .values({ key: rule.key, failures: 1, windowStartedAt: new Date() })
      .onConflictDoUpdate({
        target: signInThrottle.key,
        set: {
          failures: sql`case when ${signInThrottle.windowStartedAt} < now() - make_interval(secs => ${rule.windowSeconds}) then 1 else ${signInThrottle.failures} + 1 end`,
          windowStartedAt: sql`case when ${signInThrottle.windowStartedAt} < now() - make_interval(secs => ${rule.windowSeconds}) then now() else ${signInThrottle.windowStartedAt} end`,
        },
      });
  }
}

/** After a right password, forget this device's wrong tries for this phone. */
export async function clearDeviceFailures(db: Executor, phoneDigits: string, ip: string) {
  await db.delete(signInThrottle).where(inArray(signInThrottle.key, [`phone_ip:${phoneDigits}:${ip}`]));
}

/** "a minute", "12 minutes", then hours past 60 minutes: "3 hours". */
export function formatWait(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes > 60) {
    const hours = Math.ceil(minutes / 60);
    return hours === 1 ? "an hour" : `${hours} hours`;
  }
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}

// Result PIN guesses (spec 0014, AC-15): per network, per day and sitewide.
// Counted before any lookup, all three keys in one statement, so parallel
// guesses can't all slip under the limit.

export const PIN_LIMITS = { ip: 10, ipDay: 100, all: 20_000, ipUnderAttack: 3 };
const PIN_WINDOWS = { ip: 15 * 60, ipDay: 24 * 60 * 60, all: 60 * 60 };

const pinKeys = (ip: string) => ({ ip: `pin_ip:${ip}`, ipDay: `pin_ip_day:${ip}`, all: "pin_all" });

/** Each pin_ key's window in seconds, from its prefix. */
const windowOf = sql.raw(`(case when "sign_in_throttle"."key" like 'pin_ip_day:%' then ${PIN_WINDOWS.ipDay} when "sign_in_throttle"."key" = 'pin_all' then ${PIN_WINDOWS.all} else ${PIN_WINDOWS.ip} end)`);

export type PinCount = { count: number; endsAt: Date };
export type PinCounts = { ip: PinCount; ipDay: PinCount; all: PinCount };

/** Adds 1 to the IP, IP day and sitewide counts and returns the new counts. Also clears up to 50 long ended pin_ rows. */
export async function countPinAttempt(db: Executor, ip: string): Promise<PinCounts> {
  const keys = pinKeys(ip);
  const expired = sql`${signInThrottle.windowStartedAt} < now() - make_interval(secs => ${windowOf})`;
  const rows = await db
    .insert(signInThrottle)
    .values(Object.values(keys).map((key) => ({ key, failures: 1, windowStartedAt: sql`now()` })))
    .onConflictDoUpdate({
      target: signInThrottle.key,
      set: {
        failures: sql`case when ${expired} then 1 else ${signInThrottle.failures} + 1 end`,
        windowStartedAt: sql`case when ${expired} then now() else ${signInThrottle.windowStartedAt} end`,
      },
    })
    .returning({ key: signInThrottle.key, failures: signInThrottle.failures, windowStartedAt: signInThrottle.windowStartedAt });
  await db.execute(sql`delete from ${signInThrottle} where ${signInThrottle.key} in (
    select ${signInThrottle.key} from ${signInThrottle}
    where left(${signInThrottle.key}, 4) = 'pin_' and ${signInThrottle.windowStartedAt} + make_interval(secs => ${windowOf}) < now() - interval '1 day'
    limit 50)`);
  const read = (name: keyof typeof keys, seconds: number): PinCount => {
    const row = rows.find((r) => r.key === keys[name]);
    if (!row) throw new Error(`pin throttle row ${name} missing`);
    return { count: row.failures, endsAt: new Date(row.windowStartedAt.getTime() + seconds * 1000) };
  };
  return { ip: read("ip", PIN_WINDOWS.ip), ipDay: read("ipDay", PIN_WINDOWS.ipDay), all: read("all", PIN_WINDOWS.all) };
}

/** Seconds this IP must wait after the attempt just counted, or 0 (AC-15). */
export function pinWait(counts: PinCounts, now = new Date()): number {
  const until = (d: Date) => Math.max(1, Math.ceil((d.getTime() - now.getTime()) / 1000));
  let wait = 0;
  if (counts.ip.count > PIN_LIMITS.ip) wait = Math.max(wait, until(counts.ip.endsAt));
  if (counts.ipDay.count > PIN_LIMITS.ipDay) wait = Math.max(wait, until(counts.ipDay.endsAt));
  if (counts.all.count > PIN_LIMITS.all && counts.ip.count > PIN_LIMITS.ipUnderAttack) {
    // Held to 3 per 15 minutes until the sitewide hour ends.
    wait = Math.max(wait, until(counts.ip.endsAt < counts.all.endsAt ? counts.ip.endsAt : counts.all.endsAt));
  }
  return wait;
}

/** A PIN that matched a slip takes its count back, so only wrong PINs count. */
export async function takeBackPinAttempt(db: Executor, ip: string) {
  await db
    .update(signInThrottle)
    .set({ failures: sql`greatest(${signInThrottle.failures} - 1, 0)` })
    .where(inArray(signInThrottle.key, Object.values(pinKeys(ip))));
}
