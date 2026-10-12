"use client";

import type { Resource, ResourceType, Settings } from "@/lib/shared/types";
import { normalizeKey } from "@/lib/shared/urls";
import { videoKey, type LocalVideo } from "./offline";
import { primaryOf, type SongView } from "./views";

/** How long each preview clip plays, in seconds (Settings → Backlog previews). */
export const CLIP_OPTIONS = [10, 15, 20, 30];
export const clipSeconds = (settings: Settings) => {
  const v = Number(settings.clipSeconds);
  return CLIP_OPTIONS.includes(v) ? v : 15;
};

/** Covers first: the Backlog is mostly guitar covers saved from YouTube. */
const PREVIEW_ORDER: ResourceType[] = ["guitar_cover", "lesson", "original", "standard_tuning", "backing_track", "custom"];

/** The cover a card shows info for: the primary guitar cover, else the first YouTube video. */
export function coverOf(view: SongView): Resource | undefined {
  for (const t of PREVIEW_ORDER) {
    const r = primaryOf(view.byType[t]?.filter((x) => x.provider === "youtube"));
    if (r) return r;
  }
  return undefined;
}

/**
 * The video a preview plays: one saved on this device (previews never stream), preferring the
 * primary cover. Null when nothing is saved, or on a desktop browser.
 */
export function previewOf(view: SongView, videos: Record<string, LocalVideo> | null): Resource | null {
  if (!videos) return null;
  const local = (r: Resource) => r.provider === "youtube" && !!r.externalId && !!videos[videoKey(r.externalId, 0)];
  for (const t of PREVIEW_ORDER) {
    const list = view.byType[t]?.filter(local);
    if (list?.length) return primaryOf(list) ?? list[0];
  }
  return null;
}

/** Spots tried when there's no ⭐: past the intro, around the middle, and later on (often the solo). */
const AUTO_SPOTS = [0.42, 0.24, 0.66];

/**
 * Where each clip of a song starts: the ⭐ first when there is one, then a few spots spread over
 * the song that don't overlap it. Every clip fits inside the video.
 */
export function clipStarts(duration: number, star: number | null | undefined, len: number): number[] {
  if (!duration || !Number.isFinite(duration)) return [Math.max(0, star ?? 0)];
  const last = Math.max(0, duration - len);
  const clamp = (t: number) => Math.min(last, Math.max(0, t));
  const out: number[] = [];
  if (star != null) out.push(clamp(star));
  for (const f of AUTO_SPOTS) {
    const t = clamp(Math.round(duration * f));
    if (out.every((x) => Math.abs(x - t) >= len)) out.push(t);
  }
  return out.slice(0, 3);
}

// ---------- Grouping, sorting, filters ----------

export type GroupBy = "none" | "artist" | "tuning" | "channel" | "difficulty" | "length" | "added" | "tab";
export type SortBy = "picks" | "newest" | "oldest" | "title" | "shortest" | "easiest" | "tuning";
export type Quick = "saved" | "starred" | "tab" | "short";

export const GROUP_LABEL: Record<GroupBy, string> = {
  none: "No groups",
  artist: "Artist",
  tuning: "Tuning",
  channel: "Cover channel",
  difficulty: "Difficulty",
  length: "Length",
  added: "Month added",
  tab: "Tab or not",
};

export const SORT_LABEL: Record<SortBy, string> = {
  picks: "Picked most",
  newest: "Newest",
  oldest: "Oldest",
  title: "A–Z",
  shortest: "Shortest",
  easiest: "Easiest",
  tuning: "Same tuning as Learning",
};

export const QUICK_LABEL: Record<Quick, string> = {
  saved: "On this device",
  starred: "Has ⭐",
  tab: "Has tab",
  short: "Under 4 min",
};

export interface BacklogItem {
  view: SongView;
  cover: Resource | undefined;
  preview: Resource | null;
  duration: number | null;
  star: number | null;
}

export function toItem(view: SongView, videos: Record<string, LocalVideo> | null): BacklogItem {
  const cover = coverOf(view);
  const preview = previewOf(view, videos);
  const shown = preview ?? cover;
  return {
    view,
    cover,
    preview,
    duration: shown?.durationSeconds ?? null,
    star: shown ? (view.entry.stars?.[shown.id] ?? null) : null,
  };
}

export function matches(x: BacklogItem, f: { query: string; tuning: string | null; tagIds: string[]; quick: Quick[] }) {
  const { entry, song, tags } = x.view;
  if (f.tuning && (entry.tuning ?? "No tuning set") !== f.tuning) return false;
  if (f.tagIds.length && !f.tagIds.every((id) => tags.some((t) => t.id === id))) return false;
  if (f.quick.includes("saved") && !x.preview) return false;
  if (f.quick.includes("starred") && x.star == null) return false;
  if (f.quick.includes("tab") && !entry.songsterrUrl) return false;
  if (f.quick.includes("short") && !(x.duration != null && x.duration < 240)) return false;
  const q = normalizeKey(f.query);
  if (q && !normalizeKey(`${song.title} ${song.artist} ${x.cover?.author ?? ""} ${tags.map((t) => t.name).join(" ")}`).includes(q)) {
    return false;
  }
  return true;
}

export function sorter(sort: SortBy, learningTunings: Set<string>) {
  const tie = (a: BacklogItem, b: BacklogItem) => (a.view.entry.position ?? 0) - (b.view.entry.position ?? 0);
  return (a: BacklogItem, b: BacklogItem): number => {
    const ea = a.view.entry;
    const eb = b.view.entry;
    switch (sort) {
      case "picks":
        return (eb.pickScore ?? 0) - (ea.pickScore ?? 0) || tie(a, b);
      case "newest":
        return eb.createdAt.localeCompare(ea.createdAt);
      case "oldest":
        return ea.createdAt.localeCompare(eb.createdAt);
      case "title":
        return a.view.song.title.localeCompare(b.view.song.title);
      case "shortest":
        return (a.duration ?? Infinity) - (b.duration ?? Infinity) || tie(a, b);
      case "easiest":
        return (ea.difficulty ?? 99) - (eb.difficulty ?? 99) || tie(a, b);
      case "tuning": {
        const ma = Number(learningTunings.has(ea.tuning ?? "E Standard"));
        const mb = Number(learningTunings.has(eb.tuning ?? "E Standard"));
        return mb - ma || (ea.tuning ?? "").localeCompare(eb.tuning ?? "") || tie(a, b);
      }
    }
  };
}

const LENGTHS = ["Under 3 min", "3–5 min", "5–8 min", "Over 8 min", "Unknown length"];
const DIFFS = ["Easy (1–2)", "Medium (3)", "Hard (4–5)", "No difficulty"];

function groupKey(x: BacklogItem, by: GroupBy): string {
  const { entry, song } = x.view;
  switch (by) {
    case "none":
      return "";
    case "artist":
      return song.artist.trim() || "Unknown artist";
    case "tuning":
      return entry.tuning ?? "No tuning set";
    case "channel":
      return x.cover?.author?.trim() || "Unknown channel";
    case "difficulty": {
      const d = entry.difficulty;
      return d == null || d === 0 ? DIFFS[3] : d <= 2 ? DIFFS[0] : d === 3 ? DIFFS[1] : DIFFS[2];
    }
    case "length": {
      const s = x.duration;
      return s == null ? LENGTHS[4] : s < 180 ? LENGTHS[0] : s < 300 ? LENGTHS[1] : s < 480 ? LENGTHS[2] : LENGTHS[3];
    }
    case "added":
      return entry.createdAt.slice(0, 7);
    case "tab":
      return entry.songsterrUrl ? "Has a tab" : "No tab yet";
  }
}

function groupLabel(key: string, by: GroupBy) {
  if (by !== "added") return key;
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export interface Group {
  key: string;
  label: string;
  items: BacklogItem[];
}

/** Groups in a stable, useful order: fixed buckets in their own order, months newest first, names A–Z. */
export function groupItems(items: BacklogItem[], by: GroupBy): Group[] {
  const map = new Map<string, BacklogItem[]>();
  for (const x of items) {
    const k = groupKey(x, by);
    const list = map.get(k) ?? [];
    list.push(x);
    map.set(k, list);
  }
  const fixed = by === "length" ? LENGTHS : by === "difficulty" ? DIFFS : by === "tab" ? ["Has a tab", "No tab yet"] : null;
  const keys = [...map.keys()].sort((a, b) => {
    if (fixed) return fixed.indexOf(a) - fixed.indexOf(b);
    if (by === "added") return b.localeCompare(a);
    const unknown = (k: string) => Number(k.startsWith("Unknown") || k.startsWith("No "));
    return unknown(a) - unknown(b) || map.get(b)!.length - map.get(a)!.length || a.localeCompare(b);
  });
  return keys.map((key) => ({ key, label: groupLabel(key, by), items: map.get(key)! }));
}

/** "5h 40m" / "48m" */
export function totalLength(sec: number) {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/**
 * The order of "What do I play now?": songs picked before come first and skipped ones last;
 * inside the same score it's random, so every round feels different.
 */
export function feedOrder(items: BacklogItem[]): string[] {
  const rnd = new Map(items.map((x) => [x.view.id, Math.random()]));
  return items
    .slice()
    .sort((a, b) => (b.view.entry.pickScore ?? 0) - (a.view.entry.pickScore ?? 0) || rnd.get(a.view.id)! - rnd.get(b.view.id)!)
    .map((x) => x.view.id);
}
