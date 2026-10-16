import { authEvent } from "@/db/schema";
import type { Executor } from "@/server/data/context";

// Add only audit log (spec 0004, AC-11). Never holds passwords, setup links,
// scores or children's details.

export type AuthEventKind = (typeof authEvent.$inferInsert)["kind"];

export type RequestMeta = { ip: string; userAgent: string | null };

export async function logAuthEvent(
  db: Executor,
  event: {
    kind: AuthEventKind;
    userId?: string | null;
    actorUserId?: string | null;
    schoolId?: string | null;
    meta?: RequestMeta;
    detail?: Record<string, unknown>;
  },
) {
  await db.insert(authEvent).values({
    kind: event.kind,
    userId: event.userId ?? null,
    actorUserId: event.actorUserId ?? null,
    schoolId: event.schoolId ?? null,
    ipAddress: event.meta?.ip ?? null,
    userAgent: event.meta?.userAgent?.slice(0, 400) ?? null,
    detail: event.detail ?? null,
  });
}
