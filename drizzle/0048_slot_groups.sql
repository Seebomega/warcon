-- Migration 0048 preserves existing organisation lists as each kind's default.
DROP INDEX IF EXISTS "lists_org_kind_name_uidx";--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "on_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "on_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "every_server" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
-- the org lists there are, one per kind (checked on the hosted panel 2026-10-09), are its defaults
UPDATE "lists" SET "is_default" = true WHERE "server_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lists_org_default_uidx" ON "lists" USING btree ("org_id","kind") WHERE "lists"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lists_org_kind_name_uidx" ON "lists" USING btree ("org_id","kind",lower("name")) WHERE "lists"."server_id" is null and "lists"."archived_at" is null;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lists'::regclass AND conname = 'lists_group_kind') THEN
		ALTER TABLE "lists" ADD CONSTRAINT "lists_group_kind"
			CHECK ("lists"."server_id" is not null or "lists"."is_default" or "lists"."kind" = 'reserve');
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lists'::regclass AND conname = 'lists_group_shape') THEN
		ALTER TABLE "lists" ADD CONSTRAINT "lists_group_shape"
			CHECK (("lists"."server_id" is null and not "lists"."is_default") or ("lists"."on_from" is null and "lists"."on_until" is null and "lists"."every_server" and "lists"."archived_at" is null));
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'lists'::regclass AND conname = 'lists_window') THEN
		ALTER TABLE "lists" ADD CONSTRAINT "lists_window"
			CHECK ("lists"."on_from" is null or "lists"."on_until" is null or "lists"."on_from" < "lists"."on_until");
	END IF;
END $$;
