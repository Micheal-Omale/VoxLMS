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

export function formatWait(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
