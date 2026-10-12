export const INSTRUMENTS = ["guitar", "bass", "piano"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

/** Board order: want → in progress → done, then the parked columns on the far right. */
export const STATUSES = ["WANT_TO_PLAY", "LEARNING", "CAN_PLAY", "MASTERED", "ARCHIVED", "BACKLOG"] as const;
export type Status = (typeof STATUSES)[number];
/** The Library board: everything but the Backlog, which has its own page. */
export const BOARD_STATUSES = STATUSES.filter((s) => s !== "BACKLOG");
/** Up Next (the Want to Play column) is a short queue: the songs pulled out of the Backlog to play next. */
export const UP_NEXT_MAX = 5;

export const RESOURCE_TYPES = [
  "original",
  "guitar_cover",
  "lesson",
  "backing_track",
  "standard_tuning",
  "custom",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type Provider = "youtube" | "songsterr" | "external";
export type MetaStatus = "none" | "pending" | "ok" | "failed";
export type AttachmentType = "pdf" | "midi";

export const DEFAULT_TUNINGS = [
  "E Standard",
  "Eb Standard",
  "Drop D",
  "D Standard",
  "Drop C#",
  "Drop C",
];

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  guitar: "Guitar",
  bass: "Bass",
  piano: "Piano",
};

export const STATUS_LABEL: Record<Status, string> = {
  WANT_TO_PLAY: "Up Next",
  LEARNING: "Learning",
  CAN_PLAY: "Can Play",
  MASTERED: "Mastered",
  ARCHIVED: "Archived",
  BACKLOG: "Backlog",
};

export const RESOURCE_LABEL: Record<ResourceType, string> = {
  original: "Original",
  guitar_cover: "Guitar Cover",
  lesson: "Lesson",
  backing_track: "Backing Track",
  standard_tuning: "Standard Tuning",
  custom: "Other",
};

/** Compact labels for the one-tap resource launcher. */
export const RESOURCE_SHORT: Record<ResourceType, string> = {
  original: "Original",
  guitar_cover: "Cover",
  lesson: "Lesson",
  backing_track: "Backing",
  standard_tuning: "Std tuning",
  custom: "Other",
};

export const TAG_COLORS = [
  "#FF2D2D",
  "#FF8A3D",
  "#F5C542",
  "#4CC38A",
  "#3DB8FF",
  "#7C6CFF",
  "#E062D6",
  "#B5B5B5",
];

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  bpm: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Entry {
  id: string;
  songId: string;
  instrument: Instrument;
  status: Status;
  tuning: string | null;
  capo: number | null;
  difficulty: number | null;
  songsterrUrl: string | null;
  playCount: number;
  lastPlayedAt: string | null;
  isFavorite: boolean;
  /** Only some riffs are learned, not the whole song: kept off the Library board, lives in Riffs. */
  riffOnly?: boolean;
  /** Manual order inside its status column (lower = higher up). */
  position: number;
  /** Where the favorite passage starts in each video, in seconds, keyed by resource id. */
  stars?: Record<string, number>;
  /** Up when picked in "What do I play now?", down when skipped. */
  pickScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Resource {
  id: string;
  repertoireEntryId: string;
  type: ResourceType;
  customLabel: string | null;
  provider: Provider;
  url: string;
  externalId: string | null;
  title: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  metaStatus: MetaStatus;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  createdAt: string;
}

export interface EntryTag {
  repertoireEntryId: string;
  tagId: string;
}

export interface PlayEvent {
  id: string;
  repertoireEntryId: string;
  playedAt: string;
}

export interface Attachment {
  id: string;
  repertoireEntryId: string;
  type: AttachmentType;
  filename: string;
  label: string | null;
  storageKey: string;
  sizeBytes: number;
  createdAt: string;
}

/** A backing track to jam over: one YouTube video plus musical info. */
export interface JamTrack {
  id: string;
  url: string;
  videoId: string | null;
  title: string;
  author: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  /** e.g. "A minor", "E major", "D dorian" */
  musicalKey: string | null;
  bpm: number | null;
  style: string | null;
  timeSignature: string | null;
  notes: string | null;
  isFavorite: boolean;
  playCount: number;
  lastPlayedAt: string | null;
  metaStatus: MetaStatus;
  createdAt: string;
  updatedAt: string;
}

/** Where a riff sits in one video: start and end in seconds. */
export interface RiffMark {
  a: number;
  b: number | null;
}

/**
 * A part of a song learned on its own (intro, chorus riff, solo…), with its own status.
 * Each video of the song gets its own mark, keyed by resource id, since the same riff
 * sits at a different time in the original, a cover or a lesson.
 */
export interface Riff {
  id: string;
  repertoireEntryId: string;
  name: string;
  /** Same color in every video, on the timeline, chips and lists. */
  color: string | null;
  status: Status;
  marks: Record<string, RiffMark>;
  /** Manual order inside its status column on the Riffs board (lower = higher up). */
  position?: number;
  createdAt: string;
  updatedAt: string;
}

/** Common song parts, each with a fixed color everywhere: a solo is always red, an intro green. */
export const RIFF_PARTS: { name: string; color: string; aliases: string[] }[] = [
  { name: "Intro", color: "#4CC38A", aliases: ["introdução", "introducao"] },
  { name: "Main riff", color: "#3DB8FF", aliases: ["riff", "riff principal"] },
  { name: "Verse", color: "#7C6CFF", aliases: ["verso", "estrofe"] },
  { name: "Pre-chorus", color: "#E062D6", aliases: ["pre chorus", "prechorus", "pré-refrão", "pre-refrão", "pré refrão"] },
  { name: "Chorus", color: "#F5C542", aliases: ["refrão", "refrao"] },
  { name: "Bridge", color: "#FF8A3D", aliases: ["ponte"] },
  { name: "Solo", color: "#FF2D2D", aliases: [] },
  { name: "Outro", color: "#2DD4BF", aliases: ["final", "fim"] },
];

/** Colors for riffs with their own names, picked in order so riffs of one song rarely share one. */
export const RIFF_COLORS = ["#A3E635", "#F472B6", "#38BDF8", "#FBBF24", "#C084FC", "#94A3B8"];

/** The part a riff name stands for ("Solo 2", "solo", "Refrão" → Solo, Chorus), if any. */
export function riffPart(name: string) {
  const base = name.trim().toLowerCase().replace(/\s*\d+$/, "");
  return RIFF_PARTS.find((p) => p.name.toLowerCase() === base || p.aliases.includes(base));
}

/** A part's fixed color wins; otherwise the color the riff was given. */
export function riffColor(r: Pick<Riff, "color" | "name">) {
  return riffPart(r.name)?.color ?? r.color ?? RIFF_COLORS[0];
}

export interface JamPlay {
  id: string;
  trackId: string;
  playedAt: string;
}

export interface Settings {
  defaultInstrument?: Instrument;
  defaultStatus?: Status;
  customTunings?: string[];
  [key: string]: unknown;
}

export interface Snapshot {
  songs: Song[];
  entries: Entry[];
  resources: Resource[];
  tags: Tag[];
  entryTags: EntryTag[];
  playEvents: PlayEvent[];
  attachments: Attachment[];
  jamTracks: JamTrack[];
  jamPlays: JamPlay[];
  riffs: Riff[];
  settings: Settings;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  songs: [],
  entries: [],
  resources: [],
  tags: [],
  entryTags: [],
  playEvents: [],
  attachments: [],
  jamTracks: [],
  jamPlays: [],
  riffs: [],
  settings: {},
};

/**
 * Every mutation is expressed as an idempotent op. The client applies ops
 * optimistically (and queues them while offline); the server replays them.
 */
export type Op =
  | { t: "song.upsert"; song: Song }
  | { t: "entry.upsert"; entry: Entry }
  | { t: "entry.delete"; id: string }
  | { t: "resource.upsert"; resource: Resource }
  | { t: "resource.delete"; id: string }
  | { t: "resource.reorder"; entryId: string; ids: string[] }
  | { t: "resource.setPrimary"; id: string }
  | { t: "tag.upsert"; tag: Tag }
  | { t: "tag.delete"; id: string }
  | { t: "entry.setTags"; entryId: string; tagIds: string[] }
  | { t: "play.add"; event: PlayEvent }
  | { t: "play.delete"; id: string; entryId: string }
  | { t: "attachment.upsert"; attachment: Attachment }
  | { t: "attachment.delete"; id: string }
  | { t: "setting.set"; key: string; value: unknown }
  | { t: "jam.upsert"; track: JamTrack }
  | { t: "jam.delete"; id: string }
  | { t: "jamPlay.add"; play: JamPlay }
  | { t: "jamPlay.delete"; id: string; trackId: string }
  | { t: "riff.upsert"; riff: Riff }
  | { t: "riff.delete"; id: string };

export interface QueuedOp {
  qid: string;
  op: Op;
  at: string;
}
