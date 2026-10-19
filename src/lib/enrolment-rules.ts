// The field rules for students, parents and teachers (spec 0008), shared by
// the typed forms and the Excel import (spec 0013) so the two never drift.
// Pure: no database, no server only imports.

import { normaliseNigerianPhone } from "./phone";

/** Trimmed, with inner runs of spaces collapsed to one. */
export const tidy = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ");

export type Refusal = { ok: false; field: string; error: string };

export type Gender = "male" | "female";

// ---------- Students (spec 0008, AC-5 to AC-7) ----------

/** How admission numbers are compared (AC-6): case and spaces ignored, as the database's unique index does. */
export const normaliseAdmissionNo = (value: string) => value.toUpperCase().replace(/\s/g, "");

export type StudentFields = { surname: string; otherNames: string; gender: string; admissionNo?: string | null; house?: string | null };

export type StudentValues = { surname: string; otherNames: string; gender: Gender; admissionNo: string | null; house: string | null };

/** The trimmed values to save, or the first field to fix. */
export function readStudent(input: StudentFields): ({ ok: true } & StudentValues) | Refusal {
  const surname = tidy(input.surname);
  const otherNames = tidy(input.otherNames);
  const admissionNo = tidy(input.admissionNo) || null;
  const house = tidy(input.house) || null;
  if (surname.length < 2 || surname.length > 40) return { ok: false, field: "surname", error: "Type the surname, 2 to 40 characters." };
  if (otherNames.length < 2 || otherNames.length > 80) return { ok: false, field: "otherNames", error: "Type the other names, 2 to 80 characters." };
  if (input.gender !== "male" && input.gender !== "female") return { ok: false, field: "gender", error: "Choose boy or girl." };
  if (admissionNo && admissionNo.length > 30) return { ok: false, field: "admissionNo", error: "Keep the admission number to 30 characters." };
  if (house && house.length > 30) return { ok: false, field: "house", error: "Keep the house to 30 characters." };
  return { ok: true, surname, otherNames, gender: input.gender, admissionNo, house };
}

// ---------- Parents (spec 0008, AC-8) ----------

export type Relationship = "mother" | "father" | "guardian";
export const RELATIONSHIPS: Relationship[] = ["mother", "father", "guardian"];

export type GuardianFields = { fullName: string; phone: string; relationship: Relationship };

/** The first thing wrong with a parent; `details` false checks only the relationship (linking an existing parent). */
export function guardianProblem(input: Partial<GuardianFields>, need: { details: boolean }): Refusal | null {
  if (!RELATIONSHIPS.includes(input.relationship as Relationship)) return { ok: false, field: "relationship", error: "Choose mother, father or guardian." };
  if (!need.details) return null;
  const name = tidy(input.fullName);
  if (name.length < 3 || name.length > 80) return { ok: false, field: "fullName", error: "Type the parent's full name, 3 to 80 characters." };
  if (!normaliseNigerianPhone(input.phone ?? "")) return { ok: false, field: "phone", error: "That isn't a Nigerian mobile number. Type it like 0803 123 4567." };
  return null;
}

export const MAX_GUARDIANS = 2;

/**
 * Whether one more parent can be linked to a child that already has these
 * (spec 0003, AC-9): at most two, never the same one twice, and the first
 * one linked is primary. Used by `linkGuardian` and by the import's planner.
 */
export function nextGuardianLink(existing: { guardianId: string }[], guardianId: string): { ok: true; isPrimary: boolean } | { ok: false; reason: "already_linked" | "too_many" } {
  if (existing.some((l) => l.guardianId === guardianId)) return { ok: false, reason: "already_linked" };
  if (existing.length >= MAX_GUARDIANS) return { ok: false, reason: "too_many" };
  return { ok: true, isPrimary: existing.length === 0 };
}

// ---------- Teachers (spec 0008, AC-1, AC-2) ----------

export type TeacherInput = { title?: string | null; fullName: string };

export function teacherProblem(input: TeacherInput): Refusal | null {
  const title = tidy(input.title);
  const name = tidy(input.fullName);
  if (title.length > 20) return { ok: false, field: "title", error: "Keep the title short, like Mrs or Dr (up to 20 characters)." };
  if (name.length < 3 || name.length > 80) return { ok: false, field: "fullName", error: "Type the teacher's full name, 3 to 80 characters." };
  return null;
}
