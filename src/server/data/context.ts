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
 * The school always comes from the signed-in user's account, never from the URL.
 */
export type SchoolContext = {
  schoolId: string;
  /** The signed-in user; null only for reads that need no author. */
  userId: string | null;
  db: Executor;
};

export function schoolContext(input: { schoolId: string; userId: string | null; db?: Executor }): SchoolContext {
  return { schoolId: input.schoolId, userId: input.userId, db: input.db ?? sharedDb };
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
