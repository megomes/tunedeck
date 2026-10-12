ALTER TABLE "repertoire_entries" ADD COLUMN "stars" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "repertoire_entries" ADD COLUMN "pick_score" integer DEFAULT 0 NOT NULL;