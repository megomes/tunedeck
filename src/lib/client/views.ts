"use client";

import { useMemo } from "react";
import {
  DEFAULT_TUNINGS,
  RESOURCE_TYPES,
  type Attachment,
  type Entry,
  type Resource,
  type ResourceType,
  type Snapshot,
  type Song,
  type Tag,
} from "@/lib/shared/types";
import { normalizeKey } from "@/lib/shared/urls";
import { useData } from "./store";

export interface SongView {
  id: string; // entry id
  entry: Entry;
  song: Song;
  resources: Resource[];
  byType: Partial<Record<ResourceType, Resource[]>>;
  tags: Tag[];
  attachments: Attachment[];
  thumb: string | null;
}

const typeRank = new Map(RESOURCE_TYPES.map((t, i) => [t, i]));

export function sortResources(list: Resource[]) {
  return list
    .slice()
    .sort(
      (a, b) =>
        (typeRank.get(a.type) ?? 99) - (typeRank.get(b.type) ?? 99) ||
        a.sortOrder - b.sortOrder ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/** The resource a one-tap launcher opens: the primary one, else the first by sort order. */
export function primaryOf(list: Resource[] | undefined): Resource | undefined {
  if (!list?.length) return undefined;
  return list.find((r) => r.isPrimary) ?? list[0];
}

const cache = new WeakMap<Snapshot, SongView[]>();

export function buildViews(data: Snapshot): SongView[] {
  const hit = cache.get(data);
  if (hit) return hit;
  const songs = new Map(data.songs.map((s) => [s.id, s]));
  const tags = new Map(data.tags.map((t) => [t.id, t]));
  const resByEntry = new Map<string, Resource[]>();
  for (const r of data.resources) {
    const list = resByEntry.get(r.repertoireEntryId) ?? [];
    list.push(r);
    resByEntry.set(r.repertoireEntryId, list);
  }
  const tagsByEntry = new Map<string, Tag[]>();
  for (const et of data.entryTags) {
    const t = tags.get(et.tagId);
    if (!t) continue;
    const list = tagsByEntry.get(et.repertoireEntryId) ?? [];
    list.push(t);
    tagsByEntry.set(et.repertoireEntryId, list);
  }
  const attByEntry = new Map<string, Attachment[]>();
  for (const a of data.attachments) {
    const list = attByEntry.get(a.repertoireEntryId) ?? [];
    list.push(a);
    attByEntry.set(a.repertoireEntryId, list);
  }

  const views: SongView[] = [];
  for (const entry of data.entries) {
    const song = songs.get(entry.songId);
    if (!song) continue;
    const resources = sortResources(resByEntry.get(entry.id) ?? []);
    const byType: SongView["byType"] = {};
    for (const r of resources) (byType[r.type] ??= []).push(r);
    const withThumb =
      primaryOf(byType.original?.filter((r) => r.thumbnailUrl)) ?? resources.find((r) => r.thumbnailUrl);
    views.push({
      id: entry.id,
      entry,
      song,
      resources,
      byType,
      tags: (tagsByEntry.get(entry.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      attachments: (attByEntry.get(entry.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      thumb: withThumb?.thumbnailUrl ?? null,
    });
  }
  cache.set(data, views);
  return views;
}

export function useViews() {
  const data = useData();
  return useMemo(() => buildViews(data), [data]);
}

export function useView(entryId: string | null) {
  const views = useViews();
  return useMemo(() => views.find((v) => v.id === entryId) ?? null, [views, entryId]);
}

/** Predefined + custom tunings, plus any tuning already used by a song. */
export function useTunings() {
  const data = useData();
  return useMemo(() => {
    const custom = (data.settings.customTunings as string[] | undefined) ?? [];
    const used = data.entries.map((e) => e.tuning).filter((t): t is string => !!t);
    return Array.from(new Set([...DEFAULT_TUNINGS, ...custom, ...used]));
  }, [data]);
}

export function findDuplicates(views: SongView[], title: string, artist: string) {
  const t = normalizeKey(title);
  const a = normalizeKey(artist);
  if (!t) return [];
  return views.filter((v) => normalizeKey(v.song.title) === t && (!a || !v.song.artist || normalizeKey(v.song.artist) === a));
}

export const byTitle = (a: SongView, b: SongView) => a.song.title.localeCompare(b.song.title);
export const byRecentlyAdded = (a: SongView, b: SongView) => b.entry.createdAt.localeCompare(a.entry.createdAt);
export const byLastPlayedDesc = (a: SongView, b: SongView) =>
  (b.entry.lastPlayedAt ?? "").localeCompare(a.entry.lastPlayedAt ?? "");
export const byLastPlayedAsc = (a: SongView, b: SongView) =>
  (a.entry.lastPlayedAt ?? "").localeCompare(b.entry.lastPlayedAt ?? "");
