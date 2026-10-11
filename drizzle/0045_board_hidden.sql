ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "board_hidden" text[] DEFAULT '{}'::text[] NOT NULL;
