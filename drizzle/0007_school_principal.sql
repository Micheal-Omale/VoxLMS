ALTER TABLE "school" ADD COLUMN "principal_title" text DEFAULT 'Principal' NOT NULL;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "principal_name" text;--> statement-breakpoint
ALTER TABLE "school" ADD COLUMN "principal_signature_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "school" ADD CONSTRAINT "school_principal_signature_fk" FOREIGN KEY ("id","principal_signature_asset_id") REFERENCES "public"."asset"("school_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Spec 0007: the earlier design's section_head table was applied on the dev
-- branch but never committed. Where it exists, drop it and the signature images
-- only it pointed at. On any other database this does nothing.
DO $$
DECLARE orphaned uuid[];
BEGIN
  IF to_regclass('public.section_head') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(array_agg(signature_asset_id), ''{}'') FROM section_head WHERE signature_asset_id IS NOT NULL' INTO orphaned;
    DROP TABLE section_head;
    DELETE FROM "asset" WHERE "id" = ANY(orphaned);
  END IF;
END $$;
