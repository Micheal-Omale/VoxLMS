CREATE TYPE "public"."pin_run_kind" AS ENUM('class', 'replace', 'remake');--> statement-breakpoint
CREATE TABLE "result_pin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"serial" integer NOT NULL,
	"pin_hash" "bytea" NOT NULL,
	"key_version" smallint DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaced_at" timestamp with time zone,
	"replaced_by" text,
	"first_viewed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "result_pin_hash_key" UNIQUE("pin_hash"),
	CONSTRAINT "result_pin_school_serial_key" UNIQUE("school_id","serial"),
	CONSTRAINT "result_pin_replaced_together" CHECK (("result_pin"."replaced_at" is null) = ("result_pin"."replaced_by" is null)),
	CONSTRAINT "result_pin_hash_length" CHECK (octet_length("result_pin"."pin_hash") = 32),
	CONSTRAINT "result_pin_view_count_positive" CHECK ("result_pin"."view_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "result_pin_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"kind" "pin_run_kind" NOT NULL,
	"slip_count" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_pin_run_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "result_pin_run_slip_count_positive" CHECK ("result_pin_run"."slip_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "pin_serial_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "term" ADD COLUMN "results_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "term" ADD COLUMN "results_released_by" text;--> statement-breakpoint
ALTER TABLE "result_pin" ADD CONSTRAINT "result_pin_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_pin" ADD CONSTRAINT "result_pin_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_pin" ADD CONSTRAINT "result_pin_replaced_by_user_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_pin" ADD CONSTRAINT "result_pin_enrolment_fk" FOREIGN KEY ("school_id","enrolment_id") REFERENCES "public"."enrolment"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_pin" ADD CONSTRAINT "result_pin_run_fk" FOREIGN KEY ("school_id","run_id") REFERENCES "public"."result_pin_run"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_pin_run" ADD CONSTRAINT "result_pin_run_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_pin_run" ADD CONSTRAINT "result_pin_run_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_pin_run" ADD CONSTRAINT "result_pin_run_term_fk" FOREIGN KEY ("school_id","term_id") REFERENCES "public"."term"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_pin_run" ADD CONSTRAINT "result_pin_run_class_fk" FOREIGN KEY ("school_id","class_id") REFERENCES "public"."class"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "result_pin_one_live_per_enrolment" ON "result_pin" USING btree ("enrolment_id") WHERE "result_pin"."replaced_at" is null;--> statement-breakpoint
CREATE INDEX "result_pin_run_idx" ON "result_pin" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "result_pin_run_term_class_idx" ON "result_pin_run" USING btree ("term_id","class_id");--> statement-breakpoint
ALTER TABLE "term" ADD CONSTRAINT "term_results_released_by_user_id_fk" FOREIGN KEY ("results_released_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term" ADD CONSTRAINT "term_released_together" CHECK (("term"."results_released_at" is null) = ("term"."results_released_by" is null));