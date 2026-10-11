ALTER TABLE "webhooks" ADD COLUMN IF NOT EXISTS "trigger_kinds" jsonb;
