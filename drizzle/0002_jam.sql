CREATE TABLE "jam_plays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"track_id" uuid NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jam_tracks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"video_id" text,
	"title" text NOT NULL,
	"author" text,
	"thumbnail_url" text,
	"duration_seconds" integer,
	"musical_key" text,
	"bpm" integer,
	"style" text,
	"time_signature" text,
	"notes" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone,
	"meta_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jam_plays" ADD CONSTRAINT "jam_plays_track_id_jam_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."jam_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jam_plays_track_idx" ON "jam_plays" USING btree ("track_id","played_at");