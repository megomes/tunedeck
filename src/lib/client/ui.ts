"use client";

import { useSyncExternalStore } from "react";

// ---------- Toasts ----------

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let nextId = 1;

function emitToasts() {
  toastListeners.forEach((l) => l());
}

export function toast(message: string, action?: Toast["action"], ms = 4500) {
  const t = { id: nextId++, message, action };
  toasts = [...toasts.slice(-2), t];
  emitToasts();
  setTimeout(() => dismissToast(t.id), ms);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
}

// ---------- "Now playing" dock ----------
// Opening a tab or video marks the song as active, so coming back to the app
// shows a dock with a one-tap +1 — the "open Songsterr → play → +1" loop.

const ACTIVE_KEY = "td.active";
let active: string | null = null;
let activeLoaded = false;
const activeListeners = new Set<() => void>();

function loadActive() {
  if (activeLoaded || typeof window === "undefined") return;
  activeLoaded = true;
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw) {
      const { id, at } = JSON.parse(raw);
      if (Date.now() - at < 1000 * 60 * 60 * 6) active = id;
    }
  } catch {
    /* ignore */
  }
}

export function setActiveSong(id: string | null) {
  active = id;
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now() }));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
  activeListeners.forEach((l) => l());
}

export function useActiveSong() {
  return useSyncExternalStore(
    (l) => {
      activeListeners.add(l);
      return () => activeListeners.delete(l);
    },
    () => {
      loadActive();
      return active;
    },
    () => null,
  );
}

// ---------- Per-device preferences ----------

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`td.pref.${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`td.pref.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// ---------- Embedded YouTube player ----------
// One player lives in the app shell so playback survives navigation; it is either
// expanded (full view) or minimized into the mini-player above the bottom nav.

export type PlayerState =
  | { kind: "resource"; resourceId: string; entryId: string; riffId?: string; expanded: boolean }
  | { kind: "jam"; trackId: string; expanded: boolean };

let player: PlayerState | null = null;
const playerListeners = new Set<() => void>();

function emitPlayer() {
  playerListeners.forEach((l) => l());
}

export function playJam(trackId: string) {
  player = { kind: "jam", trackId, expanded: true };
  emitPlayer();
}

export function playVideo(resourceId: string, entryId: string, riffId?: string) {
  player = { kind: "resource", resourceId, entryId, riffId, expanded: true };
  // The mini-player replaces the "played it?" dock for this song.
  if (active === entryId) setActiveSong(null);
  emitPlayer();
}

export function setPlayerExpanded(expanded: boolean) {
  if (!player) return;
  player = { ...player, expanded };
  emitPlayer();
}

export function closePlayer() {
  player = null;
  emitPlayer();
}

export function usePlayer() {
  return useSyncExternalStore(
    (l) => {
      playerListeners.add(l);
      return () => playerListeners.delete(l);
    },
    () => player,
    () => null,
  );
}

// ---------- "Up Next is full": which one makes room? ----------

let swapFor: string | null = null;
const swapListeners = new Set<() => void>();

/** Opens the sheet that asks which Up Next song to swap out for this one. */
export function askUpNextSwap(entryId: string | null) {
  swapFor = entryId;
  swapListeners.forEach((l) => l());
}

export function useUpNextSwap() {
  return useSyncExternalStore(
    (l) => {
      swapListeners.add(l);
      return () => swapListeners.delete(l);
    },
    () => swapFor,
    () => null,
  );
}
