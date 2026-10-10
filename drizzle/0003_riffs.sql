CREATE TABLE "riffs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repertoire_entry_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'LEARNING' NOT NULL,
	"marks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "riffs" ADD CONSTRAINT "riffs_repertoire_entry_id_repertoire_entries_id_fk" FOREIGN KEY ("repertoire_entry_id") REFERENCES "public"."repertoire_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "riffs_entry_idx" ON "riffs" USING btree ("repertoire_entry_id");