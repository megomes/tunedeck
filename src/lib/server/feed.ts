import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { INSTRUMENT_LABEL, STATUSES, STATUS_LABEL, type Snapshot } from "@/lib/shared/types";

/**
 * Read-only repertoire feed behind a secret link, meant to be handed to an AI agent.
 * The token lives in app_settings under a key that is never synced to clients,
 * exported in backups or writable through ops.
 */
export const FEED_TOKEN_KEY = "feedToken";

export async function getFeedToken(): Promise<string | null> {
  const [row] = await db()
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, FEED_TOKEN_KEY))
    .limit(1);
  return typeof row?.value === "string" ? row.value : null;
}

/** Creates a new token, invalidating any link shared before. */
export async function rotateFeedToken(): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const now = new Date().toISOString();
  await db()
    .insert(schema.appSettings)
    .values({ key: FEED_TOKEN_KEY, value: token, updatedAt: now })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: token, updatedAt: now } });
  return token;
}

export async function disableFeed() {
  await db().delete(schema.appSettings).where(eq(schema.appSettings.key, FEED_TOKEN_KEY));
}

export async function checkFeedToken(given: string): Promise<boolean> {
  const expected = await getFeedToken();
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface FeedSong {
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  bpm: number | null;
  instrument: string;
  /** Riff-only songs: just some riffs are learned, the song's status is not used. */
  riffOnly: boolean;
  status: string;
  tuning: string | null;
  capo: number | null;
  /** 0–5 */
  difficulty: number | null;
  favorite: boolean;
  tags: string[];
  /** Parts learned on their own, each with its own status. */
  riffs: { name: string; status: string }[];
  playCount: number;
  lastPlayedAt: string | null;
  addedAt: string;
}

export interface Feed {
  app: "tunedeck";
  generatedAt: string;
  statuses: Record<string, string>;
  summary: {
    songs: number;
    /** Whole songs only; riff-only songs are counted apart. */
    byStatus: Record<string, number>;
    riffOnlySongs: number;
    byInstrument: Record<string, number>;
    byTuning: Record<string, number>;
  };
  songs: FeedSong[];
}

const count = (xs: (string | null)[]) =>
  xs.reduce<Record<string, number>>((acc, x) => {
    const k = x ?? "Unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

/** Songs only: no video links, files or settings leave the app. */
export function buildFeed(snap: Snapshot): Feed {
  const songs = new Map(snap.songs.map((s) => [s.id, s]));
  const tagNames = new Map(snap.tags.map((t) => [t.id, t.name]));
  const order = (s: string) => STATUSES.indexOf(s as (typeof STATUSES)[number]);

  const list: FeedSong[] = snap.entries
    .map((e) => {
      const song = songs.get(e.songId);
      return {
        title: song?.title ?? "",
        artist: song?.artist ?? "",
        album: song?.album ?? null,
        genre: song?.genre ?? null,
        bpm: song?.bpm ?? null,
        instrument: INSTRUMENT_LABEL[e.instrument] ?? e.instrument,
        riffOnly: !!e.riffOnly,
        status: e.status,
        tuning: e.tuning,
        capo: e.capo,
        difficulty: e.difficulty,
        favorite: e.isFavorite,
        tags: snap.entryTags
          .filter((t) => t.repertoireEntryId === e.id)
          .map((t) => tagNames.get(t.tagId))
          .filter((n): n is string => !!n),
        riffs: snap.riffs.filter((r) => r.repertoireEntryId === e.id).map((r) => ({ name: r.name, status: r.status })),
        playCount: e.playCount,
        lastPlayedAt: e.lastPlayedAt,
        addedAt: e.createdAt,
      };
    })
    .sort((a, b) => order(a.status) - order(b.status) || a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));

  return {
    app: "tunedeck",
    generatedAt: new Date().toISOString(),
    statuses: STATUS_LABEL,
    summary: {
      songs: list.length,
      byStatus: count(list.filter((s) => !s.riffOnly).map((s) => s.status)),
      riffOnlySongs: list.filter((s) => s.riffOnly).length,
      byInstrument: count(list.map((s) => s.instrument)),
      byTuning: count(list.map((s) => s.tuning)),
    },
    songs: list,
  };
}

/** Same data as Markdown, which chat agents read more reliably than large JSON. */
export function feedToMarkdown(feed: Feed): string {
  const lines = [
    "# My TuneDeck repertoire",
    "",
    `Generated ${feed.generatedAt}. ${feed.summary.songs} songs.`,
    "",
    "Statuses: Backlog (saved videos, maybe someday) → Up Next (short queue of the next songs to learn) → Learning (practicing now) → Can Play → Mastered; Archived is parked.",
    "Riffs are parts of a song (intro, solo…) learned on their own, each with its own status, independent of the song's status.",
    "",
  ];
  const groups: [string, FeedSong[]][] = [
    ...STATUSES.map((st): [string, FeedSong[]] => [STATUS_LABEL[st], feed.songs.filter((s) => !s.riffOnly && s.status === st)]),
    ["Just riffs (not learning the whole song)", feed.songs.filter((s) => s.riffOnly)],
  ];
  for (const [title, group] of groups) {
    if (!group.length) continue;
    lines.push(`## ${title} (${group.length})`, "");
    for (const s of group) {
      const details = [
        s.instrument,
        s.tuning,
        s.capo ? `capo ${s.capo}` : null,
        s.genre,
        s.bpm ? `${s.bpm} BPM` : null,
        s.difficulty != null ? `difficulty ${s.difficulty}/5` : null,
        s.tags.length ? `tags: ${s.tags.join(", ")}` : null,
        s.riffs.length ? `riffs: ${s.riffs.map((r) => `${r.name} (${STATUS_LABEL[r.status as (typeof STATUSES)[number]] ?? r.status})`).join(", ")}` : null,
        s.playCount ? `played ${s.playCount}×` : null,
        s.favorite ? "favorite" : null,
      ].filter(Boolean);
      lines.push(`- **${s.title}**${s.artist ? ` — ${s.artist}` : ""} · ${details.join(" · ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
