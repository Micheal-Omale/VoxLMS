import "server-only";

import type { Actor } from "./context";
import { NotFound } from "./errors";

// Shared by our team's setup modules (specs 0005, 0006).

/** A form save's result: ok, or the field to mark and the reason in plain words. */
export type FormResult<T = object> = ({ ok: true } & T) | { ok: false; field: string; error: string };

/** Our team only (seeds and tests act as the system); anyone else gets "not found". */
export function assertTeam(actor: Actor) {
  if (actor.kind === "system") return;
  if (actor.kind !== "admin" || actor.readOnly) throw new NotFound("School");
}
