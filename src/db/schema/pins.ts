import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, foreignKey, index, integer, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { bytea, createdAt, id } from "./columns";
import { pinRunKind } from "./enums";
import { school, schoolClass, term } from "./school";
import { enrolment } from "./students";

// Result PIN slips (spec 0014). Never deleted. The PIN itself is never
// stored: only its HMAC under RESULT_PIN_SECRET.

const schoolId = () =>
  uuid("school_id")
    .notNull()
    .references((): AnyPgColumn => school.id);

/** One slip PDF made: a class print, one replacement, or a remake of a print. */
export const resultPinRun = pgTable(
  "result_pin_run",
  {
    id: id(),
    schoolId: schoolId(),
    termId: uuid("term_id").notNull(),
    classId: uuid("class_id").notNull(),
    kind: pinRunKind("kind").notNull(),
    slipCount: integer("slip_count").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique("result_pin_run_school_id_key").on(t.schoolId, t.id),
    check("result_pin_run_slip_count_positive", sql`${t.slipCount} > 0`),
    index("result_pin_run_term_class_idx").on(t.termId, t.classId),
    foreignKey({ name: "result_pin_run_term_fk", columns: [t.schoolId, t.termId], foreignColumns: [term.schoolId, term.id] }),
    foreignKey({ name: "result_pin_run_class_fk", columns: [t.schoolId, t.classId], foreignColumns: [schoolClass.schoolId, schoolClass.id] }),
  ],
);

/** One slip ever made. At most one live (not replaced) slip per enrolment. */
export const resultPin = pgTable(
  "result_pin",
  {
    id: id(),
    schoolId: schoolId(),
    enrolmentId: uuid("enrolment_id").notNull(),
    runId: uuid("run_id").notNull(),
    serial: integer("serial").notNull(),
    pinHash: bytea("pin_hash").notNull(),
    /** Which secret made the hash, so a later key change can run old and new side by side. */
    keyVersion: smallint("key_version").notNull().default(1),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
    replacedBy: text("replaced_by").references(() => user.id),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
  },
  (t) => [
    unique("result_pin_hash_key").on(t.pinHash),
    unique("result_pin_school_serial_key").on(t.schoolId, t.serial),
    uniqueIndex("result_pin_one_live_per_enrolment").on(t.enrolmentId).where(sql`${t.replacedAt} is null`),
    index("result_pin_run_idx").on(t.runId),
    check("result_pin_replaced_together", sql`(${t.replacedAt} is null) = (${t.replacedBy} is null)`),
    check("result_pin_hash_length", sql`octet_length(${t.pinHash}) = 32`),
    check("result_pin_view_count_positive", sql`${t.viewCount} >= 0`),
    foreignKey({ name: "result_pin_enrolment_fk", columns: [t.schoolId, t.enrolmentId], foreignColumns: [enrolment.schoolId, enrolment.id] }),
    foreignKey({ name: "result_pin_run_fk", columns: [t.schoolId, t.runId], foreignColumns: [resultPinRun.schoolId, resultPinRun.id] }),
  ],
);
