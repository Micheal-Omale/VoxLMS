import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, id, updatedAt } from "./columns";
import { gender, guardianRelationship, studentStatus } from "./enums";
import { academicSession, asset, importRunLink, school, schoolClass, schoolSubject, term } from "./school";

const schoolId = () =>
  uuid("school_id")
    .notNull()
    .references((): AnyPgColumn => school.id);

/** Never deleted: a student who leaves is marked left or graduated (spec 0003, AC-10). */
export const student = pgTable(
  "student",
  {
    id: id(),
    schoolId: schoolId(),
    /** VoxLMS student number, shown as the school code plus four digits (GHS-0123). */
    studentNo: integer("student_no").notNull(),
    /** The school's own admission number, if it has one. */
    admissionNo: text("admission_no"),
    surname: text("surname").notNull(),
    otherNames: text("other_names").notNull(),
    gender: gender("gender").notNull(),
    dateOfBirth: date("date_of_birth"),
    house: text("house"),
    photoAssetId: uuid("photo_asset_id"),
    status: studentStatus("status").notNull().default("active"),
    leftOn: date("left_on"),
    /** The import that added them (spec 0013); null when typed in. */
    importRunId: uuid("import_run_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("student_school_number_key").on(t.schoolId, t.studentNo),
    // Spec 0008, AC-6: unique ignoring case and spaces, the same way the app compares
    // (normaliseAdmissionNo). Schools without admission numbers leave it null.
    uniqueIndex("student_school_admission_norm_key")
      .on(t.schoolId, sql`upper(regexp_replace(${t.admissionNo}, '\\s', '', 'g'))`)
      .where(sql`${t.admissionNo} is not null`),
    unique("student_school_id_key").on(t.schoolId, t.id),
    check("student_left_on_matches_status", sql`(${t.status} = 'active') = (${t.leftOn} is null)`),
    foreignKey({
      name: "student_photo_fk",
      columns: [t.schoolId, t.photoAssetId],
      foreignColumns: [asset.schoolId, asset.id],
    }),
    importRunLink("student_import_run_fk", t.schoolId, t.importRunId),
    index("student_import_run_idx").on(t.importRunId).where(sql`${t.importRunId} is not null`),
  ],
);

/** A parent or guardian; one record can be linked to several children. */
export const guardian = pgTable(
  "guardian",
  {
    id: id(),
    schoolId: schoolId(),
    fullName: text("full_name").notNull(),
    // Normalised +234 format. Not unique: parents often share one phone.
    phone: text("phone").notNull(),
    whatsappConsent: boolean("whatsapp_consent").notNull().default(false),
    consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true }),
    /** The import that created this parent (spec 0013); a parent it only linked keeps null. */
    importRunId: uuid("import_run_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("guardian_school_id_key").on(t.schoolId, t.id),
    index("guardian_school_phone_idx").on(t.schoolId, t.phone),
    check(
      "guardian_consent_has_date",
      sql`not ${t.whatsappConsent} or ${t.consentRecordedAt} is not null`,
    ),
    importRunLink("guardian_import_run_fk", t.schoolId, t.importRunId),
    index("guardian_import_run_idx").on(t.importRunId).where(sql`${t.importRunId} is not null`),
  ],
);

export const studentGuardian = pgTable(
  "student_guardian",
  {
    schoolId: schoolId(),
    studentId: uuid("student_id").notNull(),
    guardianId: uuid("guardian_id").notNull(),
    relationship: guardianRelationship("relationship").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "student_guardian_pk", columns: [t.studentId, t.guardianId] }),
    uniqueIndex("student_guardian_one_primary").on(t.studentId).where(sql`${t.isPrimary}`),
    foreignKey({
      name: "student_guardian_student_fk",
      columns: [t.schoolId, t.studentId],
      foreignColumns: [student.schoolId, student.id],
    }),
    foreignKey({
      name: "student_guardian_guardian_fk",
      columns: [t.schoolId, t.guardianId],
      foreignColumns: [guardian.schoolId, guardian.id],
    }),
  ],
);

/**
 * Which class a student is in for a term. Carries the term's session and the
 * class's section so scores can be tied to the same class, session and section.
 */
export const enrolment = pgTable(
  "enrolment",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id").notNull(),
    termId: uuid("term_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    classId: uuid("class_id").notNull(),
    sectionId: uuid("section_id").notNull(),
    withdrawnOn: date("withdrawn_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("enrolment_student_term_key").on(t.studentId, t.termId),
    unique("enrolment_school_id_key").on(t.schoolId, t.id),
    unique("enrolment_match_key").on(t.schoolId, t.id, t.classId, t.sessionId, t.sectionId),
    index("enrolment_term_class_idx").on(t.termId, t.classId),
    foreignKey({
      name: "enrolment_student_fk",
      columns: [t.schoolId, t.studentId],
      foreignColumns: [student.schoolId, student.id],
    }),
    foreignKey({
      name: "enrolment_term_fk",
      columns: [t.schoolId, t.termId, t.sessionId],
      foreignColumns: [term.schoolId, term.id, term.sessionId],
    }),
    foreignKey({
      name: "enrolment_class_fk",
      columns: [t.schoolId, t.classId, t.sectionId],
      foreignColumns: [schoolClass.schoolId, schoolClass.id, schoolClass.sectionId],
    }),
  ],
);

/** A senior student's elective, per subject and session, so it survives a change of arm. */
export const studentElective = pgTable(
  "student_elective",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("student_elective_key").on(t.studentId, t.sessionId, t.subjectId),
    foreignKey({
      name: "student_elective_student_fk",
      columns: [t.schoolId, t.studentId],
      foreignColumns: [student.schoolId, student.id],
    }),
    foreignKey({
      name: "student_elective_session_fk",
      columns: [t.schoolId, t.sessionId],
      foreignColumns: [academicSession.schoolId, academicSession.id],
    }),
    foreignKey({
      name: "student_elective_subject_fk",
      columns: [t.schoolId, t.subjectId],
      foreignColumns: [schoolSubject.schoolId, schoolSubject.id],
    }),
  ],
);
