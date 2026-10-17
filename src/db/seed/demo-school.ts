import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { classSortOrder } from "@/lib/class-name";
import { normaliseNigerianPhone } from "@/lib/phone";

import * as t from "../schema";
import type { SeedDb } from "./client";

// Made-up demo school for development branches only (spec 0003, AC-12).
// Never real children's records.

export const DEMO_SLUG = "gracehigh";
const SEED_USER = "seed";

export type Tx = Parameters<Parameters<SeedDb["transaction"]>[0]>[0];

const phone = (raw: string) => {
  const normalised = normaliseNigerianPhone(raw);
  if (!normalised) throw new Error(`Bad demo phone ${raw}`);
  return normalised;
};

const juniorStudents: [string, string, "male" | "female", string, string][] = [
  ["Abubakar", "Sadiq", "male", "2013-03-14", "Blue"],
  ["Adebayo", "Oluwaseun", "male", "2013-07-02", "Red"],
  ["Adeyemi", "Tolulope Grace", "female", "2013-01-22", "Green"],
  ["Afolabi", "Temitope", "female", "2013-11-09", "Yellow"],
  ["Bello", "Abdulrahman", "male", "2013-05-30", "Blue"],
  ["Danjuma", "Zainab", "female", "2013-08-17", "Red"],
  ["Eze", "Chukwuemeka", "male", "2012-12-04", "Green"],
  ["Ibrahim", "Hauwa", "female", "2013-02-11", "Yellow"],
  ["Musa", "Aisha", "female", "2013-06-25", "Blue"],
  ["Nwosu", "Ifeoma", "female", "2013-09-13", "Red"],
  ["Obi", "Uchenna", "male", "2013-04-08", "Green"],
  ["Ogunleye", "Damilola", "female", "2013-10-19", "Yellow"],
  ["Ojo", "Precious", "female", "2013-03-03", "Blue"],
  ["Okafor", "Chiamaka", "female", "2013-07-27", "Red"],
  ["Okon", "Emem", "male", "2013-12-15", "Green"],
  ["Etim", "Blessing", "female", "2013-05-06", "Yellow"],
];

// CA 1, CA 2, Exam for JSS 2 Gold Mathematics; "" means not entered yet.
const juniorMaths: [string, string, string][] = [
  ["17", "15", "48"], ["12", "14", "39"], ["19", "18", "54"], ["9", "11", "27"],
  ["15", "16", "41"], ["18", "", ""], ["14", "13", "44"], ["16", "17", "50"],
  ["11", "", "35"], ["20", "19", "57"], ["13", "12", "38"], ["", "", ""],
  ["", "", ""], ["", "", ""], ["15", "16", "45"], ["", "", ""],
];

const seniorStudents: [string, string, "male" | "female", string, string, string[]][] = [
  ["Adebayo", "Kehinde", "female", "2010-02-19", "Red", ["Further Mathematics"]],
  ["Chukwu", "Nnamdi", "male", "2010-06-01", "Blue", ["Further Mathematics", "Economics"]],
  ["Lawal", "Maryam", "female", "2010-09-23", "Green", ["Agricultural Science"]],
  ["Okoro", "Victor", "male", "2010-04-12", "Yellow", ["Economics"]],
  ["Salami", "Rukayat", "female", "2010-11-30", "Blue", ["Agricultural Science", "Economics"]],
  ["Udo", "Godswill", "male", "2010-08-08", "Red", ["Further Mathematics"]],
];

// Spec 0007: one principal for the school; only Primary has a head of its own.
const DEMO_PRINCIPAL = { principalTitle: "Principal", principalName: "Mr Samuel Adeleke" };
const DEMO_PRIMARY_HEAD = { headTitle: "Head teacher", headName: "Mrs Grace Oyelaran" };

/**
 * Brings a made-up school built before spec 0007 (a head named on every
 * section) to the seed's current shape. Runs once: a school that already has
 * a principal is left alone.
 */
export async function catchUpDemoSigners(db: SeedDb | Tx, schoolId: string) {
  const [found] = await db.select({ principal: t.school.principalName }).from(t.school).where(eq(t.school.id, schoolId));
  if (!found || found.principal) return;
  await db.update(t.school).set(DEMO_PRINCIPAL).where(eq(t.school.id, schoolId));
  await db
    .update(t.section)
    .set({ headTitle: "Head teacher", headName: null })
    .where(and(eq(t.section.schoolId, schoolId), ne(t.section.stage, "primary"), isNull(t.section.headSignatureAssetId)));
}

export async function seedDemoSchool(db: SeedDb) {
  const existing = await db.query.school.findFirst({ where: eq(t.school.slug, DEMO_SLUG) });
  if (existing) {
    await catchUpDemoSigners(db, existing.id);
    return { created: false as const, schoolId: existing.id };
  }

  const schoolId = await db.transaction(async (tx) =>
    buildSchool(tx, { slug: DEMO_SLUG, code: "GHS", name: "Grace High School" }),
  );
  return { created: true as const, schoolId };
}

/** Builds a complete made-up school. Used by the demo seed and by tests. */
export async function buildSchool(tx: Tx, input: { slug: string; code: string; name: string }) {
  const [school] = await tx
    .insert(t.school)
    .values({
      slug: input.slug,
      code: input.code,
      name: input.name,
      address: "14 Adeola Odeku Street, Victoria Island, Lagos",
      motto: "Knowledge and Character",
      phone: phone("0803 000 1100"),
      plan: "school_logo",
      ...DEMO_PRINCIPAL,
    })
    .returning();
  const schoolId = school.id;

  const levels = await tx.select().from(t.standardLevel);
  const level = (code: string) => {
    const found = levels.find((l) => l.code === code);
    if (!found) throw new Error(`Standard level ${code} missing; seed the standard lists first`);
    return found.id;
  };
  const classOrder = (code: string, armPosition: number) =>
    classSortOrder(levels.find((l) => l.code === code)!.sortOrder, armPosition);
  const standardSubjects = await tx.select().from(t.standardSubject);
  const standardSubjectId = (name: string) => standardSubjects.find((s) => s.name === name)?.id ?? null;

  const [primary, junior, senior] = await tx
    .insert(t.section)
    .values([
      { schoolId, stage: "primary", name: "Primary", teacherTitle: "Class teacher", ...DEMO_PRIMARY_HEAD },
      { schoolId, stage: "junior_secondary", name: "Junior Secondary", teacherTitle: "Form master", headTitle: "Head teacher" },
      { schoolId, stage: "senior_secondary", name: "Senior Secondary", teacherTitle: "Form master", headTitle: "Head teacher" },
    ])
    .returning();

  const [session] = await tx
    .insert(t.academicSession)
    .values({ schoolId, name: "2026/2027", startsOn: "2026-09-14", endsOn: "2027-07-23" })
    .returning();
  const sessionId = session.id;

  const [term1] = await tx
    .insert(t.term)
    .values([
      { schoolId, sessionId, number: 1, startsOn: "2026-09-14", endsOn: "2026-12-11", nextTermBeginsOn: "2027-01-11", daysOpened: 62, isCurrent: true },
      { schoolId, sessionId, number: 2, startsOn: "2027-01-11", endsOn: "2027-04-09", nextTermBeginsOn: "2027-04-26" },
      { schoolId, sessionId, number: 3, startsOn: "2027-04-26", endsOn: "2027-07-23" },
    ])
    .returning();

  // Score split: primary CA 40 / Exam 60; secondary CA 1 20 / CA 2 20 / Exam 60.
  const secondarySplit = [
    { key: "ca1", label: "CA 1", maxScore: "20", sortOrder: 1 },
    { key: "ca2", label: "CA 2", maxScore: "20", sortOrder: 2 },
    { key: "exam", label: "Exam", maxScore: "60", sortOrder: 3 },
  ];
  const components = await tx
    .insert(t.assessmentComponent)
    .values([
      { schoolId, sectionId: primary.id, sessionId, key: "ca", label: "CA", maxScore: "40", sortOrder: 1 },
      { schoolId, sectionId: primary.id, sessionId, key: "exam", label: "Exam", maxScore: "60", sortOrder: 2 },
      ...secondarySplit.map((c) => ({ ...c, schoolId, sectionId: junior.id, sessionId })),
      ...secondarySplit.map((c) => ({ ...c, schoolId, sectionId: senior.id, sessionId })),
    ])
    .returning();

  const basicScale = [
    ["A", "70", "Excellent"], ["B", "60", "Very good"], ["C", "50", "Good"],
    ["D", "45", "Fair"], ["E", "40", "Pass"], ["F", "0", "Fail"],
  ];
  const waecScale = [
    ["A1", "75", "Excellent"], ["B2", "70", "Very good"], ["B3", "65", "Good"],
    ["C4", "60", "Credit"], ["C5", "55", "Credit"], ["C6", "50", "Credit"],
    ["D7", "45", "Pass"], ["E8", "40", "Pass"], ["F9", "0", "Fail"],
  ];
  await tx.insert(t.gradeBand).values([
    ...basicScale.map(([grade, minScore, remark]) => ({ schoolId, sectionId: primary.id, sessionId, grade, minScore, remark })),
    ...basicScale.map(([grade, minScore, remark]) => ({ schoolId, sectionId: junior.id, sessionId, grade, minScore, remark })),
    ...waecScale.map(([grade, minScore, remark]) => ({ schoolId, sectionId: senior.id, sessionId, grade, minScore, remark })),
  ]);

  const [jss2Gold, ss1Science] = await tx
    .insert(t.schoolClass)
    .values([
      { schoolId, sectionId: junior.id, stage: "junior_secondary", standardLevelId: level("JSS2"), arm: "Gold", name: "JSS 2 Gold", sortOrder: classOrder("JSS2", 1) },
      { schoolId, sectionId: senior.id, stage: "senior_secondary", standardLevelId: level("SS1"), arm: "Science", name: "SS 1 Science", sortOrder: classOrder("SS1", 1) },
      { schoolId, sectionId: primary.id, stage: "primary", standardLevelId: level("PRY4"), arm: null, name: "Primary 4", sortOrder: classOrder("PRY4", 0) },
    ])
    .returning();

  // In the school's subject order (spec 0006): English first, then Mathematics.
  const subjectRows: [string, string, string][] = [
    ["English Studies", "ENG", "English Language"],
    ["Mathematics", "MTH", "Mathematics"],
    ["Basic Science", "BSC", "Basic Science"],
    ["Basic Technology", "BTE", "Basic Technology"],
    ["Social Studies", "SOS", "Social Studies"],
    ["Civic Education", "CIV", "Civic Education"],
    ["Yoruba", "YOR", "Yoruba"],
    ["Computer Studies", "CMP", "Computer Studies"],
    ["Physics", "PHY", "Physics"],
    ["Chemistry", "CHM", "Chemistry"],
    ["Biology", "BIO", "Biology"],
    ["Further Mathematics", "FMT", "Further Mathematics"],
    ["Agricultural Science", "AGR", "Agricultural Science"],
    ["Economics", "ECO", "Economics"],
  ];
  const subjects = await tx
    .insert(t.schoolSubject)
    .values(subjectRows.map(([name, shortName, std], i) => ({ schoolId, name, shortName, standardSubjectId: standardSubjectId(std), sortOrder: i + 1 })))
    .returning();
  const subjectId = (name: string) => subjects.find((s) => s.name === name)!.id;

  const juniorOffer = ["Mathematics", "English Studies", "Basic Science", "Basic Technology", "Social Studies", "Civic Education", "Yoruba", "Computer Studies"];
  const seniorCompulsory = ["Mathematics", "English Studies", "Civic Education", "Physics", "Chemistry", "Biology"];
  const seniorElective = ["Further Mathematics", "Agricultural Science", "Economics"];
  const offered = await tx
    .insert(t.classSubject)
    .values([
      ...juniorOffer.map((name, i) => ({ schoolId, sessionId, classId: jss2Gold.id, sectionId: junior.id, subjectId: subjectId(name), sortOrder: i })),
      ...seniorCompulsory.map((name, i) => ({ schoolId, sessionId, classId: ss1Science.id, sectionId: senior.id, subjectId: subjectId(name), sortOrder: i })),
      ...seniorElective.map((name, i) => ({ schoolId, sessionId, classId: ss1Science.id, sectionId: senior.id, subjectId: subjectId(name), isElective: true, sortOrder: 10 + i })),
    ])
    .returning();

  const [funke, ibrahim] = await tx
    .insert(t.staff)
    .values([
      { schoolId, title: "Mrs", fullName: "Funke Adewale", phone: phone("0803 123 4567"), role: "teacher" },
      { schoolId, title: "Mr", fullName: "Ibrahim Musa", phone: phone("0805 987 6543"), role: "teacher" },
    ])
    .returning();
  await tx.insert(t.classTeacher).values([
    { schoolId, sessionId, classId: jss2Gold.id, staffId: funke.id },
    { schoolId, sessionId, classId: ss1Science.id, staffId: ibrahim.id },
  ]);

  // Students, one parent each, plus the Adebayo siblings sharing a father and
  // the Eze parents sharing one phone (spec 0003, AC-9).
  // Every student gets a VoxLMS student number from the school's counter (same
  // atomic update as allocateStudentNumbers, which seeds can't import). Juniors
  // also carry the school's own admission number; seniors have none, like a
  // school that never issued them (spec 0003, AC-11).
  const nextStudentNo = async () => {
    const [row] = await tx
      .update(t.school)
      .set({ studentNoCounter: sql`${t.school.studentNoCounter} + 1` })
      .where(eq(t.school.id, schoolId))
      .returning({ n: t.school.studentNoCounter });
    return row.n;
  };
  const insertStudent = async (
    surname: string,
    otherNames: string,
    gender: "male" | "female",
    dob: string,
    house: string,
    admissionNo: string | null,
  ) => {
    const [row] = await tx
      .insert(t.student)
      .values({ schoolId, studentNo: await nextStudentNo(), admissionNo, surname, otherNames, gender, dateOfBirth: dob, house })
      .returning();
    return row;
  };

  const juniors = [];
  for (const [i, [surname, otherNames, gender, dob, house]] of juniorStudents.entries()) {
    juniors.push(await insertStudent(surname, otherNames, gender, dob, house, `GHS/2024/${String(i + 1).padStart(3, "0")}`));
  }
  const seniors = [];
  for (const [surname, otherNames, gender, dob, house] of seniorStudents) {
    seniors.push(await insertStudent(surname, otherNames, gender, dob, house, null));
  }

  const parentPhone = (i: number) => phone(`080${String(30000000 + i * 7919).slice(0, 8)}`);
  const allStudents = [...juniors, ...seniors];
  const consentAt = new Date("2026-09-20T09:00:00Z");
  let mrAdebayoId: string | undefined;
  for (const [i, s] of allStudents.entries()) {
    if (s.surname === "Adebayo" && mrAdebayoId) {
      await tx.insert(t.studentGuardian).values({ schoolId, studentId: s.id, guardianId: mrAdebayoId, relationship: "father", isPrimary: true });
      continue;
    }
    const [g] = await tx
      .insert(t.guardian)
      .values({ schoolId, fullName: `Mr/Mrs ${s.surname}`, phone: parentPhone(i), whatsappConsent: i % 3 !== 0, consentRecordedAt: i % 3 !== 0 ? consentAt : null })
      .returning();
    if (s.surname === "Adebayo") {
      await tx.update(t.guardian).set({ fullName: "Mr Tunde Adebayo" }).where(eq(t.guardian.id, g.id));
      mrAdebayoId = g.id;
    }
    await tx.insert(t.studentGuardian).values({ schoolId, studentId: s.id, guardianId: g.id, relationship: s.surname === "Adebayo" ? "father" : "guardian", isPrimary: true });
    if (s.surname === "Eze") {
      const [mother] = await tx
        .insert(t.guardian)
        .values({ schoolId, fullName: "Mrs Ngozi Eze", phone: parentPhone(i), whatsappConsent: false })
        .returning();
      await tx.insert(t.studentGuardian).values({ schoolId, studentId: s.id, guardianId: mother.id, relationship: "mother" });
    }
  }

  // First term enrolments.
  const juniorEnrolments = await tx
    .insert(t.enrolment)
    .values(juniors.map((s) => ({ schoolId, studentId: s.id, termId: term1.id, sessionId, classId: jss2Gold.id, sectionId: junior.id })))
    .returning();
  await tx
    .insert(t.enrolment)
    .values(seniors.map((s) => ({ schoolId, studentId: s.id, termId: term1.id, sessionId, classId: ss1Science.id, sectionId: senior.id })));

  for (const [i, s] of seniors.entries()) {
    await tx.insert(t.studentElective).values(
      seniorStudents[i][5].map((name) => ({ schoolId, studentId: s.id, sessionId, subjectId: subjectId(name) })),
    );
  }

  // JSS 2 Gold Mathematics scores, with their change log, as one save.
  const maths = offered.find((o) => o.classId === jss2Gold.id && o.subjectId === subjectId("Mathematics"))!;
  const juniorParts = components.filter((c) => c.sectionId === junior.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const saveId = randomUUID();
  const scoreRows = juniorEnrolments.flatMap((e, i) =>
    juniorParts.flatMap((part, p) => {
      const value = juniorMaths[i][p];
      return value === ""
        ? []
        : [{ schoolId, enrolmentId: e.id, classSubjectId: maths.id, componentId: part.id, classId: jss2Gold.id, sessionId, sectionId: junior.id, value, updatedBy: SEED_USER }];
    }),
  );
  await tx.insert(t.score).values(scoreRows);
  await tx.insert(t.scoreChange).values(
    scoreRows.map((r) => ({ schoolId, saveId, enrolmentId: r.enrolmentId, classSubjectId: r.classSubjectId, componentId: r.componentId, oldValue: null, newValue: r.value, changedBy: SEED_USER })),
  );

  return schoolId;
}

/** Removes a made-up school and everything under it, children first (no cascades exist). */
export async function removeSchoolBySlug(db: SeedDb, slug: string) {
  const found = await db.query.school.findFirst({ where: eq(t.school.slug, slug) });
  if (!found) return false;
  const id = found.id;
  await db.transaction(async (tx) => {
    const ordered = [
      t.scoreChange, t.score, t.rating, t.ratingTrait, t.termReport, t.studentElective,
      t.enrolment, t.studentGuardian, t.guardian, t.student, t.classTeacher, t.classSubject,
      t.staff, t.gradeBand, t.assessmentComponent, t.schoolSubject, t.schoolClass, t.term,
      t.academicSession, t.section,
    ];
    for (const table of ordered) await tx.delete(table).where(eq(table.schoolId, id));
    await tx.update(t.school).set({ logoAssetId: null, principalSignatureAssetId: null }).where(eq(t.school.id, id));
    await tx.delete(t.asset).where(inArray(t.asset.schoolId, [id]));
    await tx.delete(t.school).where(eq(t.school.id, id));
  });
  return true;
}
