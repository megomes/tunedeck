"use client";

import type {
  Attachment,
  Entry,
  JamTrack,
  Instrument,
  Riff,
  RiffMark,
  Resource,
  ResourceType,
  Song,
  Status,
  Tag,
} from "@/lib/shared/types";
import { RIFF_COLORS, STATUS_LABEL } from "@/lib/shared/types";
import { detectProvider, normalizeUrl, youtubeId, ytThumb } from "@/lib/shared/urls";
import { hasLocalVideo } from "./offline";
import { api, dispatch, enrichJam, enrichResource, getState } from "./store";
import { playJam, playVideo, setActiveSong, toast } from "./ui";

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function entry(id: string) {
  return getState().data.entries.find((e) => e.id === id);
}

/** Position that puts an entry at the top of a status column. */
function topPosition(status: Status, except?: string) {
  const col = getState().data.entries.filter((e) => e.status === status && e.id !== except);
  return col.length ? Math.min(...col.map((e) => e.position ?? 0)) - 1 : 0;
}

export interface NewSongInput {
  title: string;
  artist: string;
  instrument: Instrument;
  status: Status;
  tuning: string | null;
  songsterrUrl?: string | null;
  tagIds?: string[];
  /** Reuse an existing song (e.g. adding a Bass entry for a Guitar song). */
  songId?: string;
  /** Just riffs, not the whole song: stays off the Library board. */
  riffOnly?: boolean;
}

export function createSong(input: NewSongInput): string {
  const t = now();
  const songId = input.songId ?? uuid();
  const entryId = uuid();
  const ops = [];
  if (!input.songId) {
    const song: Song = {
      id: songId,
      title: input.title.trim(),
      artist: input.artist.trim(),
      album: null,
      genre: null,
      bpm: null,
      createdAt: t,
      updatedAt: t,
    };
    ops.push({ t: "song.upsert" as const, song });
  }
  const e: Entry = {
    id: entryId,
    songId,
    instrument: input.instrument,
    status: input.status,
    tuning: input.instrument === "piano" ? null : input.tuning,
    capo: null,
    difficulty: null,
    songsterrUrl: input.songsterrUrl?.trim() || null,
    playCount: 0,
    lastPlayedAt: null,
    isFavorite: false,
    riffOnly: !!input.riffOnly,
    position: topPosition(input.status),
    createdAt: t,
    updatedAt: t,
  };
  ops.push({ t: "entry.upsert" as const, entry: e });
  if (input.tagIds?.length) ops.push({ t: "entry.setTags" as const, entryId, tagIds: input.tagIds });
  dispatch(...ops);
  return entryId;
}

export function updateSong(songId: string, patch: Partial<Omit<Song, "id" | "createdAt">>) {
  const s = getState().data.songs.find((x) => x.id === songId);
  if (!s) return;
  dispatch({ t: "song.upsert", song: { ...s, ...patch, updatedAt: now() } });
}

export function updateEntry(entryId: string, patch: Partial<Omit<Entry, "id" | "songId" | "createdAt">>) {
  const e = entry(entryId);
  if (!e) return;
  dispatch({ t: "entry.upsert", entry: { ...e, ...patch, updatedAt: now() } });
}

/** Moves a card on the board: new column and/or new manual position. */
export function moveEntry(entryId: string, status: Status, position: number) {
  const e = entry(entryId);
  if (!e || (e.status === status && e.position === position)) return;
  const prev = { status: e.status, position: e.position };
  updateEntry(entryId, { status, position });
  if (prev.status !== status) {
    toast(`Moved to ${STATUS_LABEL[status]}`, { label: "Undo", run: () => updateEntry(entryId, prev) });
  }
}

/** Status change from outside the board: the card lands at the top of its new column. */
export function setStatus(entryId: string, status: Status) {
  const e = entry(entryId);
  if (!e || e.status === status) return;
  moveEntry(entryId, status, topPosition(status, entryId));
}

/** Whole song ↔ just riffs. Riff-only songs leave the Library board and live in the Riffs tab. */
export function setRiffOnly(entryId: string, riffOnly: boolean) {
  const e = entry(entryId);
  if (!e || !!e.riffOnly === riffOnly) return;
  const prev = { riffOnly: !!e.riffOnly, position: e.position };
  // Back on the board: at the top of its column.
  updateEntry(entryId, riffOnly ? { riffOnly } : { riffOnly, position: topPosition(e.status, entryId) });
  toast(riffOnly ? "Just riffs: moved off the Library to Riffs" : `Back on the Library in ${STATUS_LABEL[e.status]}`, {
    label: "Undo",
    run: () => updateEntry(entryId, prev),
  });
}

export function toggleFavorite(entryId: string) {
  const e = entry(entryId);
  if (e) updateEntry(entryId, { isFavorite: !e.isFavorite });
}

export function deleteEntry(entryId: string) {
  dispatch({ t: "entry.delete", id: entryId });
}

/** +1 played: no confirmation, instant undo. */
export function playedOnce(entryId: string, opts: { auto?: boolean } = {}) {
  const event = { id: uuid(), repertoireEntryId: entryId, playedAt: now() };
  dispatch({ t: "play.add", event });
  setActiveSong(null);
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(opts.auto ? [12, 60, 12] : 12);
  toast(opts.auto ? "+1 counted from the video ✓" : "Played ✓", {
    label: "Undo",
    run: () => dispatch({ t: "play.delete", id: event.id, entryId }),
  });
  return event.id;
}

export function deletePlay(id: string, entryId: string) {
  dispatch({ t: "play.delete", id, entryId });
}

// ---------- Resources ----------

export interface NewResourceInput {
  url: string;
  type: ResourceType;
  customLabel?: string | null;
  title?: string | null;
  author?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
}

export function addResource(entryId: string, input: NewResourceInput): string {
  const url = normalizeUrl(input.url);
  const provider = detectProvider(url);
  const ytId = youtubeId(url);
  const existing = getState().data.resources.filter((r) => r.repertoireEntryId === entryId && r.type === input.type);
  const hasMeta = Boolean(input.title);
  const t = now();
  const resource: Resource = {
    id: uuid(),
    repertoireEntryId: entryId,
    type: input.type,
    customLabel: input.customLabel?.trim() || null,
    provider,
    url,
    externalId: ytId,
    title: input.title ?? null,
    author: input.author ?? null,
    thumbnailUrl: input.thumbnailUrl ?? (ytId ? ytThumb(ytId) : null),
    durationSeconds: input.durationSeconds ?? null,
    metaStatus: provider === "youtube" ? (hasMeta && input.durationSeconds != null ? "ok" : "pending") : "none",
    isPrimary: existing.length === 0,
    sortOrder: existing.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0),
    createdAt: t,
    updatedAt: t,
  };
  dispatch({ t: "resource.upsert", resource });
  if (resource.metaStatus === "pending") void enrichResource(resource.id);
  return resource.id;
}

export function updateResource(id: string, patch: Partial<Resource>) {
  const r = getState().data.resources.find((x) => x.id === id);
  if (!r) return;
  dispatch({ t: "resource.upsert", resource: { ...r, ...patch, updatedAt: now() } });
}

export function retryEnrich(id: string) {
  updateResource(id, { metaStatus: "pending" });
  void enrichResource(id);
}

export function deleteResource(id: string) {
  const r = getState().data.resources.find((x) => x.id === id);
  if (!r) return;
  dispatch({ t: "resource.delete", id });
  toast("Resource removed", { label: "Undo", run: () => dispatch({ t: "resource.upsert", resource: r }) });
}

export function reorderResources(entryId: string, ids: string[]) {
  dispatch({ t: "resource.reorder", entryId, ids });
}

export function setPrimaryResource(id: string) {
  dispatch({ t: "resource.setPrimary", id });
}

/** Generic external link in a new tab; the song becomes "active" so coming back offers +1. */
export function openLink(url: string, entryId?: string) {
  if (entryId) setActiveSong(entryId);
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Songsterr is a straight redirect: a top-level navigation to the HTTPS URL lets the
 * OS hand it to the installed Songsterr app (or opens the site). Back returns to TuneDeck.
 */
export function openSongsterr(url: string, entryId: string) {
  setActiveSong(entryId);
  window.location.assign(url);
}

/** YouTube resources play embedded in the app; anything else opens externally. */
export function openResource(r: Resource) {
  const online = typeof navigator === "undefined" || navigator.onLine;
  // Offline, a video saved on the device still plays in the app; anything else opens the link.
  if (r.provider === "youtube" && r.externalId && (online || hasLocalVideo(r.externalId))) playVideo(r.id, r.repertoireEntryId);
  else openLink(r.url, r.repertoireEntryId);
}

// ---------- Tags ----------

export function createTag(name: string, color: string | null = null): string {
  const clean = name.trim();
  const existing = getState().data.tags.find((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  const tag: Tag = { id: uuid(), name: clean, color, icon: null, createdAt: now() };
  dispatch({ t: "tag.upsert", tag });
  return tag.id;
}

export function updateTag(id: string, patch: Partial<Tag>) {
  const t = getState().data.tags.find((x) => x.id === id);
  if (t) dispatch({ t: "tag.upsert", tag: { ...t, ...patch } });
}

export function deleteTag(id: string) {
  dispatch({ t: "tag.delete", id });
}

export function setEntryTags(entryId: string, tagIds: string[]) {
  dispatch({ t: "entry.setTags", entryId, tagIds });
}

// ---------- Settings ----------

export function setSetting(key: string, value: unknown) {
  dispatch({ t: "setting.set", key, value });
}

// ---------- Attachments (upload needs a connection) ----------

export async function uploadAttachment(entryId: string, file: File, label?: string) {
  const res = await api("/api/attachments/upload", {
    method: "POST",
    body: JSON.stringify({ entryId, filename: file.name, contentType: file.type, size: file.size }),
  });
  const info = await res.json();
  if (!res.ok) throw new Error(info.error ?? "Upload failed");
  const put = await fetch(info.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": info.contentType },
  });
  if (!put.ok) throw new Error(`Storage rejected the upload (${put.status})`);
  const attachment: Attachment = {
    id: info.id,
    repertoireEntryId: entryId,
    type: info.type,
    filename: file.name,
    label: label?.trim() || null,
    storageKey: info.storageKey,
    sizeBytes: file.size,
    createdAt: now(),
  };
  dispatch({ t: "attachment.upsert", attachment });
  return attachment;
}

export function updateAttachment(id: string, patch: Partial<Attachment>) {
  const a = getState().data.attachments.find((x) => x.id === id);
  if (a) dispatch({ t: "attachment.upsert", attachment: { ...a, ...patch } });
}

export function deleteAttachment(id: string) {
  dispatch({ t: "attachment.delete", id });
}

// ---------- Jam backing tracks ----------

export interface JamInput {
  url: string;
  title: string;
  author?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  musicalKey: string | null;
  bpm: number | null;
  style: string | null;
  timeSignature: string | null;
  notes: string | null;
}

function jam(id: string) {
  return getState().data.jamTracks.find((t) => t.id === id);
}

export function createJam(input: JamInput): string {
  const url = normalizeUrl(input.url);
  const videoId = youtubeId(url);
  const t = now();
  const track: JamTrack = {
    id: uuid(),
    url,
    videoId,
    title: input.title.trim() || url,
    author: input.author ?? null,
    thumbnailUrl: input.thumbnailUrl ?? (videoId ? ytThumb(videoId) : null),
    durationSeconds: input.durationSeconds ?? null,
    musicalKey: input.musicalKey,
    bpm: input.bpm,
    style: input.style?.trim() || null,
    timeSignature: input.timeSignature,
    notes: input.notes?.trim() || null,
    isFavorite: false,
    playCount: 0,
    lastPlayedAt: null,
    metaStatus: input.author || input.durationSeconds ? "ok" : videoId ? "pending" : "none",
    createdAt: t,
    updatedAt: t,
  };
  dispatch({ t: "jam.upsert", track });
  if (track.metaStatus === "pending") void enrichJam(track.id);
  return track.id;
}

export function updateJam(id: string, patch: Partial<Omit<JamTrack, "id" | "createdAt">>) {
  const tr = jam(id);
  if (tr) dispatch({ t: "jam.upsert", track: { ...tr, ...patch, updatedAt: now() } });
}

export function toggleJamFavorite(id: string) {
  const tr = jam(id);
  if (tr) updateJam(id, { isFavorite: !tr.isFavorite });
}

export function deleteJam(id: string) {
  const tr = jam(id);
  if (!tr) return;
  const plays = getState().data.jamPlays.filter((p) => p.trackId === id);
  dispatch({ t: "jam.delete", id });
  toast("Backing track removed", {
    label: "Undo",
    run: () => dispatch({ t: "jam.upsert", track: tr }, ...plays.map((play) => ({ t: "jamPlay.add" as const, play }))),
  });
}

export function jamPlayed(trackId: string, opts: { auto?: boolean } = {}) {
  const play = { id: uuid(), trackId, playedAt: now() };
  dispatch({ t: "jamPlay.add", play });
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(opts.auto ? [12, 60, 12] : 12);
  toast(opts.auto ? "Jam counted from the video ✓" : "Jammed ✓", {
    label: "Undo",
    run: () => dispatch({ t: "jamPlay.delete", id: play.id, trackId }),
  });
}

export function deleteJamPlay(id: string, trackId: string) {
  dispatch({ t: "jamPlay.delete", id, trackId });
}

export function playJamTrack(id: string) {
  const tr = jam(id);
  if (!tr) return;
  const online = typeof navigator === "undefined" || navigator.onLine;
  if (tr.videoId && (online || hasLocalVideo(tr.videoId))) playJam(id);
  else openLink(tr.url);
}

// ---------- Riffs ----------

function riff(id: string) {
  return getState().data.riffs.find((r) => r.id === id);
}

const round = (sec: number) => Math.max(0, Math.round(sec * 10) / 10);

/** A new riff with the next free color. Named "Riff N" when no name is given (rename later). */
export function createRiff(entryId: string, name?: string, mark?: { resourceId: string; mark: RiffMark }): string {
  const siblings = getState().data.riffs.filter((r) => r.repertoireEntryId === entryId);
  const used = new Set(siblings.map((r) => r.color));
  const t = now();
  const r: Riff = {
    id: uuid(),
    repertoireEntryId: entryId,
    name: name?.trim() || `Riff ${siblings.length + 1}`,
    color: RIFF_COLORS.find((c) => !used.has(c)) ?? RIFF_COLORS[siblings.length % RIFF_COLORS.length],
    status: "LEARNING",
    marks: mark ? { [mark.resourceId]: { a: round(mark.mark.a), b: mark.mark.b == null ? null : round(mark.mark.b) } } : {},
    createdAt: t,
    updatedAt: t,
  };
  dispatch({ t: "riff.upsert", riff: r });
  return r.id;
}

export function updateRiff(id: string, patch: Partial<Pick<Riff, "name" | "status">>) {
  const r = riff(id);
  if (r) dispatch({ t: "riff.upsert", riff: { ...r, ...patch, updatedAt: now() } });
}

/**
 * Sets the start (a) or end (b) of a riff in one video. A start past the end clears the end;
 * an end before the start is refused (returns false).
 */
export function setRiffMark(id: string, resourceId: string, edge: keyof RiffMark, sec: number): boolean {
  const r = riff(id);
  if (!r) return false;
  const prev = r.marks[resourceId];
  const t = round(sec);
  let next: RiffMark;
  if (edge === "a") next = { a: t, b: prev?.b != null && prev.b > t + 0.2 ? prev.b : null };
  else if (!prev || t <= prev.a + 0.2) {
    toast("The end must come after the start");
    return false;
  } else next = { a: prev.a, b: t };
  dispatch({ t: "riff.upsert", riff: { ...r, marks: { ...r.marks, [resourceId]: next }, updatedAt: now() } });
  return true;
}

/** Writes a whole mark at once (both ends known, e.g. estimated from another video). */
export function putRiffMark(id: string, resourceId: string, mark: RiffMark) {
  const r = riff(id);
  if (!r) return;
  const next = { a: round(mark.a), b: mark.b == null ? null : round(mark.b) };
  dispatch({ t: "riff.upsert", riff: { ...r, marks: { ...r.marks, [resourceId]: next }, updatedAt: now() } });
}

export function clearRiffMark(id: string, resourceId: string) {
  const r = riff(id);
  if (!r) return;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [resourceId]: _, ...marks } = r.marks;
  dispatch({ t: "riff.upsert", riff: { ...r, marks, updatedAt: now() } });
}

export function deleteRiff(id: string) {
  const r = riff(id);
  if (!r) return;
  dispatch({ t: "riff.delete", id });
  toast("Riff removed", { label: "Undo", run: () => dispatch({ t: "riff.upsert", riff: r }) });
}

/** Plays the riff in the given video (or its first marked one) and loops it once both ends are set. */
export function playRiff(id: string, resourceId?: string) {
  const r = riff(id);
  if (!r) return false;
  const resources = getState().data.resources.filter(
    (x) => x.repertoireEntryId === r.repertoireEntryId && x.provider === "youtube" && x.externalId,
  );
  const target =
    resources.find((x) => x.id === resourceId) ?? resources.find((x) => r.marks[x.id]?.b != null) ?? resources.find((x) => r.marks[x.id]);
  if (!target) return false;
  const online = typeof navigator === "undefined" || navigator.onLine;
  if (!online && !hasLocalVideo(target.externalId!)) {
    toast("This video isn't saved on this device");
    return false;
  }
  playVideo(target.id, r.repertoireEntryId, r.id);
  return true;
}
