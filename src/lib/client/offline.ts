"use client";

import { get, set } from "idb-keyval";
import { useSyncExternalStore } from "react";
import { transposeFor } from "@/lib/shared/tuning";
import type { Snapshot } from "@/lib/shared/types";
import { api, getState } from "./store";

/*
 * Videos on this phone/tablet, fetched from the TuneDeck desktop app (desktop/) over the
 * local network. The desktop app announces itself through /api/desktop; the phone then
 * opens a direct WebRTC data channel to it (host candidates only, so it only works on the
 * same Wi-Fi) and receives mp4 files, which are kept in Cache Storage.
 */

export interface LocalVideo {
  key: string;
  videoId: string;
  semitones: number;
  size: number;
  savedAt: string;
}

export interface WantItem {
  key: string;
  videoId: string;
  semitones: number;
  url: string;
  title: string;
}

export type TransferState = "queued" | "downloading" | "processing" | "ready" | "sending" | "saved" | "error";

export interface TransferItem {
  key: string;
  title: string;
  state: TransferState;
  progress: number;
  error?: string;
}

export type PcStatus = "idle" | "looking" | "connecting" | "connected" | "unreachable";

interface OfflineState {
  handheld: boolean;
  loaded: boolean;
  videos: Record<string, LocalVideo>;
  pcStatus: PcStatus;
  pcName: string | null;
  transfers: TransferItem[];
}

const CACHE = "td-videos";
const INDEX = "td.videos";

export const videoKey = (videoId: string, semitones: number) => `${videoId}:${semitones}`;
const cacheUrl = (key: string) => `/__video/${encodeURIComponent(key)}.mp4`;

let state: OfflineState = {
  handheld: false,
  loaded: false,
  videos: {},
  pcStatus: "idle",
  pcName: null,
  transfers: [],
};
const listeners = new Set<() => void>();

function setState(patch: Partial<OfflineState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useOffline<T>(selector: (s: OfflineState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
    () => selector({ ...state, handheld: false }),
  );
}

/** Phones and tablets only: desktop browsers always use the YouTube player. */
function detectHandheld() {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  return "Device";
}

let started = false;

export async function initOffline() {
  if (started || typeof window === "undefined") return;
  started = true;
  const handheld = detectHandheld();
  let videos: Record<string, LocalVideo> = {};
  try {
    videos = (await get<Record<string, LocalVideo>>(INDEX)) ?? {};
  } catch {
    /* no IndexedDB: nothing stored */
  }
  setState({ handheld, videos, loaded: true });
  if (!handheld) return;
  void findDesktop();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void findDesktop();
  });
}

// ---------- Local files ----------

async function saveIndex() {
  try {
    await set(INDEX, state.videos);
  } catch (err) {
    console.warn("Video index write failed", err);
  }
}

async function storeFile(key: string, videoId: string, semitones: number, blob: Blob) {
  const cache = await caches.open(CACHE);
  await cache.put(
    cacheUrl(key),
    new Response(blob, { headers: { "Content-Type": "video/mp4", "Content-Length": String(blob.size) } }),
  );
  setState({
    videos: { ...state.videos, [key]: { key, videoId, semitones, size: blob.size, savedAt: new Date().toISOString() } },
  });
  await saveIndex();
  // Ask the browser not to evict the videos under storage pressure.
  void navigator.storage?.persist?.().catch(() => false);
}

/** Semitone variants of a video stored on this device (only on phones/tablets). */
export function useLocalVariants(videoId: string | null): number[] {
  const videos = useOffline((s) => (s.handheld ? s.videos : null));
  if (!videoId || !videos) return [];
  return Object.values(videos)
    .filter((v) => v.videoId === videoId)
    .map((v) => v.semitones)
    .sort((a, b) => a - b);
}

/** Object URL for a stored video, or null when it is gone (evicted, deleted). */
export async function openLocalVideo(videoId: string, semitones: number): Promise<string | null> {
  const key = videoKey(videoId, semitones);
  try {
    const cache = await caches.open(CACHE);
    const res = await cache.match(cacheUrl(key));
    if (res) return URL.createObjectURL(await res.blob());
  } catch {
    /* fall through */
  }
  await removeVideo(key);
  return null;
}

export async function removeVideo(key: string) {
  const { [key]: _gone, ...rest } = state.videos;
  void _gone;
  setState({ videos: rest });
  await saveIndex();
  try {
    await (await caches.open(CACHE)).delete(cacheUrl(key));
  } catch {
    /* ignore */
  }
}

export async function clearVideos() {
  setState({ videos: {} });
  await saveIndex();
  try {
    await caches.delete(CACHE);
  } catch {
    /* ignore */
  }
}

// ---------- What should be on the device ----------

/** Every YouTube video in the library, plus a standard-tuning copy for songs in other tunings. */
export function wantedVideos(data: Snapshot): WantItem[] {
  const out = new Map<string, WantItem>();
  const add = (videoId: string, semitones: number, url: string, title: string) => {
    const key = videoKey(videoId, semitones);
    if (!out.has(key)) out.set(key, { key, videoId, semitones, url, title });
  };
  for (const r of data.resources) {
    if (r.provider !== "youtube" || !r.externalId) continue;
    const entry = data.entries.find((e) => e.id === r.repertoireEntryId);
    const song = entry && data.songs.find((s) => s.id === entry.songId);
    const title = [song?.title, r.title].filter(Boolean).join(" — ") || r.url;
    add(r.externalId, 0, r.url, title);
    // A video flagged as already in standard tuning must not be shifted again.
    const shift = r.type === "standard_tuning" ? null : transposeFor(entry?.tuning);
    if (shift) add(r.externalId, shift.semitones, r.url, `${title} (${shift.target})`);
  }
  for (const t of data.jamTracks) {
    if (t.videoId) add(t.videoId, 0, t.url, `Jam — ${t.title}`);
  }
  return [...out.values()];
}

export function missingVideos(data: Snapshot, videos: Record<string, LocalVideo>) {
  return wantedVideos(data).filter((w) => !videos[w.key]);
}

// ---------- Desktop connection ----------

interface Incoming {
  key: string;
  size: number;
  received: number;
  parts: ArrayBuffer[];
}

let conn: RTCPeerConnection | null = null;
let channel: RTCDataChannel | null = null;
let incoming: Incoming | null = null;
let lastAttempt = 0;
let lastProgressPaint = 0;
const titles = new Map<string, string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function send(msg: unknown) {
  if (channel?.readyState === "open") channel.send(JSON.stringify(msg));
}

function updateTransfer(key: string, patch: Partial<TransferItem>) {
  const i = state.transfers.findIndex((t) => t.key === key);
  const base: TransferItem = i >= 0 ? state.transfers[i] : { key, title: titles.get(key) ?? key, state: "queued", progress: 0 };
  const next = { ...base, ...patch };
  const transfers = state.transfers.slice();
  if (i >= 0) transfers[i] = next;
  else transfers.push(next);
  setState({ transfers });
}

function waitForIce(pc: RTCPeerConnection, ms: number) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, ms);
  });
}

function disconnect(status: PcStatus = "idle") {
  channel?.close();
  conn?.close();
  channel = null;
  conn = null;
  incoming = null;
  // Anything still in flight will be asked for again on the next connection.
  const transfers = state.transfers.filter((t) => t.state === "saved" || t.state === "error");
  setState({ pcStatus: status, transfers });
}

/**
 * Looks for the desktop app and connects to it. Only succeeds on the same network:
 * no STUN/TURN servers are used, so the peers can only reach each other's LAN address.
 */
export async function findDesktop(force = false): Promise<boolean> {
  if (!state.handheld || channel?.readyState === "open") return channel?.readyState === "open";
  if (state.pcStatus === "looking" || state.pcStatus === "connecting") return false;
  if (!force && Date.now() - lastAttempt < 60_000) return false;
  lastAttempt = Date.now();
  if (!navigator.onLine || typeof RTCPeerConnection === "undefined") return false;

  setState({ pcStatus: "looking" });
  let name: string | null = null;
  try {
    const res = await api("/api/desktop", { cache: "no-store" });
    const body = res.ok ? await res.json() : null;
    if (!body?.online) {
      setState({ pcStatus: "idle", pcName: null });
      return false;
    }
    name = body.name as string;
  } catch {
    setState({ pcStatus: "idle" });
    return false;
  }

  setState({ pcStatus: "connecting", pcName: name });
  const pc = new RTCPeerConnection({ iceServers: [] });
  const ch = pc.createDataChannel("tunedeck", { ordered: true });
  ch.binaryType = "arraybuffer";
  conn = pc;
  channel = ch;
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc, 2500);
    const sid = crypto.randomUUID();
    const posted = await api("/api/desktop", {
      method: "POST",
      body: JSON.stringify({ offer: { sid, sdp: pc.localDescription!.sdp, device: deviceName() } }),
    });
    if (!posted.ok) throw new Error("offer rejected");

    // The desktop app picks offers up on its next poll (every few seconds).
    let answer: string | null = null;
    for (let i = 0; i < 30 && !answer; i++) {
      await sleep(1000);
      if (conn !== pc) return false;
      const res = await api(`/api/desktop/answer?sid=${sid}`, { cache: "no-store" });
      if (res.ok) answer = (await res.json()).sdp;
    }
    if (!answer) throw new Error("no answer");
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    await new Promise<void>((resolve, reject) => {
      if (ch.readyState === "open") return resolve();
      const t = setTimeout(() => reject(new Error("not on the same network")), 12_000);
      ch.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          clearTimeout(t);
          reject(new Error("not on the same network"));
        }
      };
    });
  } catch (err) {
    console.info("Desktop app not reachable", err);
    if (conn === pc) disconnect("unreachable");
    return false;
  }

  ch.onmessage = (e) => onMessage(e.data);
  ch.onclose = () => channel === ch && disconnect();
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      if (conn === pc) disconnect();
    }
  };
  setState({ pcStatus: "connected" });
  send({ t: "hello", device: deviceName() });
  return true;
}

/** Asks the desktop app for every video this device is missing. */
export async function downloadMissing() {
  if (channel?.readyState !== "open" && !(await findDesktop(true))) return false;
  const items = missingVideos(getState().data, state.videos);
  const busy = new Set(state.transfers.filter((t) => t.state !== "saved" && t.state !== "error").map((t) => t.key));
  const fresh = items.filter((i) => !busy.has(i.key));
  for (const i of fresh) {
    titles.set(i.key, i.title);
    updateTransfer(i.key, { title: i.title, state: "queued", progress: 0, error: undefined });
  }
  if (fresh.length) send({ t: "want", items: fresh });
  return true;
}

export function clearFinishedTransfers() {
  setState({ transfers: state.transfers.filter((t) => t.state !== "saved" && t.state !== "error") });
}

async function onMessage(data: unknown) {
  if (typeof data !== "string") {
    if (!incoming || !(data instanceof ArrayBuffer)) return;
    incoming.parts.push(data);
    incoming.received += data.byteLength;
    const now = Date.now();
    if (now - lastProgressPaint > 250) {
      lastProgressPaint = now;
      updateTransfer(incoming.key, { state: "sending", progress: incoming.received / incoming.size });
    }
    return;
  }
  let msg: { t: string; [k: string]: unknown };
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }
  switch (msg.t) {
    case "status": {
      const key = msg.key as string;
      if (state.videos[key]) return;
      updateTransfer(key, {
        state: msg.state as TransferState,
        progress: Number(msg.progress ?? 0),
        error: (msg.error as string | undefined) ?? undefined,
      });
      return;
    }
    case "file":
      incoming = { key: msg.key as string, size: Number(msg.size), received: 0, parts: [] };
      updateTransfer(incoming.key, { state: "sending", progress: 0 });
      return;
    case "end": {
      const file = incoming;
      incoming = null;
      if (!file || file.key !== msg.key) return;
      if (file.received !== file.size) {
        updateTransfer(file.key, { state: "error", error: "Transfer was incomplete" });
        send({ t: "failed", key: file.key });
        return;
      }
      const [videoId, semis] = file.key.split(":");
      try {
        await storeFile(file.key, videoId, Number(semis), new Blob(file.parts, { type: "video/mp4" }));
        updateTransfer(file.key, { state: "saved", progress: 1 });
        send({ t: "saved", key: file.key });
      } catch (err) {
        const full = err instanceof DOMException && err.name === "QuotaExceededError";
        updateTransfer(file.key, { state: "error", error: full ? "No space left on this device" : "Couldn't save the video" });
        send({ t: "failed", key: file.key });
      }
      return;
    }
  }
}
