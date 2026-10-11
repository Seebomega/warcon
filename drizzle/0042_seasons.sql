CREATE TABLE IF NOT EXISTS "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "board_opens" text DEFAULT 'official' NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		 WHERE conrelid = 'seasons'::regclass
		   AND conname = 'seasons_org_id_organizations_id_fk'
	) THEN
		ALTER TABLE "seasons" ADD CONSTRAINT "seasons_org_id_organizations_id_fk"
			FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seasons_org_start_uidx" ON "seasons" USING btree ("org_id","starts_at");
