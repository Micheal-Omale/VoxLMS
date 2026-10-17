"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { requireTeam, requireTeamSchoolContext } from "@/server/auth/viewer";
import { setCurrentTerm } from "@/server/data";
import {
  createSchool,
  type FormResult,
  removeSection,
  savePrincipal,
  saveSection,
  saveSession,
  type SectionInput,
  type TermInput,
  updateSchoolDetails,
} from "@/server/data/setup";

// Our team's school setup actions (spec 0005). Each checks the caller is on
// our team; the data functions check it again and keep to the school.

export type SetupFormState = {
  ok: boolean;
  field?: string;
  error?: string;
  needsConfirm?: boolean;
  message?: string;
  /** What was typed, sent back on a refused save so the form doesn't lose it. */
  values?: Record<string, string>;
} | null;

/** Everything typed into the form, so a refused save can refill it. */
const typed = (form: FormData) =>
  Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string") as [string, string][]);

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function detailsFrom(form: FormData) {
  return {
    name: text(form, "name"),
    slug: text(form, "slug").toLowerCase(),
    code: text(form, "code").toUpperCase(),
    address: text(form, "address"),
    motto: text(form, "motto"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    plan: (text(form, "plan") === "school_logo" ? "school_logo" : "basic") as "basic" | "school_logo",
    showAttendance: form.get("showAttendance") === "on",
  };
}

const asState = (result: FormResult<object>): NonNullable<SetupFormState> =>
  result.ok ? { ok: true } : { ok: false, field: result.field, error: result.error };

export async function createSchoolAction(_previous: SetupFormState, form: FormData): Promise<SetupFormState> {
  await requireTeam();
  const result = await createSchool(db, { kind: "admin", readOnly: false }, detailsFrom(form));
  if (!result.ok) return { ...asState(result), values: typed(form) };
  redirect(`/admin/schools/${result.schoolId}`);
}

export async function updateDetailsAction(schoolId: string, _previous: SetupFormState, form: FormData): Promise<SetupFormState> {
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const result = await updateSchoolDetails(ctx, { ...detailsFrom(form), confirmSlugChange: form.get("confirmSlugChange") === "yes" });
  if (!result.ok) return { ok: false, field: result.field, error: result.error, needsConfirm: "needsConfirm" in result, values: typed(form) };
  refresh();
  return { ok: true, message: result.slugChanged ? "Saved. The school's web address has changed." : "Saved." };
}

export async function saveSectionAction(schoolId: string, _previous: SetupFormState, form: FormData): Promise<SetupFormState> {
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const stage = text(form, "stage") as SectionInput["stage"];
  if (!["primary", "junior_secondary", "senior_secondary"].includes(stage)) return { ok: false, field: "stage", error: "Choose a section.", values: typed(form) };
  const result = await saveSection(ctx, {
    stage,
    teacherTitle: text(form, "teacherTitle"),
    hasOwnHead: form.get("hasOwnHead") === "on",
    headTitle: text(form, "headTitle"),
    headName: text(form, "headName"),
  });
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Section saved." } : { ...asState(result), values: typed(form) };
}

export async function savePrincipalAction(schoolId: string, _previous: SetupFormState, form: FormData): Promise<SetupFormState> {
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const result = await savePrincipal(ctx, { title: text(form, "principalTitle"), name: text(form, "principalName") });
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Principal saved." } : { ...asState(result), values: typed(form) };
}

export async function removeSectionAction(schoolId: string, sectionId: string): Promise<SetupFormState> {
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const result = await removeSection(ctx, { sectionId });
  if (result.ok) refresh();
  return asState(result);
}

export async function saveSessionAction(schoolId: string, sessionId: string | null, _previous: SetupFormState, form: FormData): Promise<SetupFormState> {
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const terms = ([1, 2, 3] as const).map(
    (n): TermInput => ({
      number: n,
      startsOn: text(form, `term${n}Start`),
      endsOn: text(form, `term${n}End`),
      nextTermBeginsOn: text(form, `term${n}Next`) || null,
      daysOpened: text(form, `term${n}Days`) ? Number(text(form, `term${n}Days`)) : null,
    }),
  );
  const result = await saveSession(ctx, { sessionId: sessionId ?? undefined, name: text(form, "name"), terms });
  if (result.ok) refresh();
  return result.ok ? { ok: true, message: "Session saved." } : { ...asState(result), values: typed(form) };
}

export async function setCurrentTermAction(schoolId: string, termId: string): Promise<SetupFormState> {
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const { carried, classOff } = await setCurrentTerm(ctx, { termId });
  refresh();
  // Spec 0008, AC-13: say what came forward, and what didn't because its class is switched off.
  const parts = [
    carried > 0 ? `${carried} ${carried === 1 ? "student was" : "students were"} carried forward into the same classes.` : null,
    classOff > 0 ? `${classOff} ${classOff === 1 ? "student wasn’t" : "students weren’t"}, because their class is switched off.` : null,
  ].filter(Boolean);
  return { ok: true, message: parts.join(" ") };
}
