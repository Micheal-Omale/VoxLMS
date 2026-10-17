-- Spec 0006: one subject order per school, switching subjects off, unique short names.
-- Existing subjects are numbered per school in name order.
ALTER TABLE "school_subject" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "school_subject" s SET "sort_order" = numbered.n
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "school_id" ORDER BY "name", "id")::integer AS n
  FROM "school_subject"
) numbered
WHERE numbered."id" = s."id";--> statement-breakpoint
ALTER TABLE "school_subject" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "school_subject" ADD CONSTRAINT "subject_school_short_name_key" UNIQUE("school_id","short_name");
