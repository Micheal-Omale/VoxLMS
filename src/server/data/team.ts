import "server-only";

import type { Actor } from "./context";
import { NotFound } from "./errors";

// Shared by our team's setup modules (specs 0005, 0006).

/** A form save's result: ok, or the field to mark and the reason in plain words. */
export type FormResult<T = object> = ({ ok: true } & T) | { ok: false; field: string; error: string };

/** A refusal the form turns into a "Same person?" or "Add anyway?" confirm (spec 0008). */
export type NeedsConfirm<T = object> = { ok: false; field: string; error: string; needsConfirm: true } & T;

/** Our team only (seeds and tests act as the system); anyone else gets "not found". */
export function assertTeam(actor: Actor) {
  if (actor.kind === "system") return;
  if (actor.kind !== "admin" || actor.readOnly) throw new NotFound("School");
}

export { tidy } from "@/lib/enrolment-rules";

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The database constraint behind a failed statement (Drizzle wraps the driver's error in `cause`). */
export function violatedConstraint(error: unknown): { code: string; constraint: string | null } | null {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^23\d{3}$/.test(code)) return { code, constraint: (e as { constraint?: string }).constraint ?? null };
  }
  return null;
}

/** The Postgres error code behind a failed statement, if any (22P02: not a valid uuid). */
export function sqlState(error: unknown): string | null {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

/** Today's date in Lagos as YYYY-MM-DD, the school's own calendar day. */
export function lagosToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
