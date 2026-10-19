"use server";

import { refresh } from "next/cache";

import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { DataError, NotFound } from "@/server/data/errors";
import { releaseTerm, withdrawRelease } from "@/server/data/result-pins";
import type { FormResult } from "@/server/data/team";

// Release and withdraw a school's term results (spec 0014, AC-2, AC-3). Our team only.

async function run(schoolId: string, fn: (ctx: Awaited<ReturnType<typeof requireTeamSchoolContext>>["ctx"]) => Promise<FormResult>): Promise<FormResult> {
  const { ctx } = await requireTeamSchoolContext(String(schoolId));
  try {
    const result = await fn(ctx);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    if (error instanceof NotFound) return { ok: false, field: "form", error: "That term isn’t one you can release. Reload the page and try again." };
    if (error instanceof DataError) return { ok: false, field: "form", error: error.message };
    throw error;
  }
}

export async function releaseTermAction(schoolId: string, termId: string) {
  return run(schoolId, (ctx) => releaseTerm(ctx, { termId: String(termId) }));
}

export async function withdrawReleaseAction(schoolId: string, termId: string) {
  return run(schoolId, (ctx) => withdrawRelease(ctx, { termId: String(termId) }));
}
