-- Spec 0003 update: VoxLMS student numbers, a school code, optional admission numbers.
-- Columns are added empty, filled for existing rows, then made required.
ALTER TABLE "student" ALTER COLUMN "admission_no" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "code" text;--> statement-breakpoint
UPDATE "school" SET "code" = left(upper(regexp_replace("slug", '[^a-z]', '', 'g')) || 'XX', 3);--> statement-breakpoint
ALTER TABLE "school" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "student_no_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student" ADD COLUMN "student_no" integer;--> statement-breakpoint
UPDATE "student" s SET "student_no" = numbered.n
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "school_id" ORDER BY "created_at", "id")::integer AS n
  FROM "student"
) numbered
WHERE numbered."id" = s."id";--> statement-breakpoint
UPDATE "school" sc SET "student_no_counter" = coalesce((SELECT max("student_no") FROM "student" WHERE "school_id" = sc."id"), 0);--> statement-breakpoint
ALTER TABLE "student" ALTER COLUMN "student_no" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_school_number_key" UNIQUE("school_id","student_no");--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_code_format" CHECK ("school"."code" ~ '^[A-Z]{2,6}$');
