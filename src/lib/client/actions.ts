"use client";

import type {
  Attachment,
  Entry,
  Instrument,
  Resource,
  ResourceType,
  Song,
  Status,
  Tag,
} from "@/lib/shared/types";
import { STATUS_LABEL } from "@/lib/shared/types";
import { detectProvider, normalizeUrl, youtubeId, ytThumb } from "@/lib/shared/urls";
import { api, dispatch, enrichResource, getState } from "./store";
import { playVideo, setActiveSong, toast } from "./ui";

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
  if (r.provider === "youtube" && r.externalId && online) playVideo(r.id, r.repertoireEntryId);
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
