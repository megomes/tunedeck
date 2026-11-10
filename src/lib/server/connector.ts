import "server-only";
import { randomUUID } from "node:crypto";
import { applyOps, loadSnapshot } from "@/lib/server/data";
import { enrichUrl, type YoutubeMeta } from "@/lib/server/enrich";
import { searchYoutube } from "@/lib/server/search";
import {
  INSTRUMENTS,
  RESOURCE_TYPES,
  STATUSES,
  STATUS_LABEL,
  UP_NEXT_MAX,
  type Entry,
  type Instrument,
  type Op,
  type Resource,
  type ResourceType,
  type Snapshot,
  type Status,
} from "@/lib/shared/types";
import { youtubeId, ytThumb, ytWatchUrl } from "@/lib/shared/urls";

// Tools of the TuneDeck connector for Claude (claude.ai → Settings → Connectors). The MCP
// plumbing lives in /api/mcp/[token]; this file is what each tool does.

export const SERVER_INSTRUCTIONS = `TuneDeck is the user's personal guitar repertoire app: every song has a status
(Backlog = saved to learn someday, Up Next = short queue of the next ${UP_NEXT_MAX} to learn, Learning, Can Play,
Mastered, Archived), YouTube videos of a few kinds (original, guitar_cover, lesson, backing_track) and a Songsterr tab.
When the user asks to add a song ("adiciona Misery Business no Backlog"), do it all without asking:
1. search_library to see if it is already there (then just add what is missing, or tell them its status).
2. search_youtube for the official song ("<artist> <title> official") and for a guitar cover
   ("<artist> <title> guitar cover"). Pick the official music video/audio from the artist's channel or Topic channel as
   "original", and the best full-song guitar cover as "guitar_cover" (prefer many views, on-screen tabs, the full song
   rather than a riff, solo or lesson). Add a "lesson" or "backing_track" only when asked, or when the status is
   Up Next / Learning.
3. Find the song's Songsterr page with your own web search ("<artist> <title> songsterr") and pass its URL as
   songsterrUrl (a songsterr.com/a/wsa/... link of the song itself, not a different version). Pass the guitar tuning
   too when you know it ("E Standard", "Eb Standard", "Drop D"...). TuneDeck does not query Songsterr itself.
4. add_song with the clean title and the original artist ("Misery Business", "Paramore"). Default status: Backlog;
   default instrument: guitar.
Reply briefly: what was added, which videos, the tab, the tuning.`;

type Args = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");

function asStatus(v: unknown): Status | null {
  const s = str(v).toUpperCase().replace(/[\s-]+/g, "_");
  if (!s) return null;
  if ((STATUSES as readonly string[]).includes(s)) return s as Status;
  const byLabel = STATUSES.find((k) => norm(STATUS_LABEL[k]) === norm(s));
  if (byLabel) return byLabel;
  throw new Error(`Unknown status "${v}". Use one of: ${STATUSES.join(", ")}`);
}

const topOf = (snap: Snapshot, status: Status, except?: string) => {
  const col = snap.entries.filter((e) => e.status === status && e.id !== except);
  return col.length ? Math.min(...col.map((e) => e.position ?? 0)) - 1 : 0;
};

function describe(snap: Snapshot, e: Entry) {
  const song = snap.songs.find((s) => s.id === e.songId);
  const videos = snap.resources.filter((r) => r.repertoireEntryId === e.id);
  return {
    entryId: e.id,
    title: song?.title ?? "",
    artist: song?.artist ?? "",
    instrument: e.instrument,
    status: STATUS_LABEL[e.status] ?? e.status,
    riffOnly: !!e.riffOnly,
    tuning: e.tuning,
    tab: e.songsterrUrl,
    videos: videos.map((r) => ({ type: r.type, title: r.title, channel: r.author, url: r.url })),
  };
}

// ---------- Tools ----------

async function searchLibrary(args: Args) {
  const snap = await loadSnapshot();
  const q = norm(str(args.query));
  const status = asStatus(args.status);
  const songs = new Map(snap.songs.map((s) => [s.id, s]));
  const found = snap.entries.filter((e) => {
    if (status && e.status !== status) return false;
    if (!q) return true;
    const s = songs.get(e.songId);
    return norm(`${s?.title} ${s?.artist}`).includes(q) || norm(`${s?.artist} ${s?.title}`).includes(q);
  });
  return {
    total: found.length,
    songs: found
      .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.position - b.position)
      .slice(0, 60)
      .map((e) => describe(snap, e)),
  };
}

async function searchYoutubeTool(args: Args) {
  const query = str(args.query);
  if (!query) throw new Error("query is required");
  const limit = Math.min(15, Math.max(1, Number(args.limit) || 8));
  return { videos: await searchYoutube(query, limit) };
}

async function addSong(args: Args, origin: string) {
  const title = str(args.title);
  const artist = str(args.artist);
  if (!title) throw new Error("title is required");
  const instrument = (str(args.instrument).toLowerCase() || "guitar") as Instrument;
  if (!INSTRUMENTS.includes(instrument)) throw new Error(`instrument must be one of ${INSTRUMENTS.join(", ")}`);
  const status = asStatus(args.status) ?? "BACKLOG";
  const videosIn = Array.isArray(args.videos) ? (args.videos as Args[]) : [];

  const snap = await loadSnapshot();
  const now = new Date().toISOString();
  const ops: Op[] = [];

  const song = snap.songs.find((s) => norm(s.title) === norm(title) && norm(s.artist) === norm(artist));
  let entry = song ? snap.entries.find((e) => e.songId === song.id && e.instrument === instrument) : undefined;
  const existed = !!entry;
  if (!entry) {
    const songId = song?.id ?? randomUUID();
    if (!song) {
      ops.push({
        t: "song.upsert",
        song: { id: songId, title, artist, album: null, genre: null, bpm: null, createdAt: now, updatedAt: now },
      });
    }
    entry = {
      id: randomUUID(), songId, instrument, status, tuning: null, capo: null, difficulty: null, songsterrUrl: null,
      playCount: 0, lastPlayedAt: null, isFavorite: false, riffOnly: false, position: topOf(snap, status),
      createdAt: now, updatedAt: now,
    };
  }
  const entryId = entry.id;

  // Videos: metadata in parallel, skipping the ones the song already has.
  const have = snap.resources.filter((r) => r.repertoireEntryId === entryId);
  const wanted = videosIn
    .map((v) => {
      const raw = str(v.url) || str(v.id);
      const id = youtubeId(raw) ?? (/^[\w-]{11}$/.test(raw) ? raw : null);
      if (!id) throw new Error(`Not a YouTube video: ${raw}`);
      const type = (str(v.type) || "guitar_cover") as ResourceType;
      if (!RESOURCE_TYPES.includes(type)) throw new Error(`video type must be one of ${RESOURCE_TYPES.join(", ")}`);
      return { id, type, label: str(v.label) || null };
    })
    .filter((v, i, all) => all.findIndex((w) => w.id === v.id) === i && !have.some((r) => r.externalId === v.id));
  const metas = await Promise.all(
    wanted.map((v) => enrichUrl(ytWatchUrl(v.id)).catch(() => null) as Promise<YoutubeMeta | null>),
  );
  const added: Resource[] = [];
  wanted.forEach((v, i) => {
    const meta = metas[i];
    const same = [...have, ...added].filter((r) => r.type === v.type);
    added.push({
      id: randomUUID(), repertoireEntryId: entryId, type: v.type, customLabel: v.type === "custom" ? v.label : null,
      provider: "youtube", url: ytWatchUrl(v.id), externalId: v.id, title: meta?.title ?? null,
      author: meta?.author ?? null, thumbnailUrl: meta?.thumbnailUrl ?? ytThumb(v.id),
      durationSeconds: meta?.durationSeconds ?? null, metaStatus: meta?.title ? "ok" : "pending",
      isPrimary: same.length === 0, sortOrder: same.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0),
      createdAt: now, updatedAt: now,
    });
  });

  // Tab and tuning: only what Claude passes, and never over what the song already has.
  let tabNote: string | null = null;
  const givenTab = str(args.songsterrUrl);
  const givenTuning = str(args.tuning) || null;
  const patch: Partial<Entry> = {};
  if (givenTab && !/^https:\/\/(www\.)?songsterr\.com\//.test(givenTab)) throw new Error("songsterrUrl must be a songsterr.com link");
  if (givenTab && !entry.songsterrUrl && instrument !== "piano") patch.songsterrUrl = givenTab;
  else if (!givenTab && !entry.songsterrUrl) tabNote = "No Songsterr tab: find the song's songsterr.com link and call add_song again with songsterrUrl.";
  if (givenTuning && !entry.tuning && instrument !== "piano") patch.tuning = givenTuning;
  if (!existed || Object.keys(patch).length) {
    entry = { ...entry, ...patch, updatedAt: now };
    ops.push({ t: "entry.upsert", entry });
  }
  for (const resource of added) ops.push({ t: "resource.upsert", resource });

  if (ops.length) {
    const result = await applyOps(ops);
    if (result.failed.length) throw new Error(`Could not save: ${result.failed.map((f) => f.error).join("; ")}`);
  }
  const after = { ...snap, entries: [...snap.entries.filter((e) => e.id !== entryId), entry], resources: [...snap.resources, ...added] };
  if (!song && !existed) after.songs = [...snap.songs, { id: entry.songId, title, artist, album: null, genre: null, bpm: null, createdAt: now, updatedAt: now }];
  return {
    result: existed
      ? `"${title}" was already in TuneDeck (${STATUS_LABEL[entry.status]}); its status was not changed.`
      : `Added "${title}" by ${artist || "unknown artist"} to ${STATUS_LABEL[status]}.`,
    videosAdded: added.length,
    note: tabNote,
    song: describe(after, entry),
    link: `${origin}/song?id=${entryId}`,
  };
}

async function updateSong(args: Args, origin: string) {
  const entryId = str(args.entryId);
  const status = asStatus(args.status);
  if (!entryId || !status) throw new Error("entryId and status are required");
  const snap = await loadSnapshot();
  const entry = snap.entries.find((e) => e.id === entryId);
  if (!entry) throw new Error("No song with that entryId: use search_library first.");
  if (status === "WANT_TO_PLAY" && entry.status !== status) {
    const queue = snap.entries.filter((e) => e.status === "WANT_TO_PLAY" && !e.riffOnly);
    if (queue.length >= UP_NEXT_MAX) {
      return {
        error: `Up Next is full (${UP_NEXT_MAX} songs). Ask the user which one goes back to Backlog, move it there first, then retry.`,
        upNext: queue.map((e) => describe(snap, e)),
      };
    }
  }
  const updated = { ...entry, status, position: topOf(snap, status, entry.id), updatedAt: new Date().toISOString() };
  await applyOps([{ t: "entry.upsert", entry: updated }]);
  return { result: `Moved to ${STATUS_LABEL[status]}.`, song: describe(snap, updated), link: `${origin}/song?id=${entryId}` };
}

// ---------- Catalog ----------

const statusEnum = { type: "string", enum: [...STATUSES], description: "BACKLOG, WANT_TO_PLAY (= Up Next), LEARNING, CAN_PLAY, MASTERED, ARCHIVED" };

export const TOOLS = [
  {
    name: "search_library",
    title: "Search my TuneDeck songs",
    description: "Lists songs in the user's TuneDeck library, optionally filtered by text (title/artist) and status, with their videos and tab.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Part of the title or artist" }, status: statusEnum },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search_youtube",
    title: "Search YouTube",
    description: "Searches YouTube videos. Returns id, url, title, channel, duration and views.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'e.g. "Paramore Misery Business guitar cover"' },
        limit: { type: "number", description: "1-15, default 8" },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "add_song",
    title: "Add a song to TuneDeck",
    description:
      "Adds a song with its YouTube videos, Songsterr tab and tuning to TuneDeck (top of the chosen status column). " +
      "If the song already exists, only the missing videos/tab are added and its status is kept.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Clean song title, no 'guitar cover', 'lyrics' etc." },
        artist: { type: "string", description: "Original artist" },
        status: { ...statusEnum, description: `Default BACKLOG. ${statusEnum.description}` },
        instrument: { type: "string", enum: [...INSTRUMENTS], description: "Default guitar" },
        videos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "YouTube URL or video id" },
              type: { type: "string", enum: [...RESOURCE_TYPES], description: "Default guitar_cover" },
            },
            required: ["url"],
          },
        },
        songsterrUrl: { type: "string", description: "The song's songsterr.com tab link, found with web search" },
        tuning: { type: "string", description: 'Guitar tuning, e.g. "E Standard", "Eb Standard", "Drop D"' },
      },
      required: ["title", "artist"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "update_song",
    title: "Move a song",
    description: "Changes a song's status (moves it to the top of that column). Get entryId from search_library.",
    inputSchema: {
      type: "object",
      properties: { entryId: { type: "string" }, status: statusEnum },
      required: ["entryId", "status"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
] as const;

export async function callTool(name: string, args: Args, origin: string): Promise<unknown> {
  switch (name) {
    case "search_library":
      return searchLibrary(args);
    case "search_youtube":
      return searchYoutubeTool(args);
    case "add_song":
      return addSong(args, origin);
    case "update_song":
      return updateSong(args, origin);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
