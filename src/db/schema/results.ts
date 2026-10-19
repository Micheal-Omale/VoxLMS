import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, id, updatedAt } from "./columns";
import { ratingKind } from "./enums";
import { assessmentComponent, classSubject, school, section } from "./school";
import { enrolment } from "./students";

const schoolId = () =>
  uuid("school_id")
    .notNull()
    .references((): AnyPgColumn => school.id);

/**
 * One part (CA 1, Exam…) of one subject for one student in one term.
 * No row means the score is missing; it is never stored as 0.
 * The copies of class, session and section let composite keys refuse a score
 * whose subject, part and enrolment don't belong together.
 */
export const score = pgTable(
  "score",
  {
    id: id(),
    schoolId: schoolId(),
    enrolmentId: uuid("enrolment_id").notNull(),
    classSubjectId: uuid("class_subject_id").notNull(),
    componentId: uuid("component_id").notNull(),
    classId: uuid("class_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    sectionId: uuid("section_id").notNull(),
    value: numeric("value", { precision: 5, scale: 1 }).notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("score_value_range", sql`${t.value} >= 0 and ${t.value} <= 100`),
    unique("score_enrolment_subject_component_key").on(
      t.enrolmentId,
      t.classSubjectId,
      t.componentId,
    ),
    index("score_class_subject_idx").on(t.classSubjectId),
    foreignKey({
      name: "score_enrolment_fk",
      columns: [t.schoolId, t.enrolmentId, t.classId, t.sessionId, t.sectionId],
      foreignColumns: [
        enrolment.schoolId,
        enrolment.id,
        enrolment.classId,
        enrolment.sessionId,
        enrolment.sectionId,
      ],
    }),
    foreignKey({
      name: "score_class_subject_fk",
      columns: [t.schoolId, t.classSubjectId, t.classId, t.sessionId, t.sectionId],
      foreignColumns: [
        classSubject.schoolId,
        classSubject.id,
        classSubject.classId,
        classSubject.sessionId,
        classSubject.sectionId,
      ],
    }),
    foreignKey({
      name: "score_component_fk",
      columns: [t.schoolId, t.componentId, t.sectionId, t.sessionId],
      foreignColumns: [
        assessmentComponent.schoolId,
        assessmentComponent.id,
        assessmentComponent.sectionId,
        assessmentComponent.sessionId,
      ],
    }),
  ],
);

/** Add only: every score insert, change or removal, grouped by save. */
export const scoreChange = pgTable(
  "score_change",
  {
    id: id(),
    schoolId: schoolId(),
    saveId: uuid("save_id").notNull(),
    enrolmentId: uuid("enrolment_id").notNull(),
    classSubjectId: uuid("class_subject_id").notNull(),
    componentId: uuid("component_id").notNull(),
    oldValue: numeric("old_value", { precision: 5, scale: 1 }),
    newValue: numeric("new_value", { precision: 5, scale: 1 }),
    changedBy: text("changed_by").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("score_change_enrolment_idx").on(t.enrolmentId),
    index("score_change_save_idx").on(t.saveId),
    foreignKey({
      name: "score_change_enrolment_fk",
      columns: [t.schoolId, t.enrolmentId],
      foreignColumns: [enrolment.schoolId, enrolment.id],
    }),
    foreignKey({
      name: "score_change_class_subject_fk",
      columns: [t.schoolId, t.classSubjectId],
      foreignColumns: [classSubject.schoolId, classSubject.id],
    }),
    foreignKey({
      name: "score_change_component_fk",
      columns: [t.schoolId, t.componentId],
      foreignColumns: [assessmentComponent.schoolId, assessmentComponent.id],
    }),
  ],
);

/**
 * Remarks and attendance for a student in a term. A null `head_remark` means
 * the head's comment is automatic, worked out from the bands when read (spec 0011).
 */
export const termReport = pgTable(
  "term_report",
  {
    id: id(),
    schoolId: schoolId(),
    enrolmentId: uuid("enrolment_id").notNull(),
    teacherRemark: text("teacher_remark"),
    headRemark: text("head_remark"),
    daysPresent: smallint("days_present"),
    updatedBy: text("updated_by").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("term_report_enrolment_key").on(t.enrolmentId),
    check("term_report_days_present_positive", sql`${t.daysPresent} is null or ${t.daysPresent} >= 0`),
    check("term_report_teacher_remark_length", sql`char_length(${t.teacherRemark}) <= 200`),
    check("term_report_head_remark_length", sql`char_length(${t.headRemark}) <= 200`),
    foreignKey({
      name: "term_report_enrolment_fk",
      columns: [t.schoolId, t.enrolmentId],
      foreignColumns: [enrolment.schoolId, enrolment.id],
    }),
  ],
);

/**
 * A school's wording for the automatic head's comment (spec 0011): a student
 * gets the remark of the highest band whose lowest average they reach.
 */
export const headRemarkBand = pgTable(
  "head_remark_band",
  {
    id: id(),
    schoolId: schoolId(),
    minAverage: numeric("min_average", { precision: 5, scale: 2 }).notNull(),
    remark: text("remark").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("head_remark_band_school_min_key").on(t.schoolId, t.minAverage),
    check("head_remark_band_min_range", sql`${t.minAverage} between 0 and 100`),
    check("head_remark_band_remark_length", sql`char_length(${t.remark}) between 1 and 200`),
  ],
);

/** A behaviour or skill rated 1 to 5. Never renamed once used; retired instead. */
export const ratingTrait = pgTable(
  "rating_trait",
  {
    id: id(),
    schoolId: schoolId(),
    sectionId: uuid("section_id"),
    kind: ratingKind("kind").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("rating_trait_school_kind_name_key").on(t.schoolId, t.kind, t.name),
    unique("rating_trait_school_id_key").on(t.schoolId, t.id),
    foreignKey({
      name: "rating_trait_section_fk",
      columns: [t.schoolId, t.sectionId],
      foreignColumns: [section.schoolId, section.id],
    }),
  ],
);

export const rating = pgTable(
  "rating",
  {
    id: id(),
    schoolId: schoolId(),
    enrolmentId: uuid("enrolment_id").notNull(),
    traitId: uuid("trait_id").notNull(),
    value: smallint("value").notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("rating_enrolment_trait_key").on(t.enrolmentId, t.traitId),
    check("rating_value_range", sql`${t.value} between 1 and 5`),
    foreignKey({
      name: "rating_enrolment_fk",
      columns: [t.schoolId, t.enrolmentId],
      foreignColumns: [enrolment.schoolId, enrolment.id],
    }),
    foreignKey({
      name: "rating_trait_fk",
      columns: [t.schoolId, t.traitId],
      foreignColumns: [ratingTrait.schoolId, ratingTrait.id],
    }),
  ],
);
