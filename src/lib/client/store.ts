"use client";

import { del, get, set } from "idb-keyval";
import { useSyncExternalStore } from "react";
import { applyOp } from "@/lib/shared/reduce";
import { EMPTY_SNAPSHOT, type JamTrack, type Op, type QueuedOp, type Resource, type Snapshot } from "@/lib/shared/types";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export interface StoreState {
  /** Local cache has been read from IndexedDB. */
  ready: boolean;
  /** At least one successful server snapshot was ever received on this device. */
  everSynced: boolean;
  /** Last known server state. */
  base: Snapshot;
  /** Local mutations not yet confirmed by the server. */
  outbox: QueuedOp[];
  /** What the UI renders: base + outbox. */
  data: Snapshot;
  sync: SyncStatus;
  lastSyncAt: string | null;
  authRequired: boolean;
}

const KEY_BASE = "td.base";
const KEY_OUTBOX = "td.outbox";
const KEY_META = "td.meta";

let state: StoreState = {
  ready: false,
  everSynced: false,
  base: EMPTY_SNAPSHOT,
  outbox: [],
  data: EMPTY_SNAPSHOT,
  sync: "idle",
  lastSyncAt: null,
  authRequired: false,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getState() {
  return state;
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

export const useData = () => useStore((s) => s.data);

function rebase(base: Snapshot, outbox: QueuedOp[]) {
  return outbox.reduce((acc, q) => applyOp(acc, q.op), base);
}

async function persist() {
  try {
    await Promise.all([
      set(KEY_BASE, state.base),
      set(KEY_OUTBOX, state.outbox),
      set(KEY_META, { everSynced: state.everSynced, lastSyncAt: state.lastSyncAt }),
    ]);
  } catch (err) {
    console.warn("IndexedDB write failed", err);
  }
}

const isOnline = () => typeof navigator === "undefined" || navigator.onLine;

let started = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2000;

export async function initStore() {
  if (started) return;
  started = true;
  try {
    const [base, outbox, meta] = await Promise.all([
      get<Snapshot>(KEY_BASE),
      get<QueuedOp[]>(KEY_OUTBOX),
      get<{ everSynced: boolean; lastSyncAt: string | null }>(KEY_META),
    ]);
    const b = { ...EMPTY_SNAPSHOT, ...(base ?? {}) };
    const o = outbox ?? [];
    setState({
      ready: true,
      base: b,
      outbox: o,
      data: rebase(b, o),
      everSynced: meta?.everSynced ?? false,
      lastSyncAt: meta?.lastSyncAt ?? null,
    });
  } catch {
    setState({ ready: true });
  }

  window.addEventListener("online", () => void sync());
  window.addEventListener("offline", () => setState({ sync: "offline" }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") void sync();
  }, 90_000);
  void sync();
}

/** Applies ops locally right away and queues them for the server. */
export function dispatch(...ops: Op[]) {
  if (!ops.length) return;
  const queued = ops.map((op) => ({ qid: crypto.randomUUID(), op, at: new Date().toISOString() }));
  const outbox = [...state.outbox, ...queued];
  setState({ outbox, data: ops.reduce(applyOp, state.data) });
  void persist();
  scheduleFlush();
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void sync(), 250);
}

class AuthError extends Error {}

async function api(path: string, init?: RequestInit & { timeoutMs?: number }) {
  // A request that never settles (flaky network, server restart) must not block the sync loop.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 20_000);
  try {
    const res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (res.status === 401) throw new AuthError("unauthorized");
    return res;
  } finally {
    clearTimeout(timer);
  }
}

let syncing: Promise<void> | null = null;
let again = false;

/** Pushes the outbox, then pulls a fresh snapshot and rebases pending ops on top. */
export function sync(): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    if (!isOnline()) {
      setState({ sync: "offline" });
      return;
    }
    setState({ sync: "syncing" });
    try {
      const sending = state.outbox;
      if (sending.length) {
        const res = await api("/api/ops", { method: "POST", body: JSON.stringify({ ops: sending.map((q) => q.op) }) });
        if (!res.ok) throw new Error(`ops failed: ${res.status}`);
        const result = await res.json();
        if (result.failed?.length) console.warn("Some ops were rejected by the server", result.failed);
        const sent = new Set(sending.map((q) => q.qid));
        setState({ outbox: state.outbox.filter((q) => !sent.has(q.qid)) });
      }
      const res = await api("/api/snapshot", { cache: "no-store" });
      if (!res.ok) throw new Error(`snapshot failed: ${res.status}`);
      const base = (await res.json()) as Snapshot;
      setState({
        base,
        data: rebase(base, state.outbox),
        everSynced: true,
        lastSyncAt: new Date().toISOString(),
        sync: "idle",
        authRequired: false,
      });
      retryDelay = 2000;
      await persist();
      void enrichPending();
    } catch (err) {
      if (err instanceof AuthError) {
        setState({ authRequired: true, sync: "error" });
        return;
      }
      setState({ sync: isOnline() ? "error" : "offline" });
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void sync(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60_000);
    }
  })().finally(() => {
    syncing = null;
    if (again) {
      again = false;
      void sync();
    }
  });
  return syncing;
}

// ---------- Metadata enrichment (never blocks saving) ----------

const enriching = new Set<string>();

export async function enrichResource(resourceId: string) {
  if (enriching.has(resourceId) || !isOnline()) return;
  const r = state.data.resources.find((x) => x.id === resourceId);
  if (!r || r.provider !== "youtube") return;
  enriching.add(resourceId);
  try {
    const res = await api("/api/enrich", { method: "POST", body: JSON.stringify({ url: r.url }) });
    const current = state.data.resources.find((x) => x.id === resourceId);
    if (!current) return;
    if (res.ok) {
      const meta = await res.json();
      const next: Resource = {
        ...current,
        title: current.title || meta.title,
        author: current.author || meta.author,
        thumbnailUrl: meta.thumbnailUrl ?? current.thumbnailUrl,
        durationSeconds: meta.durationSeconds ?? current.durationSeconds,
        externalId: meta.externalId ?? current.externalId,
        metaStatus: "ok",
        updatedAt: new Date().toISOString(),
      };
      dispatch({ t: "resource.upsert", resource: next });
    } else if (res.status === 404 || res.status === 502) {
      dispatch({ t: "resource.upsert", resource: { ...current, metaStatus: "failed" } });
    }
  } catch {
    /* offline or auth: stays pending and is retried after the next sync */
  } finally {
    enriching.delete(resourceId);
  }
}

export async function enrichJam(trackId: string) {
  const key = `jam:${trackId}`;
  if (enriching.has(key) || !isOnline()) return;
  const tr = state.data.jamTracks.find((x) => x.id === trackId);
  if (!tr) return;
  enriching.add(key);
  try {
    const res = await api("/api/enrich", { method: "POST", body: JSON.stringify({ url: tr.url }) });
    const current = state.data.jamTracks.find((x) => x.id === trackId);
    if (!current) return;
    if (res.ok) {
      const meta = await res.json();
      const next: JamTrack = {
        ...current,
        title: current.title && current.title !== current.url ? current.title : (meta.title ?? current.title),
        author: current.author || meta.author,
        thumbnailUrl: meta.thumbnailUrl ?? current.thumbnailUrl,
        durationSeconds: meta.durationSeconds ?? current.durationSeconds,
        metaStatus: "ok",
        updatedAt: new Date().toISOString(),
      };
      dispatch({ t: "jam.upsert", track: next });
    } else if (res.status === 404 || res.status === 502) {
      dispatch({ t: "jam.upsert", track: { ...current, metaStatus: "failed" } });
    }
  } catch {
    /* retried after the next sync */
  } finally {
    enriching.delete(key);
  }
}

async function enrichPending() {
  const pending = state.data.resources.filter((r) => r.provider === "youtube" && r.metaStatus === "pending");
  for (const r of pending.slice(0, 10)) await enrichResource(r.id);
  for (const t of state.data.jamTracks.filter((x) => x.metaStatus === "pending").slice(0, 10)) await enrichJam(t.id);
}

export async function fetchMeta(url: string) {
  const res = await api("/api/enrich", { method: "POST", body: JSON.stringify({ url }) });
  if (!res.ok) return null;
  return res.json();
}

export async function clearLocalCache() {
  await Promise.all([del(KEY_BASE), del(KEY_OUTBOX), del(KEY_META)]);
  setState({ base: EMPTY_SNAPSHOT, outbox: [], data: EMPTY_SNAPSHOT, everSynced: false, lastSyncAt: null });
  navigator.serviceWorker?.controller?.postMessage("clear");
  await sync();
}

export { api, AuthError };

/** True once there is something meaningful to render (local cache or first server sync). */
export function useLoaded() {
  return useStore((s) => s.ready && (s.everSynced || s.base.entries.length > 0 || s.outbox.length > 0 || s.authRequired));
}
