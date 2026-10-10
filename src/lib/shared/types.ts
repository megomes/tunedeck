export const INSTRUMENTS = ["guitar", "bass", "piano"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

/** Board order: want → in progress → done, then the parked columns on the far right. */
export const STATUSES = ["WANT_TO_PLAY", "LEARNING", "CAN_PLAY", "MASTERED", "ARCHIVED", "BACKLOG"] as const;
export type Status = (typeof STATUSES)[number];

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
  WANT_TO_PLAY: "Want to Play",
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
  /** Manual order inside its status column (lower = higher up). */
  position: number;
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
  status: Status;
  marks: Record<string, RiffMark>;
  createdAt: string;
  updatedAt: string;
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
