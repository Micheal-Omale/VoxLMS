import "server-only";

import { and, asc, count, eq, gt, inArray } from "drizzle-orm";

import { academicSession, assessmentComponent, gradeBand, score, scoreChange, section } from "@/db/schema";
import { type Band, partKey, scaleProblem, splitProblem } from "@/lib/grading-presets";

import type { Executor, SchoolContext } from "./context";
import { copySourceFor, resolveSessions } from "./curriculum";
import { NotFound } from "./errors";
import { assertTeam, type FormResult } from "./team";

// Score splits and grade scales per section and session (spec 0006, AC-5 to
// AC-7). Grades are worked out from the scale whenever they are shown, so a
// saved scale changes every grade at once.

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function getGradingSetup(ctx: SchoolContext, input: { sessionId?: string | null } = {}) {
  assertTeam(ctx.actor);
  const { sessions, session, earlier, currentTerm } = await resolveSessions(ctx, input.sessionId);
  const currentSessionId = currentTerm?.sessionId ?? null;
  const sections = await ctx.db
    .select({ id: section.id, stage: section.stage, name: section.name })
    .from(section)
    .where(eq(section.schoolId, ctx.schoolId))
    .orderBy(asc(section.stage));
  if (!session) return { sessions, session, currentSessionId, copyFrom: null, sections: sections.map((s) => ({ ...s, parts: [], bands: [] })) };

  const [parts, bands, scored, copyFrom] = await Promise.all([
    ctx.db
      .select({ id: assessmentComponent.id, sectionId: assessmentComponent.sectionId, key: assessmentComponent.key, label: assessmentComponent.label, max: assessmentComponent.maxScore })
      .from(assessmentComponent)
      .where(and(eq(assessmentComponent.schoolId, ctx.schoolId), eq(assessmentComponent.sessionId, session.id)))
      .orderBy(asc(assessmentComponent.sortOrder)),
    ctx.db
      .select({ sectionId: gradeBand.sectionId, grade: gradeBand.grade, min: gradeBand.minScore, remark: gradeBand.remark })
      .from(gradeBand)
      .where(and(eq(gradeBand.schoolId, ctx.schoolId), eq(gradeBand.sessionId, session.id))),
    ctx.db
      .select({ componentId: score.componentId, n: count() })
      .from(score)
      .where(and(eq(score.schoolId, ctx.schoolId), eq(score.sessionId, session.id)))
      .groupBy(score.componentId),
    copySourceFor(ctx, session, earlier),
  ]);
  return {
    sessions,
    session,
    currentSessionId,
    copyFrom,
    sections: sections.map((s) => ({
      ...s,
      parts: parts
        .filter((p) => p.sectionId === s.id)
        .map((p) => ({ id: p.id, key: p.key, label: p.label, max: Number(p.max), scores: scored.find((x) => x.componentId === p.id)?.n ?? 0 })),
      bands: bands
        .filter((b) => b.sectionId === s.id)
        .map((b) => ({ grade: b.grade, min: Number(b.min), remark: b.remark }))
        .sort((a, b) => b.min - a.min),
    })),
  };
}

/** Locks the section so split, scale and copy saves for it run one at a time. */
async function lockSection(db: Executor, schoolId: string, sectionId: string) {
  const [row] = await db
    .select({ id: section.id, name: section.name })
    .from(section)
    .where(and(eq(section.schoolId, schoolId), eq(section.id, sectionId)))
    .for("no key update");
  if (!row) throw new NotFound("Section");
  return row;
}

async function sessionInSchool(db: Executor, schoolId: string, sessionId: string) {
  const [row] = await db
    .select({ id: academicSession.id })
    .from(academicSession)
    .where(and(eq(academicSession.schoolId, schoolId), eq(academicSession.id, sessionId)));
  if (!row) throw new NotFound("Session");
}

export type SplitPartInput = { id?: string | null; label: string; max: number };

/**
 * Saves a section's score split for a session (AC-5, AC-7). Labels and raised
 * maximums can always change. Refused: a maximum lowered below a saved score,
 * or a part removed that has scores.
 */
export async function saveScoreSplit(
  ctx: SchoolContext,
  input: { sectionId: string; sessionId: string; parts: SplitPartInput[] },
): Promise<FormResult> {
  assertTeam(ctx.actor);
  if (!Array.isArray(input.parts) || input.parts.some((p) => typeof p?.label !== "string" || typeof p.max !== "number")) {
    return { ok: false, field: "parts", error: "That split couldn’t be read. Reload the page and try again." };
  }
  const parts = input.parts.map((p) => ({ id: p.id || null, label: p.label.trim().replace(/\s+/g, " "), max: p.max }));
  const problem = splitProblem(parts);
  if (problem) return { ok: false, field: problem.index === null ? "parts" : `part-${problem.index}`, error: problem.error };
  const ids = parts.flatMap((p) => (p.id ? [p.id] : []));
  if (new Set(ids).size !== ids.length) return { ok: false, field: "parts", error: "A part was sent twice. Reload the page and try again." };

  return ctx.db.transaction(async (tx) => {
    await sessionInSchool(tx, ctx.schoolId, input.sessionId);
    await lockSection(tx, ctx.schoolId, input.sectionId);
    // Score saves lock these rows for share while checking maximums, so the two never interleave.
    const existing = await tx
      .select({ id: assessmentComponent.id, key: assessmentComponent.key, label: assessmentComponent.label, max: assessmentComponent.maxScore })
      .from(assessmentComponent)
      .where(
        and(
          eq(assessmentComponent.schoolId, ctx.schoolId),
          eq(assessmentComponent.sectionId, input.sectionId),
          eq(assessmentComponent.sessionId, input.sessionId),
        ),
      )
      .for("update");
    if (ids.some((id) => !existing.some((e) => e.id === id))) throw new NotFound("Part");

    const problems: string[] = [];
    const removed = existing.filter((e) => !ids.includes(e.id));
    if (removed.length > 0) {
      const removedIds = removed.map((r) => r.id);
      const [scored, logged] = await Promise.all([
        tx.select({ id: score.componentId, n: count() }).from(score).where(inArray(score.componentId, removedIds)).groupBy(score.componentId),
        tx.selectDistinct({ id: scoreChange.componentId }).from(scoreChange).where(inArray(scoreChange.componentId, removedIds)),
      ]);
      for (const r of removed) {
        const n = scored.find((s) => s.id === r.id)?.n ?? 0;
        if (n > 0) problems.push(`${r.label} has ${plural(n, "saved score")}, so it can’t be removed.`);
        else if (logged.some((l) => l.id === r.id)) problems.push(`Scores were entered for ${r.label} and later cleared. Their history is kept, so it can’t be removed.`);
      }
    }
    for (const p of parts) {
      const before = existing.find((e) => e.id === p.id);
      if (!before || p.max >= Number(before.max)) continue;
      const [over] = await tx
        .select({ n: count() })
        .from(score)
        .where(and(eq(score.componentId, before.id), gt(score.value, String(p.max))));
      if (over.n > 0) problems.push(`${plural(over.n, "saved score")} for ${before.label} ${over.n === 1 ? "is" : "are"} above ${p.max}, so its maximum can’t go below that.`);
    }
    if (problems.length > 0) return { ok: false as const, field: "parts", error: `Nothing was saved. ${problems.join(" ")}` };

    if (removed.length > 0) await tx.delete(assessmentComponent).where(inArray(assessmentComponent.id, removed.map((r) => r.id)));
    // A part's key never changes once made, because score saves name parts by key.
    const keys = new Set(existing.filter((e) => ids.includes(e.id)).map((e) => e.key));
    for (const [i, p] of parts.entries()) {
      const values = { label: p.label, maxScore: String(p.max), sortOrder: i + 1 };
      if (p.id) {
        await tx.update(assessmentComponent).set(values).where(eq(assessmentComponent.id, p.id));
      } else {
        const key = partKey(p.label, keys);
        keys.add(key);
        await tx.insert(assessmentComponent).values({ schoolId: ctx.schoolId, sectionId: input.sectionId, sessionId: input.sessionId, key, ...values });
      }
    }
    return { ok: true as const };
  });
}

/**
 * Replaces a section's grade scale for a session (AC-6). Nothing references a
 * band, so the whole scale is rewritten; other sessions are never touched.
 */
export async function saveGradeScale(ctx: SchoolContext, input: { sectionId: string; sessionId: string; bands: Band[] }): Promise<FormResult> {
  assertTeam(ctx.actor);
  if (!Array.isArray(input.bands) || input.bands.some((b) => typeof b?.grade !== "string" || typeof b.min !== "number" || typeof b.remark !== "string")) {
    return { ok: false, field: "bands", error: "That scale couldn’t be read. Reload the page and try again." };
  }
  const bands = input.bands.map((b) => ({ grade: b.grade.trim(), min: b.min, remark: b.remark.trim().replace(/\s+/g, " ") }));
  const problem = scaleProblem(bands);
  if (problem) return { ok: false, field: problem.index === null ? "bands" : `band-${problem.index}`, error: problem.error };

  return ctx.db.transaction(async (tx) => {
    await sessionInSchool(tx, ctx.schoolId, input.sessionId);
    await lockSection(tx, ctx.schoolId, input.sectionId);
    const scope = and(eq(gradeBand.schoolId, ctx.schoolId), eq(gradeBand.sectionId, input.sectionId), eq(gradeBand.sessionId, input.sessionId));
    await tx.delete(gradeBand).where(scope);
    await tx.insert(gradeBand).values(
      [...bands]
        .sort((a, b) => b.min - a.min)
        .map((b) => ({ schoolId: ctx.schoolId, sectionId: input.sectionId, sessionId: input.sessionId, grade: b.grade, minScore: String(b.min), remark: b.remark })),
    );
    return { ok: true as const };
  });
}
