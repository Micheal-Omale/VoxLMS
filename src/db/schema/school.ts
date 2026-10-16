import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { bytea, createdAt, id, updatedAt } from "./columns";
import { user } from "./auth";
import { assetKind, plan, stage, staffRole, staffStatus } from "./enums";
import { standardLevel, standardSubject } from "./standard";

// School setup (spec 0003). Every table carries school_id, and every link
// between school tables includes it, so the database refuses cross-school rows.

const schoolId = () =>
  uuid("school_id")
    .notNull()
    .references((): AnyPgColumn => school.id);

export const school = pgTable(
  "school",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    /** 2 to 6 capital letters, e.g. GHS: prefixes student numbers and PIN slips. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    motto: text("motto"),
    phone: text("phone"),
    email: text("email"),
    plan: plan("plan").notNull().default("basic"),
    /** Report cards show the attendance box (times opened, present, absent). Off for the pilot. */
    showAttendance: boolean("show_attendance").notNull().default(false),
    logoAssetId: uuid("logo_asset_id"),
    /** Last student number handed out; only ever increases (see allocateStudentNumbers). */
    studentNoCounter: integer("student_no_counter").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("school_slug_format", sql`${t.slug} ~ '^[a-z0-9]{3,30}$'`),
    check("school_code_format", sql`${t.code} ~ '^[A-Z]{2,6}$'`),
    // The school row's own id is its school_id. Insert the school first, the logo after.
    foreignKey({
      name: "school_logo_fk",
      columns: [t.id, t.logoAssetId],
      foreignColumns: [asset.schoolId, asset.id],
    }),
  ],
);

export const asset = pgTable(
  "asset",
  {
    id: id(),
    schoolId: schoolId(),
    kind: assetKind("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: bytea("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("asset_school_id_key").on(t.schoolId, t.id)],
);

/** One section is exactly one stage (Primary, Junior Secondary, Senior Secondary). */
export const section = pgTable(
  "section",
  {
    id: id(),
    schoolId: schoolId(),
    stage: stage("stage").notNull(),
    name: text("name").notNull(),
    teacherTitle: text("teacher_title").notNull(),
    headTitle: text("head_title").notNull(),
    headName: text("head_name"),
    headSignatureAssetId: uuid("head_signature_asset_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("section_school_name_key").on(t.schoolId, t.name),
    unique("section_school_id_key").on(t.schoolId, t.id),
    unique("section_school_id_stage_key").on(t.schoolId, t.id, t.stage),
    foreignKey({
      name: "section_signature_fk",
      columns: [t.schoolId, t.headSignatureAssetId],
      foreignColumns: [asset.schoolId, asset.id],
    }),
  ],
);

export const academicSession = pgTable(
  "academic_session",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("session_school_name_key").on(t.schoolId, t.name),
    unique("session_school_id_key").on(t.schoolId, t.id),
  ],
);

export const term = pgTable(
  "term",
  {
    id: id(),
    schoolId: schoolId(),
    sessionId: uuid("session_id").notNull(),
    number: smallint("number").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    nextTermBeginsOn: date("next_term_begins_on"),
    daysOpened: smallint("days_opened"),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("term_number_range", sql`${t.number} between 1 and 3`),
    check("term_days_opened_positive", sql`${t.daysOpened} is null or ${t.daysOpened} >= 0`),
    unique("term_session_number_key").on(t.sessionId, t.number),
    unique("term_school_id_key").on(t.schoolId, t.id),
    unique("term_school_id_session_key").on(t.schoolId, t.id, t.sessionId),
    uniqueIndex("term_one_current_per_school").on(t.schoolId).where(sql`${t.isCurrent}`),
    foreignKey({
      name: "term_session_fk",
      columns: [t.schoolId, t.sessionId],
      foreignColumns: [academicSession.schoolId, academicSession.id],
    }),
  ],
);

/** A class arm, e.g. JSS 2 Gold. Carries over between sessions. */
export const schoolClass = pgTable(
  "class",
  {
    id: id(),
    schoolId: schoolId(),
    sectionId: uuid("section_id").notNull(),
    stage: stage("stage").notNull(),
    standardLevelId: uuid("standard_level_id")
      .notNull()
      .references(() => standardLevel.id),
    arm: text("arm"),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("class_school_name_key").on(t.schoolId, t.name),
    unique("class_school_id_key").on(t.schoolId, t.id),
    unique("class_school_id_section_key").on(t.schoolId, t.id, t.sectionId),
    foreignKey({
      name: "class_section_stage_fk",
      columns: [t.schoolId, t.sectionId, t.stage],
      foreignColumns: [section.schoolId, section.id, section.stage],
    }),
  ],
);

export const schoolSubject = pgTable(
  "school_subject",
  {
    id: id(),
    schoolId: schoolId(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    standardSubjectId: uuid("standard_subject_id").references(() => standardSubject.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique("subject_school_name_key").on(t.schoolId, t.name),
    unique("subject_school_id_key").on(t.schoolId, t.id),
  ],
);

/** The score split for a section in a session, e.g. CA 1 /20, CA 2 /20, Exam /60. */
export const assessmentComponent = pgTable(
  "assessment_component",
  {
    id: id(),
    schoolId: schoolId(),
    sectionId: uuid("section_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    maxScore: numeric("max_score", { precision: 5, scale: 1 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check("component_max_range", sql`${t.maxScore} > 0 and ${t.maxScore} <= 100`),
    unique("component_section_session_key").on(t.sectionId, t.sessionId, t.key),
    unique("component_school_id_key").on(t.schoolId, t.id),
    unique("component_school_id_section_session_key").on(
      t.schoolId,
      t.id,
      t.sectionId,
      t.sessionId,
    ),
    foreignKey({
      name: "component_section_fk",
      columns: [t.schoolId, t.sectionId],
      foreignColumns: [section.schoolId, section.id],
    }),
    foreignKey({
      name: "component_session_fk",
      columns: [t.schoolId, t.sessionId],
      foreignColumns: [academicSession.schoolId, academicSession.id],
    }),
  ],
);

export const gradeBand = pgTable(
  "grade_band",
  {
    id: id(),
    schoolId: schoolId(),
    sectionId: uuid("section_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    grade: text("grade").notNull(),
    minScore: numeric("min_score", { precision: 5, scale: 1 }).notNull(),
    remark: text("remark").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("grade_min_range", sql`${t.minScore} >= 0 and ${t.minScore} <= 100`),
    unique("grade_section_session_grade_key").on(t.sectionId, t.sessionId, t.grade),
    unique("grade_section_session_min_key").on(t.sectionId, t.sessionId, t.minScore),
    foreignKey({
      name: "grade_section_fk",
      columns: [t.schoolId, t.sectionId],
      foreignColumns: [section.schoolId, section.id],
    }),
    foreignKey({
      name: "grade_session_fk",
      columns: [t.schoolId, t.sessionId],
      foreignColumns: [academicSession.schoolId, academicSession.id],
    }),
  ],
);

/** A subject a class offers in a session; electives are registered per student. */
export const classSubject = pgTable(
  "class_subject",
  {
    id: id(),
    schoolId: schoolId(),
    sessionId: uuid("session_id").notNull(),
    classId: uuid("class_id").notNull(),
    sectionId: uuid("section_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    isElective: boolean("is_elective").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("class_subject_session_class_subject_key").on(t.sessionId, t.classId, t.subjectId),
    unique("class_subject_school_id_key").on(t.schoolId, t.id),
    unique("class_subject_match_key").on(t.schoolId, t.id, t.classId, t.sessionId, t.sectionId),
    foreignKey({
      name: "class_subject_class_fk",
      columns: [t.schoolId, t.classId, t.sectionId],
      foreignColumns: [schoolClass.schoolId, schoolClass.id, schoolClass.sectionId],
    }),
    foreignKey({
      name: "class_subject_session_fk",
      columns: [t.schoolId, t.sessionId],
      foreignColumns: [academicSession.schoolId, academicSession.id],
    }),
    foreignKey({
      name: "class_subject_subject_fk",
      columns: [t.schoolId, t.subjectId],
      foreignColumns: [schoolSubject.schoolId, schoolSubject.id],
    }),
  ],
);

export const staff = pgTable(
  "staff",
  {
    id: id(),
    schoolId: schoolId(),
    title: text("title"),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    role: staffRole("role").notNull(),
    status: staffStatus("status").notNull().default("active"),
    /** Their VoxLMS login (spec 0004); one login can be staff in several schools. */
    userId: text("user_id").references((): AnyPgColumn => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("staff_school_phone_key").on(t.schoolId, t.phone),
    unique("staff_school_id_key").on(t.schoolId, t.id),
    unique("staff_school_user_key").on(t.schoolId, t.userId),
  ],
);

/** The form teacher (or class teacher) of a class for a session. */
export const classTeacher = pgTable(
  "class_teacher",
  {
    id: id(),
    schoolId: schoolId(),
    sessionId: uuid("session_id").notNull(),
    classId: uuid("class_id").notNull(),
    staffId: uuid("staff_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("class_teacher_session_class_key").on(t.sessionId, t.classId),
    foreignKey({
      name: "class_teacher_session_fk",
      columns: [t.schoolId, t.sessionId],
      foreignColumns: [academicSession.schoolId, academicSession.id],
    }),
    foreignKey({
      name: "class_teacher_class_fk",
      columns: [t.schoolId, t.classId],
      foreignColumns: [schoolClass.schoolId, schoolClass.id],
    }),
    foreignKey({
      name: "class_teacher_staff_fk",
      columns: [t.schoolId, t.staffId],
      foreignColumns: [staff.schoolId, staff.id],
    }),
  ],
);
