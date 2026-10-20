import "server-only";

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NeonQueryResultHKT } from "drizzle-orm/neon-serverless";
import type { PgDatabase } from "drizzle-orm/pg-core";

import { db as sharedDb } from "@/db";
import type * as schema from "@/db/schema";

/** The shared client or a transaction; every data function works with either. */
export type Executor = PgDatabase<
  NeonQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Every read and write of school data takes one of these first (spec 0003).
 * The school is resolved on the server from the address and checked against
 * the signed-in person's active staff record there (spec 0004); never trusted
 * from the client.
 */
export type SchoolContext = {
  schoolId: string;
  /** The signed-in user; null only for reads that need no author. */
  userId: string | null;
  db: Executor;
  /** Who is asking (spec 0004). Seeds and tests act as the system. */
  actor: Actor;
};

/**
 * teacher: in Release 1, only their form classes. admin: our team, every class.
 * system: seeds and tests. readOnly is true while our team is viewing as someone.
 */
export type Actor =
  | { kind: "teacher"; staffId: string; readOnly: boolean }
  | { kind: "principal"; staffId: string; readOnly: boolean }
  | { kind: "admin"; readOnly: boolean }
  | { kind: "system" };

export function schoolContext(input: {
  schoolId: string;
  userId: string | null;
  db?: Executor;
  actor?: Actor;
}): SchoolContext {
  return {
    schoolId: input.schoolId,
    userId: input.userId,
    db: input.db ?? sharedDb,
    actor: input.actor ?? { kind: "system" },
  };
}

/**
 * Runs several reads against one consistent snapshot, so a class PDF and its
 * broadsheet always see exactly the same scores.
 */
export function readSnapshot<T>(ctx: SchoolContext, fn: (snapshot: SchoolContext) => Promise<T>): Promise<T> {
  return ctx.db.transaction((tx) => fn({ ...ctx, db: tx }), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}
