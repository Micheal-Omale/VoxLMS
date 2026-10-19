import { pgEnum } from "drizzle-orm/pg-core";

export const stage = pgEnum("stage", [
  "nursery",
  "primary",
  "junior_secondary",
  "senior_secondary",
]);

export const plan = pgEnum("plan", ["basic", "school_logo"]);

export const gender = pgEnum("gender", ["male", "female"]);

export const studentStatus = pgEnum("student_status", ["active", "left", "graduated"]);

export const staffRole = pgEnum("staff_role", ["teacher", "principal", "school_admin"]);

export const staffStatus = pgEnum("staff_status", ["active", "left"]);

export const guardianRelationship = pgEnum("guardian_relationship", [
  "mother",
  "father",
  "guardian",
]);

export const assetKind = pgEnum("asset_kind", ["logo", "signature", "stamp", "student_photo"]);

export const ratingKind = pgEnum("rating_kind", ["behaviour", "skill"]);

/** What an Excel import added (spec 0013). */
export const importKind = pgEnum("import_kind", ["students", "teachers"]);

/** Why a PIN slip PDF was made (spec 0014). */
export const pinRunKind = pgEnum("pin_run_kind", ["class", "replace", "remake"]);
