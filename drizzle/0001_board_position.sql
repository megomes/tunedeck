ALTER TABLE "repertoire_entries" ADD COLUMN "position" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "repertoire_entries" SET "position" = -extract(epoch from "created_at");
