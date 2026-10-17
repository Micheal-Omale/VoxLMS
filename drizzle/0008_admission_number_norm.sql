-- Spec 0008, AC-6: admission numbers are unique within a school ignoring case and
-- spaces (GHS/24/015 and ghs/24/ 015 are the same number).
ALTER TABLE "student" DROP CONSTRAINT "student_school_admission_key";--> statement-breakpoint
CREATE UNIQUE INDEX "student_school_admission_norm_key" ON "student" USING btree ("school_id",upper(regexp_replace("admission_no", '\s', '', 'g'))) WHERE "student"."admission_no" is not null;