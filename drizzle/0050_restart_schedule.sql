ALTER TABLE "server_live" ADD COLUMN IF NOT EXISTS "restart_time_utc" text;--> statement-breakpoint
ALTER TABLE "server_live" ADD COLUMN IF NOT EXISTS "restart_time_utc_file" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN IF NOT EXISTS "restart_schedule" jsonb;
