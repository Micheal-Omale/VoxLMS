import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { academicSession, term } from "@/db/schema";
import { termLabel } from "@/lib/term-label";

import type { Executor } from "./context";
import { TermReleased } from "./errors";

// Release lock for school terms (spec 0014, AC-4).
// While a term is released, every write that changes its figures, comments or
// class list is refused with TermReleased. Writers share lock the term rows
// in id order, so a save and a release (which locks FOR UPDATE) never cross,
// and different writers never deadlock.

/**
 * Share locks the given term rows in id order within the caller's transaction.
 * Throws TermReleased if any of the terms is released to parents.
 */
export async function assertTermsOpen(tx: Executor, schoolId: string, termIds: string[]): Promise<void> {
  const ids = [...new Set(termIds.filter(Boolean))].sort();
  if (ids.length === 0) return;

  const rows = await tx
    .select({
      id: term.id,
      number: term.number,
      sessionName: academicSession.name,
      releasedAt: term.resultsReleasedAt,
    })
    .from(term)
    .innerJoin(academicSession, eq(academicSession.id, term.sessionId))
    .where(and(eq(term.schoolId, schoolId), inArray(term.id, ids)))
    .orderBy(asc(term.id))
    .for("share");

  for (const r of rows) {
    if (r.releasedAt) {
      throw new TermReleased(termLabel(r.number, r.sessionName));
    }
  }
}

/** All term ids belonging to a session in the school (AC-4). */
export async function sessionTermIds(tx: Executor, schoolId: string, sessionId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: term.id })
    .from(term)
    .where(and(eq(term.schoolId, schoolId), eq(term.sessionId, sessionId)));
  return rows.map((r) => r.id);
}
