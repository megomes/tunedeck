import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

/** Canonical song metadata, shared by every instrument-specific repertoire entry. */
export const songs = pgTable("songs", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull().default(""),
  album: text("album"),
  genre: text("genre"),
  bpm: integer("bpm"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** The user's playable version of a song on one instrument. */
export const repertoireEntries = pgTable(
  "repertoire_entries",
  {
    id: uuid("id").primaryKey(),
    songId: uuid("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    instrument: text("instrument").notNull().default("guitar"),
    status: text("status").notNull().default("WANT_TO_PLAY"),
    tuning: text("tuning"),
    capo: integer("capo"),
    difficulty: integer("difficulty"),
    songsterrUrl: text("songsterr_url"),
    playCount: integer("play_count").notNull().default(0),
    lastPlayedAt: ts("last_played_at"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    /** Manual order inside its status column on the board (lower = higher up). */
    position: doublePrecision("position").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("repertoire_entries_song_instrument_uq").on(t.songId, t.instrument),
    index("repertoire_entries_status_idx").on(t.status),
  ],
);

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey(),
    repertoireEntryId: uuid("repertoire_entry_id")
      .notNull()
      .references(() => repertoireEntries.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("original"),
    customLabel: text("custom_label"),
    provider: text("provider").notNull().default("external"),
    url: text("url").notNull(),
    externalId: text("external_id"),
    title: text("title"),
    author: text("author"),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds"),
    metaStatus: text("meta_status").notNull().default("none"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("resources_entry_idx").on(t.repertoireEntryId)],
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const repertoireTags = pgTable(
  "repertoire_tags",
  {
    repertoireEntryId: uuid("repertoire_entry_id")
      .notNull()
      .references(() => repertoireEntries.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.repertoireEntryId, t.tagId] }), index("repertoire_tags_tag_idx").on(t.tagId)],
);

export const playEvents = pgTable(
  "play_events",
  {
    id: uuid("id").primaryKey(),
    repertoireEntryId: uuid("repertoire_entry_id")
      .notNull()
      .references(() => repertoireEntries.id, { onDelete: "cascade" }),
    playedAt: ts("played_at").notNull().defaultNow(),
  },
  (t) => [index("play_events_entry_idx").on(t.repertoireEntryId, t.playedAt)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey(),
    repertoireEntryId: uuid("repertoire_entry_id")
      .notNull()
      .references(() => repertoireEntries.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    filename: text("filename").notNull(),
    label: text("label"),
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("attachments_entry_idx").on(t.repertoireEntryId)],
);

/** Key/value app preferences synced across devices (default instrument, custom tunings…). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Device sessions created by the access-code login. */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  userAgent: text("user_agent"),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  revokedAt: ts("revoked_at"),
});

/** Cached external metadata (YouTube, Songsterr) so APIs are not called repeatedly. */
export const mediaCache = pgTable(
  "media_cache",
  {
    key: text("key").primaryKey(),
    data: jsonb("data").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
);

