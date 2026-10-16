CREATE TYPE "public"."asset_kind" AS ENUM('logo', 'signature', 'stamp', 'student_photo');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."guardian_relationship" AS ENUM('mother', 'father', 'guardian');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('basic', 'school_logo');--> statement-breakpoint
CREATE TYPE "public"."rating_kind" AS ENUM('behaviour', 'skill');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('teacher', 'principal', 'school_admin');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('nursery', 'primary', 'junior_secondary', 'senior_secondary');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'left', 'graduated');--> statement-breakpoint
CREATE TABLE "standard_level" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"stage" "stage" NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "standard_level_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "standard_subject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "standard_subject_code_unique" UNIQUE("code"),
	CONSTRAINT "standard_subject_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "academic_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_school_name_key" UNIQUE("school_id","name"),
	CONSTRAINT "session_school_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "assessment_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"max_score" numeric(5, 1) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_section_session_key" UNIQUE("section_id","session_id","key"),
	CONSTRAINT "component_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "component_school_id_section_session_key" UNIQUE("school_id","id","section_id","session_id"),
	CONSTRAINT "component_max_range" CHECK ("assessment_component"."max_score" > 0 and "assessment_component"."max_score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_school_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "class_subject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"is_elective" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_subject_session_class_subject_key" UNIQUE("session_id","class_id","subject_id"),
	CONSTRAINT "class_subject_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "class_subject_match_key" UNIQUE("school_id","id","class_id","session_id","section_id")
);
--> statement-breakpoint
CREATE TABLE "class_teacher" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_teacher_session_class_key" UNIQUE("session_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "grade_band" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"min_score" numeric(5, 1) NOT NULL,
	"remark" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_section_session_grade_key" UNIQUE("section_id","session_id","grade"),
	CONSTRAINT "grade_section_session_min_key" UNIQUE("section_id","session_id","min_score"),
	CONSTRAINT "grade_min_range" CHECK ("grade_band"."min_score" >= 0 and "grade_band"."min_score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"motto" text,
	"phone" text,
	"email" text,
	"plan" "plan" DEFAULT 'basic' NOT NULL,
	"logo_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_slug_unique" UNIQUE("slug"),
	CONSTRAINT "school_slug_format" CHECK ("school"."slug" ~ '^[a-z0-9]{3,30}$')
);
--> statement-breakpoint
CREATE TABLE "class" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"stage" "stage" NOT NULL,
	"standard_level_id" uuid NOT NULL,
	"arm" text,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_school_name_key" UNIQUE("school_id","name"),
	CONSTRAINT "class_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "class_school_id_section_key" UNIQUE("school_id","id","section_id")
);
--> statement-breakpoint
CREATE TABLE "school_subject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"standard_subject_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_school_name_key" UNIQUE("school_id","name"),
	CONSTRAINT "subject_school_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"stage" "stage" NOT NULL,
	"name" text NOT NULL,
	"teacher_title" text NOT NULL,
	"head_title" text NOT NULL,
	"head_name" text,
	"head_signature_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_school_name_key" UNIQUE("school_id","name"),
	CONSTRAINT "section_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "section_school_id_stage_key" UNIQUE("school_id","id","stage")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_school_phone_key" UNIQUE("school_id","phone"),
	CONSTRAINT "staff_school_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "term" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"next_term_begins_on" date,
	"days_opened" smallint,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "term_session_number_key" UNIQUE("session_id","number"),
	CONSTRAINT "term_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "term_school_id_session_key" UNIQUE("school_id","id","session_id"),
	CONSTRAINT "term_number_range" CHECK ("term"."number" between 1 and 3),
	CONSTRAINT "term_days_opened_positive" CHECK ("term"."days_opened" is null or "term"."days_opened" >= 0)
);
--> statement-breakpoint
CREATE TABLE "enrolment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"withdrawn_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrolment_student_term_key" UNIQUE("student_id","term_id"),
	CONSTRAINT "enrolment_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "enrolment_match_key" UNIQUE("school_id","id","class_id","session_id","section_id")
);
--> statement-breakpoint
CREATE TABLE "guardian" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp_consent" boolean DEFAULT false NOT NULL,
	"consent_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "guardian_consent_has_date" CHECK (not "guardian"."whatsapp_consent" or "guardian"."consent_recorded_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"admission_no" text NOT NULL,
	"surname" text NOT NULL,
	"other_names" text NOT NULL,
	"gender" "gender" NOT NULL,
	"date_of_birth" date,
	"house" text,
	"photo_asset_id" uuid,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"left_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_school_admission_key" UNIQUE("school_id","admission_no"),
	CONSTRAINT "student_school_id_key" UNIQUE("school_id","id"),
	CONSTRAINT "student_left_on_matches_status" CHECK (("student"."status" = 'active') = ("student"."left_on" is null))
);
--> statement-breakpoint
CREATE TABLE "student_elective" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_elective_key" UNIQUE("student_id","session_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "student_guardian" (
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship" "guardian_relationship" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardian_pk" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"trait_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_enrolment_trait_key" UNIQUE("enrolment_id","trait_id"),
	CONSTRAINT "rating_value_range" CHECK ("rating"."value" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "rating_trait" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid,
	"kind" "rating_kind" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_trait_school_kind_name_key" UNIQUE("school_id","kind","name"),
	CONSTRAINT "rating_trait_school_id_key" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE "score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"value" numeric(5, 1) NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_enrolment_subject_component_key" UNIQUE("enrolment_id","class_subject_id","component_id"),
	CONSTRAINT "score_value_range" CHECK ("score"."value" >= 0 and "score"."value" <= 100)
);
--> statement-breakpoint
CREATE TABLE "score_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"save_id" uuid NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"old_value" numeric(5, 1),
	"new_value" numeric(5, 1),
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"teacher_remark" text,
	"head_remark" text,
	"days_present" smallint,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "term_report_enrolment_key" UNIQUE("enrolment_id"),
	CONSTRAINT "term_report_days_present_positive" CHECK ("term_report"."days_present" is null or "term_report"."days_present" >= 0)
);
--> statement-breakpoint
ALTER TABLE "academic_session" ADD CONSTRAINT "academic_session_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_component" ADD CONSTRAINT "assessment_component_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_component" ADD CONSTRAINT "component_section_fk" FOREIGN KEY ("school_id","section_id") REFERENCES "public"."section"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_component" ADD CONSTRAINT "component_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "public"."academic_session"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subject" ADD CONSTRAINT "class_subject_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subject" ADD CONSTRAINT "class_subject_class_fk" FOREIGN KEY ("school_id","class_id","section_id") REFERENCES "public"."class"("school_id","id","section_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subject" ADD CONSTRAINT "class_subject_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "public"."academic_session"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subject" ADD CONSTRAINT "class_subject_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."school_subject"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "public"."academic_session"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_class_fk" FOREIGN KEY ("school_id","class_id") REFERENCES "public"."class"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_staff_fk" FOREIGN KEY ("school_id","staff_id") REFERENCES "public"."staff"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_band" ADD CONSTRAINT "grade_band_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_band" ADD CONSTRAINT "grade_section_fk" FOREIGN KEY ("school_id","section_id") REFERENCES "public"."section"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_band" ADD CONSTRAINT "grade_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "public"."academic_session"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_logo_fk" FOREIGN KEY ("id","logo_asset_id") REFERENCES "public"."asset"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_standard_level_id_standard_level_id_fk" FOREIGN KEY ("standard_level_id") REFERENCES "public"."standard_level"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_section_stage_fk" FOREIGN KEY ("school_id","section_id","stage") REFERENCES "public"."section"("school_id","id","stage") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_subject" ADD CONSTRAINT "school_subject_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_subject" ADD CONSTRAINT "school_subject_standard_subject_id_standard_subject_id_fk" FOREIGN KEY ("standard_subject_id") REFERENCES "public"."standard_subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section" ADD CONSTRAINT "section_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section" ADD CONSTRAINT "section_signature_fk" FOREIGN KEY ("school_id","head_signature_asset_id") REFERENCES "public"."asset"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term" ADD CONSTRAINT "term_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term" ADD CONSTRAINT "term_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "public"."academic_session"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."student"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_term_fk" FOREIGN KEY ("school_id","term_id","session_id") REFERENCES "public"."term"("school_id","id","session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolment" ADD CONSTRAINT "enrolment_class_fk" FOREIGN KEY ("school_id","class_id","section_id") REFERENCES "public"."class"("school_id","id","section_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian" ADD CONSTRAINT "guardian_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_photo_fk" FOREIGN KEY ("school_id","photo_asset_id") REFERENCES "public"."asset"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_elective" ADD CONSTRAINT "student_elective_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_elective" ADD CONSTRAINT "student_elective_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."student"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_elective" ADD CONSTRAINT "student_elective_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "public"."academic_session"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_elective" ADD CONSTRAINT "student_elective_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."school_subject"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian" ADD CONSTRAINT "student_guardian_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian" ADD CONSTRAINT "student_guardian_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."student"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian" ADD CONSTRAINT "student_guardian_guardian_fk" FOREIGN KEY ("school_id","guardian_id") REFERENCES "public"."guardian"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_enrolment_fk" FOREIGN KEY ("school_id","enrolment_id") REFERENCES "public"."enrolment"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_trait_fk" FOREIGN KEY ("school_id","trait_id") REFERENCES "public"."rating_trait"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_trait" ADD CONSTRAINT "rating_trait_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_trait" ADD CONSTRAINT "rating_trait_section_fk" FOREIGN KEY ("school_id","section_id") REFERENCES "public"."section"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_enrolment_fk" FOREIGN KEY ("school_id","enrolment_id","class_id","session_id","section_id") REFERENCES "public"."enrolment"("school_id","id","class_id","session_id","section_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_class_subject_fk" FOREIGN KEY ("school_id","class_subject_id","class_id","session_id","section_id") REFERENCES "public"."class_subject"("school_id","id","class_id","session_id","section_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score" ADD CONSTRAINT "score_component_fk" FOREIGN KEY ("school_id","component_id","section_id","session_id") REFERENCES "public"."assessment_component"("school_id","id","section_id","session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_change" ADD CONSTRAINT "score_change_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_change" ADD CONSTRAINT "score_change_enrolment_fk" FOREIGN KEY ("school_id","enrolment_id") REFERENCES "public"."enrolment"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_change" ADD CONSTRAINT "score_change_class_subject_fk" FOREIGN KEY ("school_id","class_subject_id") REFERENCES "public"."class_subject"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_change" ADD CONSTRAINT "score_change_component_fk" FOREIGN KEY ("school_id","component_id") REFERENCES "public"."assessment_component"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_report" ADD CONSTRAINT "term_report_school_id_school_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."school"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_report" ADD CONSTRAINT "term_report_enrolment_fk" FOREIGN KEY ("school_id","enrolment_id") REFERENCES "public"."enrolment"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "term_one_current_per_school" ON "term" USING btree ("school_id") WHERE "term"."is_current";--> statement-breakpoint
CREATE INDEX "enrolment_term_class_idx" ON "enrolment" USING btree ("term_id","class_id");--> statement-breakpoint
CREATE INDEX "guardian_school_phone_idx" ON "guardian" USING btree ("school_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardian_one_primary" ON "student_guardian" USING btree ("student_id") WHERE "student_guardian"."is_primary";--> statement-breakpoint
CREATE INDEX "score_class_subject_idx" ON "score" USING btree ("class_subject_id");--> statement-breakpoint
CREATE INDEX "score_change_enrolment_idx" ON "score_change" USING btree ("enrolment_id");--> statement-breakpoint
CREATE INDEX "score_change_save_idx" ON "score_change" USING btree ("save_id");