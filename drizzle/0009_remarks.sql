-- Spec 0011 (remarks): each school's wording for the automatic principal's comment,
-- and the 200 character limit on both comments.
CREATE TABLE "head_remark_band" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"min_average" numeric(5, 2) NOT NULL,
	"remark" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "head_remark_band_school_min_key" UNIQUE("school_id","min_average"),
	CONSTRAINT "head_remark_band_min_range" CHECK ("head_remark_band"."min_average" between 0 and 100),
	CONSTRAINT "head_remark_band_remark_length" CHECK (char_length("head_remark_band"."remark") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "head_remark_band" ADD CONSTRAINT "head_remark_band_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_report" ADD CONSTRAINT "term_report_teacher_remark_length" CHECK (char_length("term_report"."teacher_remark") <= 200);--> statement-breakpoint
ALTER TABLE "term_report" ADD CONSTRAINT "term_report_head_remark_length" CHECK (char_length("term_report"."head_remark") <= 200);--> statement-breakpoint
-- Every existing school gets the 5 default bands (DEFAULT_REMARK_BANDS in src/lib/remarks.ts).
INSERT INTO "head_remark_band" ("school_id", "min_average", "remark")
SELECT s."id", d."min_average", d."remark"
FROM "school" s
CROSS JOIN (VALUES
	(70, 'An excellent result. Keep it up.'),
	(60, 'A very good result. Keep working hard.'),
	(50, 'A good result, with room to do even better.'),
	(40, 'A fair result. More effort is needed next term.'),
	(0, 'A weak result. Serious work is needed next term.')
) AS d("min_average", "remark");
