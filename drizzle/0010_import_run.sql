-- Spec 0013 (Excel import): each confirmed import is recorded as an import run, and
-- the students, parents, staff and form masters it added point back to it so it can be undone.
CREATE TYPE "public"."import_kind" AS ENUM('students', 'teachers');--> statement-breakpoint
CREATE TABLE "import_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" "import_kind" NOT NULL,
	"file_name" text NOT NULL,
	"term_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"counts" jsonb NOT NULL,
	"created_logins" text[] DEFAULT '{}'::text[] NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by" text,
	CONSTRAINT "import_run_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "import_run_file_name_length" CHECK (char_length("import_run"."file_name") between 1 and 200),
	CONSTRAINT "import_run_undone_together" CHECK (("import_run"."undone_at" is null) = ("import_run"."undone_by" is null))
);
--> statement-breakpoint
ALTER TABLE "class_teacher" ADD COLUMN "import_run_id" uuid;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "import_run_id" uuid;--> statement-breakpoint
ALTER TABLE "guardian" ADD COLUMN "import_run_id" uuid;--> statement-breakpoint
ALTER TABLE "student" ADD COLUMN "import_run_id" uuid;--> statement-breakpoint
ALTER TABLE "import_run" ADD CONSTRAINT "import_run_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_run" ADD CONSTRAINT "import_run_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_run" ADD CONSTRAINT "import_run_undone_by_user_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_run" ADD CONSTRAINT "import_run_term_fk" FOREIGN KEY ("school_id","term_id") REFERENCES "public"."term"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_run_list_idx" ON "import_run" USING btree ("school_id","kind","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_import_run_fk" FOREIGN KEY ("school_id","import_run_id") REFERENCES "public"."import_run"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_import_run_fk" FOREIGN KEY ("school_id","import_run_id") REFERENCES "public"."import_run"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_import_run_fk" FOREIGN KEY ("school_id","import_run_id") REFERENCES "public"."import_run"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_import_run_fk" FOREIGN KEY ("school_id","import_run_id") REFERENCES "public"."import_run"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_teacher_import_run_idx" ON "class_teacher" USING btree ("import_run_id") WHERE "class_teacher"."import_run_id" is not null;--> statement-breakpoint
CREATE INDEX "staff_import_run_idx" ON "staff" USING btree ("import_run_id") WHERE "staff"."import_run_id" is not null;--> statement-breakpoint
CREATE INDEX "guardian_import_run_idx" ON "guardian" USING btree ("import_run_id") WHERE "guardian"."import_run_id" is not null;--> statement-breakpoint
CREATE INDEX "student_import_run_idx" ON "student" USING btree ("import_run_id") WHERE "student"."import_run_id" is not null;