ALTER TABLE "server_reserved" ADD COLUMN IF NOT EXISTS "configured" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "server_reserved" ADD COLUMN IF NOT EXISTS "live" boolean DEFAULT true NOT NULL;
