"use client";

import { useSyncExternalStore } from "react";
import { STATUS_LABEL, type Resource, type ResourceType, type Snapshot, type Status } from "@/lib/shared/types";
import { clipStarts } from "./backlog";
import { unlockAudio } from "./backgroundAudio";
import { daysSince } from "./format";
import { videoKey, type LocalVideo } from "./offline";
import { closePlayer, playVideo, readPref, toast, writePref } from "./ui";
import { primaryOf, type SongView } from "./views";

// ---------- Preferences (per device) ----------

/** Which video of a song the radio plays. */
export type Version = "original" | "cover" | "backing";
/** Whole songs, or just the best part of each (the ⭐, else a spot past the intro). */
export type RadioMode = "full" | "highlights";

export interface RadioPrefs {
  version: Version;
  mode: RadioMode;
  shuffle: boolean;
  /** A voice says what's coming between songs, with its tuning: made for the car. */
  dj: boolean;
  /** Minutes the drive takes: the queue is cut to fit it. 0 = play forever. */
  trip: number;
  /** Only songs saved on this phone: no mobile data in the car. */
  savedOnly: boolean;
  /** Playlists open in YouTube Music instead: it shows up in Android Auto. */
  ytMusic: boolean;
}

export const VERSION_LABEL: Record<Version, string> = { original: "Original", cover: "Covers", backing: "Backing tracks" };
export const MODE_LABEL: Record<RadioMode, string> = { full: "Full songs", highlights: "Best parts" };
export const TRIP_OPTIONS = [0, 15, 30, 45, 60, 90];
/** How long each song plays in Best parts. */
export const HIGHLIGHT_SECONDS = 35;

const DEFAULT_PREFS: RadioPrefs = { version: "original", mode: "full", shuffle: true, dj: false, trip: 0, savedOnly: false, ytMusic: false };

let prefs: RadioPrefs | null = null;
const prefListeners = new Set<() => void>();

function loadPrefs(): RadioPrefs {
  prefs ??= { ...DEFAULT_PREFS, ...readPref<Partial<RadioPrefs>>("radio", {}) };
  return prefs;
}

export function setRadioPrefs(patch: Partial<RadioPrefs>) {
  prefs = { ...loadPrefs(), ...patch };
  writePref("radio", prefs);
  prefListeners.forEach((l) => l());
}

export function useRadioPrefs() {
  return useSyncExternalStore(
    (l) => {
      prefListeners.add(l);
      return () => prefListeners.delete(l);
    },
    loadPrefs,
    () => DEFAULT_PREFS,
  );
}

// ---------- Listens (per device) ----------
// Listening isn't playing: it never touches the +1 count, but feeds "On repeat".

const LISTENS_KEY = "listens";
type Listens = Record<string, { n: number; at: string }>;

export function readListens(): Listens {
  return readPref<Listens>(LISTENS_KEY, {});
}

function countListen(entryId: string) {
  const all = readListens();
  all[entryId] = { n: (all[entryId]?.n ?? 0) + 1, at: new Date().toISOString() };
  writePref(LISTENS_KEY, all);
}

// ---------- Playlists ----------
// Every filter of the Library is a playlist here: status, tag, tuning, artist, plus a few mixes.

export type PlaylistIcon =
  | "all"
  | "daily"
  | "repeat"
  | "rediscover"
  | "star"
  | "fresh"
  | "pinned"
  | "tab"
  | "status"
  | "tag"
  | "tuning"
  | "artist"
  | "filter";

export interface Playlist {
  id: string;
  name: string;
  description: string;
  icon: PlaylistIcon;
  color: string;
  entryIds: string[];
  /** Mode the playlist is meant for, e.g. Best moments plays the ⭐ parts. */
  mode?: RadioMode;
}

const VERSION_ORDER: Record<Version, ResourceType[]> = {
  original: ["original", "standard_tuning", "guitar_cover", "lesson", "backing_track", "custom"],
  cover: ["guitar_cover", "lesson", "original", "standard_tuning", "backing_track", "custom"],
  backing: ["backing_track", "original", "standard_tuning", "guitar_cover", "lesson", "custom"],
};

const playable = (r: Resource) => r.provider === "youtube" && !!r.externalId;

/**
 * The video to play for a song: the first type in the version's order that has a YouTube video,
 * preferring one saved on this device (it plays without data). null when nothing can play.
 */
export function trackResource(view: SongView, version: Version, videos: Record<string, LocalVideo> | null, savedOnly = false) {
  const saved = (r: Resource) => !!videos?.[videoKey(r.externalId!, 0)];
  for (const t of VERSION_ORDER[version]) {
    const list = view.byType[t]?.filter(playable);
    if (!list?.length) continue;
    const local = list.filter(saved);
    if (local.length) return primaryOf(local)!;
    if (!savedOnly) return primaryOf(list)!;
  }
  return null;
}

const STATUS_COLOR: Record<Status, string> = {
  WANT_TO_PLAY: "#FF2D2D",
  LEARNING: "#FF8A3D",
  CAN_PLAY: "#3DB8FF",
  MASTERED: "#F5C542",
  ARCHIVED: "#777777",
  BACKLOG: "#7C6CFF",
};

const STATUS_BLURB: Record<Status, string> = {
  WANT_TO_PLAY: "The next ones you'll learn: get them in your ear",
  LEARNING: "What you're learning right now, on loop until it sticks",
  CAN_PLAY: "Songs you can play",
  MASTERED: "Your best: the full repertoire you nailed",
  ARCHIVED: "Parked songs",
  BACKLOG: "Everything saved to learn someday",
};

/** Same random order all day: today's mix doesn't reshuffle every time you open it. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Learning and Up Next weigh most: the mix is ear training for what's on the stand. */
const DAILY_WEIGHT: Record<Status, number> = { LEARNING: 4, WANT_TO_PLAY: 3, CAN_PLAY: 2, MASTERED: 1.5, BACKLOG: 1, ARCHIVED: 0.3 };
const DAILY_SIZE = 25;

export interface PlaylistSection {
  title: string;
  lists: Playlist[];
}

export function buildPlaylists(views: SongView[], data: Snapshot, listens: Listens): PlaylistSection[] {
  const songs = views;
  const ids = (list: SongView[]) => list.map((v) => v.id);
  const sections: PlaylistSection[] = [];

  // --- Made for you
  const made: Playlist[] = [];
  const rnd = seeded(new Date().toDateString());
  const daily = songs
    .map((v) => ({ v, k: Math.pow(rnd(), 1 / (DAILY_WEIGHT[v.entry.status] ?? 1)) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, DAILY_SIZE)
    .map((x) => x.v);
  if (daily.length) {
    made.push({
      id: "daily",
      name: "Daily Mix",
      description: "New every day, heavy on what you're learning",
      icon: "daily",
      color: "#E062D6",
      entryIds: ids(daily),
    });
  }
  const onRepeat = songs.filter((v) => listens[v.id]).sort((a, b) => listens[b.id].n - listens[a.id].n).slice(0, 25);
  if (onRepeat.length >= 3) {
    made.push({
      id: "repeat",
      name: "On Repeat",
      description: "What you've listened to most here",
      icon: "repeat",
      color: "#4CC38A",
      entryIds: ids(onRepeat),
    });
  }
  const rediscover = songs.filter(
    (v) => (v.entry.status === "CAN_PLAY" || v.entry.status === "MASTERED") && daysSince(v.entry.lastPlayedAt) > 30,
  );
  if (rediscover.length) {
    made.push({
      id: "rediscover",
      name: "Don't Forget",
      description: "Songs you know but haven't played in a month",
      icon: "rediscover",
      color: "#3DB8FF",
      entryIds: ids(rediscover),
    });
  }
  const starred = songs.filter((v) => Object.keys(v.entry.stars ?? {}).length);
  if (starred.length) {
    made.push({
      id: "stars",
      name: "Best Moments",
      description: "Straight to each ⭐, one after another",
      icon: "star",
      color: "#F5C542",
      entryIds: ids(starred),
      mode: "highlights",
    });
  }
  const fresh = songs.filter((v) => daysSince(v.entry.createdAt) <= 14);
  if (fresh.length) {
    made.push({
      id: "fresh",
      name: "Fresh Finds",
      description: "Added in the last two weeks",
      icon: "fresh",
      color: "#A3E635",
      entryIds: ids(fresh.sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt))),
    });
  }
  const pinned = songs.filter((v) => v.entry.isFavorite);
  if (pinned.length) {
    made.push({ id: "pinned", name: "Pinned", description: "Your ♥ songs", icon: "pinned", color: "#FF2D2D", entryIds: ids(pinned) });
  }
  const tab = songs.filter((v) => v.entry.songsterrUrl);
  if (tab.length) {
    made.push({ id: "tab", name: "Has a Tab", description: "Ready to pick up the guitar", icon: "tab", color: "#B5B5B5", entryIds: ids(tab) });
  }
  sections.push({ title: "Made for you", lists: made });

  // --- By status
  const byStatus = (["LEARNING", "WANT_TO_PLAY", "CAN_PLAY", "MASTERED", "BACKLOG", "ARCHIVED"] as Status[])
    .map((s) => ({ s, list: songs.filter((v) => v.entry.status === s) }))
    .filter((x) => x.list.length)
    .map(
      ({ s, list }): Playlist => ({
        id: `status:${s}`,
        name: STATUS_LABEL[s],
        description: STATUS_BLURB[s],
        icon: "status",
        color: STATUS_COLOR[s],
        entryIds: ids(list),
      }),
    );
  sections.push({ title: "Board columns", lists: byStatus });

  // --- Tags
  const tags = data.tags
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (t): Playlist => ({
        id: `tag:${t.id}`,
        name: t.name,
        description: "Tag",
        icon: "tag",
        color: t.color ?? "#B5B5B5",
        entryIds: ids(songs.filter((v) => v.tags.some((x) => x.id === t.id))),
      }),
    )
    .filter((p) => p.entryIds.length);
  sections.push({ title: "Tags", lists: tags });

  // --- Tunings: one tuning for the whole drive, the guitar never needs retuning.
  const tuning = new Map<string, SongView[]>();
  for (const v of songs) if (v.entry.tuning) tuning.set(v.entry.tuning, [...(tuning.get(v.entry.tuning) ?? []), v]);
  sections.push({
    title: "Tunings",
    lists: [...tuning.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([t, list]) => ({
        id: `tuning:${t}`,
        name: `${t} Session`,
        description: "No retuning between songs",
        icon: "tuning",
        color: "#7C6CFF",
        entryIds: ids(list),
      })),
  });

  // --- Artists with a few songs: "This is …"
  const artist = new Map<string, SongView[]>();
  for (const v of songs) {
    const a = v.song.artist.trim();
    if (a) artist.set(a, [...(artist.get(a) ?? []), v]);
  }
  sections.push({
    title: "Artists",
    lists: [...artist.entries()]
      .filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([a, list]) => ({
        id: `artist:${a}`,
        name: `This Is ${a}`,
        description: "Artist",
        icon: "artist",
        color: "#FF8A3D",
        entryIds: ids(list),
      })),
  });

  return sections.filter((s) => s.lists.length);
}

// ---------- The queue ----------

export interface Track {
  entryId: string;
  resourceId: string;
  videoId: string;
  /** Where it starts (Best parts), in seconds. */
  start?: number;
  /** Where it stops (Best parts). */
  end?: number;
  /** Video length when known, for the trip timer. */
  seconds: number | null;
  /** Saved on this phone: the only songs that keep playing with the screen locked. */
  local: boolean;
}

export interface RadioState {
  playlist: Pick<Playlist, "id" | "name" | "entryIds" | "mode">;
  tracks: Track[];
  index: number;
  mode: RadioMode;
  /** Bumps on every track change, even to the same video. */
  seq: number;
  /** Big buttons for the car. */
  car: boolean;
  /** When the trip timer runs out (ms), if one is set. */
  endsAt: number | null;
}

let radio: RadioState | null = null;
const listeners = new Set<() => void>();
let ctx: { views: SongView[]; videos: Record<string, LocalVideo> | null } = { views: [], videos: null };

function emit() {
  listeners.forEach((l) => l());
}

export function useRadio() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => radio,
    () => null,
  );
}

export const getRadio = () => radio;

function shuffle<T>(list: T[]) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The songs of a playlist as playable tracks, in play order, cut to the trip when one is set. */
function buildTracks(entryIds: string[], mode: RadioMode, p: RadioPrefs, first?: string): Track[] {
  const byId = new Map(ctx.views.map((v) => [v.id, v]));
  let order = p.shuffle ? shuffle(entryIds) : entryIds;
  if (first) order = [first, ...order.filter((id) => id !== first)];
  const tracks: Track[] = [];
  for (const id of order) {
    const v = byId.get(id);
    if (!v) continue;
    const r = trackResource(v, p.version, ctx.videos, p.savedOnly);
    if (!r) continue;
    const local = !!ctx.videos?.[videoKey(r.externalId!, 0)];
    const t: Track = { entryId: id, resourceId: r.id, videoId: r.externalId!, seconds: r.durationSeconds, local };
    if (mode === "highlights") {
      const star = v.entry.stars?.[r.id];
      const start = r.durationSeconds ? clipStarts(r.durationSeconds, star, HIGHLIGHT_SECONDS)[0] : (star ?? 30);
      t.start = start;
      t.end = start + HIGHLIGHT_SECONDS;
      t.seconds = HIGHLIGHT_SECONDS;
    }
    tracks.push(t);
  }
  if (!p.trip) return tracks;
  // Fill the drive: take songs while they fit, skipping the ones that would run over.
  const budget = p.trip * 60;
  const fit: Track[] = [];
  let total = 0;
  for (const t of tracks) {
    const s = t.seconds ?? 240;
    if (total + s <= budget + 30) {
      fit.push(t);
      total += s;
    }
  }
  return fit.length ? fit : tracks.slice(0, 1);
}

/** Songs a playlist can actually play with the current settings (some have no YouTube video). */
export function playableCount(
  entryIds: string[],
  views: SongView[],
  videos: Record<string, LocalVideo> | null,
  p: RadioPrefs,
  mode: RadioMode = p.mode,
) {
  const byId = new Map(views.map((v) => [v.id, v]));
  let n = 0;
  let seconds = 0;
  for (const id of entryIds) {
    const v = byId.get(id);
    const r = v && trackResource(v, p.version, videos, p.savedOnly);
    if (!r) continue;
    n++;
    seconds += mode === "highlights" ? HIGHLIGHT_SECONDS : (r.durationSeconds ?? 0);
  }
  return { n, seconds };
}

function play(next: RadioState, open = false) {
  radio = next;
  const t = next.tracks[next.index];
  playVideo(t.resourceId, t.entryId, undefined, { start: t.start, keepView: !open });
  emit();
}

/** Starts a playlist like a radio station; `first` plays that song first. */
export function startRadio(
  playlist: RadioState["playlist"],
  env: { views: SongView[]; videos: Record<string, LocalVideo> | null },
  opts: { first?: string; car?: boolean } = {},
) {
  ctx = env;
  const p = loadPrefs();
  const mode = playlist.mode ?? p.mode;
  const tracks = buildTracks(playlist.entryIds, mode, p, opts.first);
  if (!tracks.length) {
    toast(p.savedOnly ? "None of these songs is saved on this device" : "None of these songs has a YouTube video to play");
    return false;
  }
  // Inside the tap: later songs may then start on their own, even with the screen locked.
  unlockAudio();
  stopSpeaking();
  play({
    playlist,
    tracks,
    index: 0,
    mode,
    seq: (radio?.seq ?? 0) + 1,
    car: opts.car ?? radio?.car ?? false,
    endsAt: p.trip ? Date.now() + p.trip * 60_000 : null,
  }, true);
  return true;
}

/** Goes to a track of the queue. */
export function radioJump(index: number) {
  if (!radio || index < 0 || index >= radio.tracks.length) return;
  unlockAudio();
  stopSpeaking();
  play({ ...radio, index, seq: radio.seq + 1 });
}

export function radioPrev() {
  if (radio) radioJump(Math.max(0, radio.index - 1));
}

let advancing = false;

/**
 * The YouTube player was seen stopping with the screen locked (it plays on only with Premium, and
 * not always in an embed): from then on a locked screen means saved songs only.
 */
let youtubeStopsWhenLocked = false;
export function youtubeStoppedWhenLocked() {
  youtubeStopsWhenLocked = true;
}

/**
 * Next song. At the end of a song (not a skip) it counts a listen and, with the DJ on, says
 * what's coming first. At the end of the queue it starts over reshuffled, unless the trip is over.
 * With the screen locked, once YouTube was seen stopping there, it goes to the next saved song.
 * `seq` is the track that ended: a late second report of the same end is ignored.
 */
export async function radioNext(reason: "end" | "skip" | "error" = "skip", seq?: number) {
  if (!radio || advancing || (seq != null && seq !== radio.seq)) return;
  const cur = radio.tracks[radio.index];
  if (reason === "end" && radio.mode === "full") countListen(cur.entryId);
  const locked = youtubeStopsWhenLocked && document.visibilityState === "hidden" && radio.tracks.some((t) => t.local);
  const canPlay = (t: Track) => !locked || t.local;
  const after = radio.tracks.findIndex((t, i) => i > radio!.index && canPlay(t));
  let next: RadioState;
  if (after >= 0) {
    next = { ...radio, index: after, seq: radio.seq + 1 };
  } else if (radio.endsAt) {
    if (reason === "end") {
      const p = loadPrefs();
      if (p.dj) await speak("That's the end of the drive. Hope you enjoyed the ride!");
      toast("That's the whole drive 🚗");
      stopRadio();
      return;
    }
    return toast("That's the last song of this drive");
  } else {
    const p = loadPrefs();
    const tracks = buildTracks(radio.playlist.entryIds, radio.mode, p);
    if (!tracks.length) return stopRadio();
    next = { ...radio, tracks, index: Math.max(0, tracks.findIndex(canPlay)), seq: radio.seq + 1 };
  }
  const p = loadPrefs();
  // No DJ with the screen locked: the voice can't be counted on to speak (or end) in the background.
  if (reason === "end" && p.dj && radio.mode === "full" && document.visibilityState === "visible") {
    advancing = true;
    await speak(djLine(cur, next.tracks[next.index]));
    advancing = false;
    // Stopped or skipped while talking.
    if (!radio || radio.seq !== next.seq - 1) return;
  }
  play(next);
}

export function stopRadio() {
  stopSpeaking();
  radio = null;
  closePlayer();
  emit();
}

/** Leaves radio mode but keeps the video playing (e.g. another song was opened). */
export function detachRadio() {
  if (!radio) return;
  radio = null;
  emit();
}

// ---------- YouTube Music ----------
// A web app can't show up in Android Auto's media card next to the map; YouTube Music can. The
// playlist is handed over there: same order, version and drive timer, full songs.

/** Most videos YouTube puts in one temporary playlist. */
const YT_MUSIC_MAX = 50;

async function openYouTubeMusic(videoIds: string[]) {
  const ids = videoIds.slice(0, YT_MUSIC_MAX);
  // TuneDeck goes quiet: the music moves to the other app.
  if (radio) stopRadio();
  else closePlayer();
  toast("Opening YouTube Music…");
  // Plain YouTube when YouTube Music's link can't be made.
  let url = `https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`;
  try {
    const res = await fetch("/api/ytmusic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) url = (await res.json()).url;
  } catch {
    /* offline: plain YouTube */
  }
  // Still within the tap's activation: Android hands the link to the app.
  if (!window.open(url, "_blank")) window.location.href = url;
}

/** Plays a playlist in YouTube Music instead of here. */
export function playInYouTubeMusic(playlist: Pick<Playlist, "entryIds">, env: typeof ctx) {
  ctx = env;
  const tracks = buildTracks(playlist.entryIds, "full", { ...loadPrefs(), savedOnly: false });
  if (!tracks.length) {
    toast("None of these songs has a YouTube video to play");
    return false;
  }
  if (tracks.length > YT_MUSIC_MAX) toast(`YouTube Music takes the first ${YT_MUSIC_MAX} songs`);
  void openYouTubeMusic(tracks.map((t) => t.videoId));
  return true;
}

/** The rest of the radio's queue, from the song playing now, moves to YouTube Music. */
export function radioToYouTubeMusic() {
  if (radio) void openYouTubeMusic(radio.tracks.slice(radio.index).map((t) => t.videoId));
}

export function setCarMode(car: boolean) {
  if (!radio) return;
  radio = { ...radio, car };
  emit();
}

// ---------- DJ voice ----------

function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

function speak(text: string): Promise<void> {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.02;
    const voice = synth.getVoices().find((v) => v.lang.startsWith("en") && /natural|google|samantha|daniel/i.test(v.name));
    if (voice) u.voice = voice;
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    // Some browsers never fire onend: never hold the music hostage.
    const timer = setTimeout(done, 9000);
    u.onend = done;
    u.onerror = done;
    synth.cancel();
    synth.speak(u);
  });
}

const STATUS_LINE: Partial<Record<Status, string[]>> = {
  LEARNING: ["one you're learning right now", "your current homework", "the one on your stand"],
  WANT_TO_PLAY: ["next on your list to learn", "one from Up Next"],
  MASTERED: ["one you've mastered", "a song you nailed"],
  CAN_PLAY: ["one you can already play"],
  BACKLOG: ["from your backlog", "one you saved for someday"],
};
const INTROS = ["Up next", "Coming up", "Next", "Here comes"];
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

function songOf(entryId: string) {
  const v = ctx.views.find((x) => x.id === entryId);
  return v ? { title: v.song.title, artist: v.song.artist, tuning: v.entry.tuning, status: v.entry.status } : null;
}

function djLine(prev: Track, next: Track) {
  const a = songOf(prev.entryId);
  const b = songOf(next.entryId);
  if (!b) return "";
  const parts: string[] = [];
  if (a && Math.random() < 0.5) parts.push(`That was ${a.title}.`);
  parts.push(`${pick(INTROS)}: ${b.title}${b.artist ? `, by ${b.artist}` : ""}.`);
  const facts: string[] = [];
  const line = STATUS_LINE[b.status];
  if (line) facts.push(pick(line));
  if (b.tuning && b.tuning !== a?.tuning) facts.push(`in ${b.tuning}`);
  if (facts.length) parts.push(`${facts.join(", ")[0].toUpperCase()}${facts.join(", ").slice(1)}.`);
  return parts.join(" ");
}
