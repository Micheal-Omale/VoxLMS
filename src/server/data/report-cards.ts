import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { asset, classTeacher, school, schoolClass, staff, student, term } from "@/db/schema";
import type { CardImage, ReportCardInput } from "@/lib/report-card";

import { readSnapshot, type SchoolContext } from "./context";
import { NotFound } from "./errors";
import { loadClassRemarks } from "./remarks";
import { getGradeBands, loadClassResults } from "./results";
import { getSignerForSection } from "./setup";

// Report cards (spec 0012): everything a class's cards print, from one read.
// Nothing is worked out here that results or remarks already work out, and
// nothing is stored.

const FORMAT: Record<string, CardImage["format"]> = { "image/png": "png", "image/jpeg": "jpg" };

/**
 * Everything the cards print for a class and term (AC-11). Runs every read on
 * the `ctx.db` it is given without opening a transaction: results first
 * (which checks access), then remarks from those results, then the school,
 * form master, signer, grade scale, term and image bytes.
 */
export async function loadReportCards(ctx: SchoolContext, input: { classId: string; termId?: string }) {
  const results = await loadClassResults(ctx, input);
  const remarks = await loadClassRemarks(ctx, { classId: input.classId, termId: results.term.id, results });

  const [[found], [cls], [termRow]] = await Promise.all([
    ctx.db
      .select({
        name: school.name,
        code: school.code,
        address: school.address,
        phone: school.phone,
        email: school.email,
        motto: school.motto,
        plan: school.plan,
        logoAssetId: school.logoAssetId,
      })
      .from(school)
      .where(eq(school.id, ctx.schoolId)),
    ctx.db
      .select({ sectionId: schoolClass.sectionId })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.id, results.cls.id))),
    ctx.db
      .select({ sessionId: term.sessionId, nextTermBeginsOn: term.nextTermBeginsOn })
      .from(term)
      .where(and(eq(term.schoolId, ctx.schoolId), eq(term.id, results.term.id))),
  ]);
  if (!found) throw new NotFound("School");
  if (!cls) throw new NotFound("Class");
  if (!termRow) throw new NotFound("Term");

  const studentIds = results.students.map((s) => s.studentId);
  const [teacher, signer, gradeBands, genders] = await Promise.all([
    ctx.db
      .select({ title: staff.title, name: staff.fullName })
      .from(classTeacher)
      .innerJoin(staff, and(eq(staff.schoolId, classTeacher.schoolId), eq(staff.id, classTeacher.staffId)))
      .where(
        and(eq(classTeacher.schoolId, ctx.schoolId), eq(classTeacher.classId, results.cls.id), eq(classTeacher.sessionId, termRow.sessionId)),
      ),
    // Who signs comes only from getSignerForSection (spec 0007), read as the
    // system as loadClassRemarks does: the class access check has let this caller in.
    getSignerForSection({ ...ctx, actor: { kind: "system" } }, cls.sectionId),
    getGradeBands(ctx, { sectionId: cls.sectionId, sessionId: termRow.sessionId }),
    studentIds.length === 0
      ? []
      : ctx.db
          .select({ id: student.id, gender: student.gender })
          .from(student)
          .where(and(eq(student.schoolId, ctx.schoolId), inArray(student.id, studentIds))),
  ]);

  // Image bytes by id, within the school, never over the network (AC-8). The logo only on its plan.
  const logoId = found.plan === "school_logo" ? found.logoAssetId : null;
  const signatureId = signer?.signatureAssetId ?? null;
  const imageIds = [logoId, signatureId].filter((v): v is string => v !== null);
  const images =
    imageIds.length === 0
      ? []
      : await ctx.db
          .select({ id: asset.id, mimeType: asset.mimeType, bytes: asset.bytes })
          .from(asset)
          .where(and(eq(asset.schoolId, ctx.schoolId), inArray(asset.id, imageIds)));
  const image = (id: string | null): CardImage | null => {
    const row = id ? images.find((i) => i.id === id) : undefined;
    const format = row && FORMAT[row.mimeType];
    return row && format ? { data: Buffer.from(row.bytes), format } : null;
  };

  return {
    results,
    remarks,
    school: { name: found.name, code: found.code, address: found.address, phone: found.phone, email: found.email, motto: found.motto, plan: found.plan },
    teacherTitle: remarks.teacherTitle,
    formMaster: teacher[0] ?? null,
    signer: signer ? { title: signer.title, name: signer.name } : null,
    gradeBands,
    nextTermBeginsOn: termRow.nextTermBeginsOn,
    genders: Object.fromEntries(genders.map((g) => [g.id, g.gender])),
    logo: image(logoId),
    signature: image(signatureId),
  } satisfies ReportCardInput;
}

export type ReportCardsData = Awaited<ReturnType<typeof loadReportCards>>;

/** A class's report card data from one consistent read (AC-11). No `termId` means the current term. */
export function getReportCards(ctx: SchoolContext, input: { classId: string; termId?: string }) {
  return readSnapshot(ctx, (snapshot) => loadReportCards(snapshot, input));
}
