CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repertoire_entry_id" uuid NOT NULL,
	"type" text NOT NULL,
	"filename" text NOT NULL,
	"label" text,
	"storage_key" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repertoire_entry_id" uuid NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repertoire_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"song_id" uuid NOT NULL,
	"instrument" text DEFAULT 'guitar' NOT NULL,
	"status" text DEFAULT 'WANT_TO_PLAY' NOT NULL,
	"tuning" text,
	"capo" integer,
	"difficulty" integer,
	"songsterr_url" text,
	"play_count" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repertoire_tags" (
	"repertoire_entry_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "repertoire_tags_repertoire_entry_id_tag_id_pk" PRIMARY KEY("repertoire_entry_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repertoire_entry_id" uuid NOT NULL,
	"type" text DEFAULT 'original' NOT NULL,
	"custom_label" text,
	"provider" text DEFAULT 'external' NOT NULL,
	"url" text NOT NULL,
	"external_id" text,
	"title" text,
	"author" text,
	"thumbnail_url" text,
	"duration_seconds" integer,
	"meta_status" text DEFAULT 'none' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text DEFAULT '' NOT NULL,
	"album" text,
	"genre" text,
	"bpm" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_repertoire_entry_id_repertoire_entries_id_fk" FOREIGN KEY ("repertoire_entry_id") REFERENCES "public"."repertoire_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_events" ADD CONSTRAINT "play_events_repertoire_entry_id_repertoire_entries_id_fk" FOREIGN KEY ("repertoire_entry_id") REFERENCES "public"."repertoire_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire_entries" ADD CONSTRAINT "repertoire_entries_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire_tags" ADD CONSTRAINT "repertoire_tags_repertoire_entry_id_repertoire_entries_id_fk" FOREIGN KEY ("repertoire_entry_id") REFERENCES "public"."repertoire_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repertoire_tags" ADD CONSTRAINT "repertoire_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_repertoire_entry_id_repertoire_entries_id_fk" FOREIGN KEY ("repertoire_entry_id") REFERENCES "public"."repertoire_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_entry_idx" ON "attachments" USING btree ("repertoire_entry_id");--> statement-breakpoint
CREATE INDEX "play_events_entry_idx" ON "play_events" USING btree ("repertoire_entry_id","played_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repertoire_entries_song_instrument_uq" ON "repertoire_entries" USING btree ("song_id","instrument");--> statement-breakpoint
CREATE INDEX "repertoire_entries_status_idx" ON "repertoire_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "repertoire_tags_tag_idx" ON "repertoire_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "resources_entry_idx" ON "resources" USING btree ("repertoire_entry_id");