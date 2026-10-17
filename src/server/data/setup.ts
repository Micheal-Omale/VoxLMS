import "server-only";

import { and, asc, count, eq, ne } from "drizzle-orm";

import { academicSession, asset, school, schoolClass, section, term } from "@/db/schema";
import { normaliseNigerianPhone } from "@/lib/phone";
import { slugProblem } from "@/lib/reserved-slugs";

import type { Actor, Executor, SchoolContext } from "./context";
import { NotFound } from "./errors";
import { assertTeam, type FormResult } from "./team";

export type { FormResult } from "./team";

// School and term setup (spec 0005). Our team only; every write stays inside
// the school in the context (spec 0003).

type Stage = "primary" | "junior_secondary" | "senior_secondary";

const trimOrNull = (value: string | null | undefined) => {
  const t = value?.trim();
  return t ? t : null;
};

// ---------- Create and edit the school ----------

export type SchoolDetailsInput = {
  name: string;
  slug: string;
  code: string;
  address: string;
  motto?: string | null;
  phone?: string | null;
  email?: string | null;
  plan?: "basic" | "school_logo";
  showAttendance?: boolean;
};

async function checkDetails(db: Executor, input: SchoolDetailsInput, exceptSchoolId?: string): Promise<FormResult | null> {
  if (input.name.trim().length < 3) return { ok: false, field: "name", error: "Type the school's full name." };
  const slugIssue = slugProblem(input.slug);
  if (slugIssue) return { ok: false, field: "slug", error: slugIssue };
  const [taken] = await db
    .select({ id: school.id })
    .from(school)
    .where(exceptSchoolId ? and(eq(school.slug, input.slug), ne(school.id, exceptSchoolId)) : eq(school.slug, input.slug));
  if (taken) return { ok: false, field: "slug", error: "Another school already uses that web name." };
  if (!/^[A-Z]{2,6}$/.test(input.code)) return { ok: false, field: "code", error: "Use 2 to 6 capital letters, like GHS." };
  if (input.address.trim().length < 5) return { ok: false, field: "address", error: "Type the school's address as it appears on report cards." };
  if (trimOrNull(input.phone) && !normaliseNigerianPhone(input.phone!)) {
    return { ok: false, field: "phone", error: "That isn't a Nigerian phone number." };
  }
  if (trimOrNull(input.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email!.trim())) {
    return { ok: false, field: "email", error: "That doesn't look like an email address." };
  }
  return null;
}

export async function createSchool(db: Executor, actor: Actor, input: SchoolDetailsInput): Promise<FormResult<{ schoolId: string }>> {
  assertTeam(actor);
  const problem = await checkDetails(db, input);
  if (problem && !problem.ok) return problem;
  const [created] = await db
    .insert(school)
    .values({
      name: input.name.trim(),
      slug: input.slug,
      code: input.code,
      address: input.address.trim(),
      motto: trimOrNull(input.motto),
      phone: trimOrNull(input.phone) ? normaliseNigerianPhone(input.phone!) : null,
      email: trimOrNull(input.email),
      plan: input.plan ?? "basic",
      showAttendance: input.showAttendance ?? false,
    })
    .returning({ id: school.id });
  return { ok: true, schoolId: created.id };
}

export async function updateSchoolDetails(
  ctx: SchoolContext,
  input: SchoolDetailsInput & { confirmSlugChange: boolean },
): Promise<FormResult<{ slugChanged: boolean }> | { ok: false; field: "slug"; error: string; needsConfirm: true }> {
  assertTeam(ctx.actor);
  const [current] = await ctx.db.select().from(school).where(eq(school.id, ctx.schoolId));
  if (!current) throw new NotFound("School");
  const problem = await checkDetails(ctx.db, input, ctx.schoolId);
  if (problem && !problem.ok) return problem;
  const slugChanged = input.slug !== current.slug;
  if (slugChanged && !input.confirmSlugChange) {
    return {
      ok: false,
      field: "slug",
      needsConfirm: true,
      error: `Changing the web name from /${current.slug} to /${input.slug} stops old links and bookmarks from working. Teachers will need the new address.`,
    };
  }
  await ctx.db
    .update(school)
    .set({
      name: input.name.trim(),
      slug: input.slug,
      code: input.code,
      address: input.address.trim(),
      motto: trimOrNull(input.motto),
      phone: trimOrNull(input.phone) ? normaliseNigerianPhone(input.phone!) : null,
      email: trimOrNull(input.email),
      plan: input.plan ?? current.plan,
      showAttendance: input.showAttendance ?? current.showAttendance,
    })
    .where(eq(school.id, ctx.schoolId));
  return { ok: true, slugChanged };
}

// ---------- Sections ----------

export type SectionInput = { stage: Stage; teacherTitle: string; headTitle: string; headName?: string | null };

const STAGE_NAME: Record<Stage, string> = {
  primary: "Primary",
  junior_secondary: "Junior Secondary",
  senior_secondary: "Senior Secondary",
};

export async function saveSection(ctx: SchoolContext, input: SectionInput): Promise<FormResult<{ sectionId: string }>> {
  assertTeam(ctx.actor);
  if (!input.teacherTitle.trim()) return { ok: false, field: "teacherTitle", error: "Type the teacher's title, like Form master." };
  if (!input.headTitle.trim()) return { ok: false, field: "headTitle", error: "Type the head's title, like Principal." };
  const values = {
    teacherTitle: input.teacherTitle.trim(),
    headTitle: input.headTitle.trim(),
    headName: trimOrNull(input.headName),
  };
  const [existing] = await ctx.db
    .select({ id: section.id })
    .from(section)
    .where(and(eq(section.schoolId, ctx.schoolId), eq(section.stage, input.stage)));
  if (existing) {
    await ctx.db.update(section).set(values).where(eq(section.id, existing.id));
    return { ok: true, sectionId: existing.id };
  }
  const [created] = await ctx.db
    .insert(section)
    .values({ schoolId: ctx.schoolId, stage: input.stage, name: STAGE_NAME[input.stage], ...values })
    .returning({ id: section.id });
  return { ok: true, sectionId: created.id };
}

export async function removeSection(ctx: SchoolContext, input: { sectionId: string }): Promise<FormResult> {
  assertTeam(ctx.actor);
  const [found] = await ctx.db
    .select({ id: section.id, signature: section.headSignatureAssetId })
    .from(section)
    .where(and(eq(section.schoolId, ctx.schoolId), eq(section.id, input.sectionId)));
  if (!found) throw new NotFound("Section");
  const [{ n }] = await ctx.db.select({ n: count() }).from(schoolClass).where(eq(schoolClass.sectionId, found.id));
  if (n > 0) return { ok: false, field: "section", error: "This section has classes. Move or remove its classes first." };
  await ctx.db.transaction(async (tx) => {
    await tx.delete(section).where(eq(section.id, found.id));
    if (found.signature) await tx.delete(asset).where(and(eq(asset.schoolId, ctx.schoolId), eq(asset.id, found.signature)));
  });
  return { ok: true };
}

// ---------- Sessions and terms ----------

export type TermInput = {
  number: 1 | 2 | 3;
  startsOn: string;
  endsOn: string;
  nextTermBeginsOn?: string | null;
  daysOpened?: number | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ORDINAL = ["First", "Second", "Third"];

/** Checks a session's three terms run in order (spec 0005, AC-6). */
export function termsProblem(terms: TermInput[]): { field: string; error: string } | null {
  if (terms.length !== 3) return { field: "terms", error: "A session has three terms." };
  const sorted = [...terms].sort((a, b) => a.number - b.number);
  for (const [i, t] of sorted.entries()) {
    const label = `${ORDINAL[i]} Term`;
    const at = `term${t.number}`;
    if (!ISO_DATE.test(t.startsOn) || !ISO_DATE.test(t.endsOn)) return { field: at, error: `${label} needs a start and end date.` };
    if (t.endsOn <= t.startsOn) return { field: at, error: `${label} must end after it starts.` };
    if (t.nextTermBeginsOn && (!ISO_DATE.test(t.nextTermBeginsOn) || t.nextTermBeginsOn <= t.endsOn)) {
      return { field: at, error: `${label}: next term must begin after this term ends.` };
    }
    if (t.daysOpened !== null && t.daysOpened !== undefined && (!Number.isInteger(t.daysOpened) || t.daysOpened < 0 || t.daysOpened > 200)) {
      return { field: at, error: `${label}: times school opened must be a whole number up to 200.` };
    }
    const previous = sorted[i - 1];
    if (previous && t.startsOn <= previous.endsOn) {
      return { field: at, error: `${label} must start after ${ORDINAL[i - 1]} Term ends.` };
    }
  }
  return null;
}

export async function saveSession(
  ctx: SchoolContext,
  input: { sessionId?: string; name: string; terms: TermInput[] },
): Promise<FormResult<{ sessionId: string }>> {
  assertTeam(ctx.actor);
  const name = input.name.trim();
  if (!/^\d{4}\/\d{4}$/.test(name) || Number(name.slice(5)) !== Number(name.slice(0, 4)) + 1) {
    return { ok: false, field: "name", error: "Write the session like 2026/2027." };
  }
  const problem = termsProblem(input.terms);
  if (problem) return { ok: false, ...problem };
  const sorted = [...input.terms].sort((a, b) => a.number - b.number);

  const [clash] = await ctx.db
    .select({ id: academicSession.id })
    .from(academicSession)
    .where(and(eq(academicSession.schoolId, ctx.schoolId), eq(academicSession.name, name)));
  if (clash && clash.id !== input.sessionId) return { ok: false, field: "name", error: `${name} already exists for this school.` };

  const sessionId = await ctx.db.transaction(async (tx) => {
    const span = { startsOn: sorted[0].startsOn, endsOn: sorted[2].endsOn };
    let id = input.sessionId;
    if (id) {
      const [owned] = await tx
        .update(academicSession)
        .set({ name, ...span })
        .where(and(eq(academicSession.schoolId, ctx.schoolId), eq(academicSession.id, id)))
        .returning({ id: academicSession.id });
      if (!owned) throw new NotFound("Session");
    } else {
      const [created] = await tx.insert(academicSession).values({ schoolId: ctx.schoolId, name, ...span }).returning({ id: academicSession.id });
      id = created.id;
    }
    for (const t of sorted) {
      const values = {
        startsOn: t.startsOn,
        endsOn: t.endsOn,
        nextTermBeginsOn: t.nextTermBeginsOn || null,
        daysOpened: t.daysOpened ?? null,
      };
      await tx
        .insert(term)
        .values({ schoolId: ctx.schoolId, sessionId: id, number: t.number, ...values })
        .onConflictDoUpdate({ target: [term.sessionId, term.number], set: values });
    }
    return id;
  });
  return { ok: true, sessionId };
}

// ---------- Images ----------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const MAX_IMAGE_BYTES = 300 * 1024;

/** Reads a PNG's size from its header; null if the bytes aren't a PNG. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export async function saveImage(
  ctx: SchoolContext,
  input: { kind: "logo" | "signature"; sectionId?: string | null; bytes: Uint8Array },
): Promise<FormResult<{ assetId: string }>> {
  assertTeam(ctx.actor);
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, field: "file", error: "That image is too large. Use one under 300 KB." };
  const size = readPngSize(input.bytes);
  if (!size || size.width < 16 || size.height < 16 || size.width > 1600 || size.height > 1600) {
    return { ok: false, field: "file", error: "That file isn't an image we can use. Try a JPG or PNG photo." };
  }

  return ctx.db.transaction(async (tx) => {
    let previous: string | null = null;
    if (input.kind === "signature") {
      const [owner] = await tx
        .select({ id: section.id, current: section.headSignatureAssetId })
        .from(section)
        .where(and(eq(section.schoolId, ctx.schoolId), eq(section.id, input.sectionId ?? "")));
      if (!owner) throw new NotFound("Section");
      previous = owner.current;
    } else {
      const [owner] = await tx.select({ current: school.logoAssetId }).from(school).where(eq(school.id, ctx.schoolId));
      if (!owner) throw new NotFound("School");
      previous = owner.current;
    }

    const [created] = await tx
      .insert(asset)
      .values({ schoolId: ctx.schoolId, kind: input.kind, mimeType: "image/png", bytes: Buffer.from(input.bytes), ...size })
      .returning({ id: asset.id });
    if (input.kind === "signature") {
      await tx.update(section).set({ headSignatureAssetId: created.id }).where(eq(section.id, input.sectionId!));
    } else {
      await tx.update(school).set({ logoAssetId: created.id }).where(eq(school.id, ctx.schoolId));
    }
    if (previous) await tx.delete(asset).where(and(eq(asset.schoolId, ctx.schoolId), eq(asset.id, previous)));
    return { ok: true as const, assetId: created.id };
  });
}

/** A school logo by id, for the public logo route. Anything that isn't a logo is "not found". */
export async function readLogo(db: Executor, assetId: string) {
  const [row] = await db
    .select({ bytes: asset.bytes, mimeType: asset.mimeType })
    .from(asset)
    .innerJoin(school, and(eq(school.id, asset.schoolId), eq(school.logoAssetId, asset.id)))
    .where(and(eq(asset.id, assetId), eq(asset.kind, "logo")));
  return row ?? null;
}

/** Any image of the school, for our team's preview only (signatures included). */
export async function readImageForTeam(ctx: SchoolContext, assetId: string) {
  assertTeam(ctx.actor);
  const [row] = await ctx.db
    .select({ bytes: asset.bytes, mimeType: asset.mimeType })
    .from(asset)
    .where(and(eq(asset.schoolId, ctx.schoolId), eq(asset.id, assetId)));
  return row ?? null;
}

// ---------- The setup checklist ----------

export async function getSchoolSetup(ctx: SchoolContext) {
  assertTeam(ctx.actor);
  const [found] = await ctx.db.select().from(school).where(eq(school.id, ctx.schoolId));
  if (!found) throw new NotFound("School");
  const [sections, sessions, terms] = await Promise.all([
    ctx.db.select().from(section).where(eq(section.schoolId, ctx.schoolId)).orderBy(asc(section.stage)),
    ctx.db.select().from(academicSession).where(eq(academicSession.schoolId, ctx.schoolId)).orderBy(asc(academicSession.startsOn)),
    ctx.db.select().from(term).where(eq(term.schoolId, ctx.schoolId)).orderBy(asc(term.startsOn)),
  ]);
  const current = terms.find((t) => t.isCurrent) ?? null;
  return {
    school: found,
    sections,
    sessions: sessions.map((s) => ({ ...s, terms: terms.filter((t) => t.sessionId === s.id).sort((a, b) => a.number - b.number) })),
    currentTerm: current,
    checklist: {
      details: true,
      logo: found.plan === "basic" || found.logoAssetId !== null,
      sections: sections.length > 0 && sections.every((s) => s.headName && s.headSignatureAssetId),
      terms: current !== null,
    },
  };
}
