"use client";

import { Volume2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { clipStarts } from "@/lib/client/backlog";
import { openLocalVideo } from "@/lib/client/offline";

/*
 * Short previews of videos saved on this device (Backlog grid and "What do I play now?").
 * Every preview uses the same <video> element, moved into whichever card or slide is playing:
 * browsers unlock sound per element, so after the first tap with sound every next clip plays
 * with sound too, even when it starts without a tap (swiping in the feed).
 */

let el: HTMLVideoElement | null = null;
let muted = false;
/** Muted only because the browser wants a tap before playing sound. */
let blocked = false;
const muteListeners = new Set<() => void>();

function video() {
  if (!el) {
    el = document.createElement("video");
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.preload = "auto";
    el.disablePictureInPicture = true;
    el.className = "clip-video";
  }
  return el;
}

function setMuted(m: boolean, byBrowser = false) {
  muted = m;
  blocked = m && byBrowser;
  if (el) el.muted = m;
  muteListeners.forEach((l) => l());
}

const subscribeMute = (l: () => void) => {
  muteListeners.add(l);
  return () => {
    muteListeners.delete(l);
  };
};

/** Whether previews are silent (by choice, or until a tap allows sound). */
export function useClipMuted() {
  return useSyncExternalStore(subscribeMute, () => muted, () => false);
}

function useSoundBlocked() {
  return useSyncExternalStore(subscribeMute, () => blocked, () => false);
}

/** Call from a tap: allows sound for every later clip and turns it on. */
export function unmuteClips() {
  setMuted(false);
  if (el?.src) void el.play().catch(() => {});
}

export function toggleClipsMuted() {
  if (muted) unmuteClips();
  else setMuted(true);
}

/** Object URLs of the last few videos, so swiping back and forth doesn't reread them. */
const urls = new Map<string, Promise<string | null>>();
const KEEP = 4;

function urlFor(videoId: string) {
  let p = urls.get(videoId);
  if (p) urls.delete(videoId);
  else p = openLocalVideo(videoId, 0);
  urls.set(videoId, p);
  for (const [k, old] of urls) {
    if (urls.size <= KEEP) break;
    if (k === videoId || k === el?.dataset.videoId) continue;
    urls.delete(k);
    void old.then((u) => u && URL.revokeObjectURL(u));
  }
  return p;
}

/** Starts reading a video before its slide shows up. */
export function prefetchClip(videoId: string | null | undefined) {
  if (videoId) void urlFor(videoId);
}

export interface ClipState {
  /** Which clip of this song is playing, out of `count`. */
  part: number;
  count: number;
  /** 0–1 through the current clip. */
  progress: number;
  time: number;
  paused: boolean;
}

export interface ClipCtl {
  next(): void;
  prev(): void;
  toggle(): void;
  time(): number;
}

/**
 * Plays a song's clips back to back and loops: the ⭐ first (if any), then a few spots spread over
 * the song, `len` seconds each.
 */
export function Clip({
  videoId,
  star,
  len,
  ctlRef,
  onState,
  onUnavailable,
  className,
}: {
  videoId: string;
  star: number | null;
  len: number;
  ctlRef?: RefObject<ClipCtl | null>;
  onState?: (s: ClipState) => void;
  onUnavailable?: () => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const starts = useRef<number[]>([]);
  const part = useRef(0);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const loading = readyFor !== videoId;
  const silent = useSoundBlocked();
  const stateCb = useRef(onState);
  const lost = useRef(onUnavailable);
  useEffect(() => {
    stateCb.current = onState;
    lost.current = onUnavailable;
  });

  const mine = () => !!host.current && el?.parentNode === host.current;

  const report = () => {
    const v = el;
    if (!v || !mine()) return;
    const s = starts.current[part.current] ?? 0;
    stateCb.current?.({
      part: part.current,
      count: starts.current.length,
      progress: Math.min(1, Math.max(0, (v.currentTime - s) / len)),
      time: v.currentTime,
      paused: v.paused,
    });
  };

  const play = () => {
    const v = video();
    v.muted = muted;
    v.play().catch((err: unknown) => {
      // Sound needs a tap first: play silently and show the "tap for sound" button.
      if (err instanceof DOMException && err.name === "NotAllowedError" && !v.muted) {
        setMuted(true, true);
        void v.play().catch(() => {});
      }
    });
  };

  const go = (i: number) => {
    const n = starts.current.length || 1;
    part.current = ((i % n) + n) % n;
    const v = video();
    v.currentTime = starts.current[part.current] ?? 0;
    play();
    report();
  };

  // Move the shared element in, and take it back out (paused) when this preview goes away.
  useEffect(() => {
    const v = video();
    const h = host.current!;
    h.appendChild(v);
    return () => {
      if (v.parentNode === h) {
        v.pause();
        h.removeChild(v);
      }
    };
  }, []);

  // Load the video and start at the first clip.
  useEffect(() => {
    let cancelled = false;
    const v = video();
    (async () => {
      const url = await urlFor(videoId);
      if (cancelled || !mine()) return;
      if (!url) return lost.current?.();
      const begin = () => {
        if (cancelled || !mine()) return;
        starts.current = clipStarts(v.duration, star, len);
        setReadyFor(videoId);
        go(0);
      };
      if (v.dataset.videoId !== videoId) {
        v.dataset.videoId = videoId;
        v.src = url;
        v.addEventListener("loadedmetadata", begin, { once: true });
      } else if (v.readyState >= 1) begin();
      else v.addEventListener("loadedmetadata", begin, { once: true });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // A new ⭐ (or clip length) reshapes the clips without jumping away from what's playing.
  useEffect(() => {
    const v = el;
    if (!v || !mine() || !v.duration) return;
    starts.current = clipStarts(v.duration, star, len);
    const t = v.currentTime;
    const at = starts.current.findIndex((s) => t >= s - 0.5 && t < s + len);
    part.current = at >= 0 ? at : Math.min(part.current, starts.current.length - 1);
    report();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [star, len]);

  // Clip over: next one (looping back to the first).
  useEffect(() => {
    const v = video();
    const onTime = () => {
      if (!mine() || !starts.current.length) return;
      const s = starts.current[part.current] ?? 0;
      if (v.currentTime >= s + len || v.ended) go(part.current + 1);
      else report();
    };
    const onPlayPause = () => report();
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onTime);
    v.addEventListener("play", onPlayPause);
    v.addEventListener("pause", onPlayPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onTime);
      v.removeEventListener("play", onPlayPause);
      v.removeEventListener("pause", onPlayPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [len]);

  useEffect(() => {
    if (!ctlRef) return;
    ctlRef.current = {
      next: () => go(part.current + 1),
      prev: () => go(part.current - 1),
      toggle: () => {
        const v = video();
        if (v.paused) play();
        else v.pause();
      },
      time: () => (mine() ? video().currentTime : 0),
    };
    return () => {
      ctlRef.current = null;
    };
  });

  return (
    <div className={`clip ${className ?? ""}`}>
      <div ref={host} className="clip-host" />
      {loading && <div className="clip-loading" aria-hidden />}
      {silent && !loading && (
        <button
          className="clip-sound"
          onClick={(e) => {
            e.stopPropagation();
            unmuteClips();
          }}
        >
          <Volume2 /> Tap for sound
        </button>
      )}
    </div>
  );
}
