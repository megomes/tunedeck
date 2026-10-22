"use client";

import { Pause, Play, Repeat, RotateCcw, RotateCw, SkipBack } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { claimAudio, releaseAudio, sharedAudio } from "@/lib/client/backgroundAudio";
import { openLocalVideo } from "@/lib/client/offline";
import { readPref, writePref } from "@/lib/client/ui";

/** What the Player needs from any playback engine (YouTube or this one). */
export interface Engine {
  time(): number;
  duration(): number;
  playing(): boolean;
  seek(t: number): void;
  play(): void;
  pause(): void;
  rate(): number;
  setRate(r: number): void;
}

export interface Variant {
  semitones: number;
  label: string;
}

export const SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
const SKIP = 5;
/** Dragging across the whole video moves this many seconds. */
const SCRUB_SPAN = 40;
const DOUBLE_TAP_MS = 300;

function clock(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Flash = { id: number; kind: "play" | "pause" | "back" | "fwd"; text?: string };

/**
 * TuneDeck's own player for videos stored on the device. One <video> per tuning variant;
 * switching tuning seeks the other element to the same spot, so there is never a second
 * clock to keep in sync. Gestures: tap = play/pause, double-tap sides = ∓5s (keep tapping
 * for more), drag sideways = scrub.
 *
 * `background` (the radio): the sound comes from the shared <audio> instead, so it keeps playing
 * with the screen locked; the video follows it on screen and stops while the screen is off.
 */
export function NativeVideo({
  videoId,
  variants,
  start,
  expanded,
  controlsHost,
  engineRef,
  title,
  artist,
  onUnavailable,
  background = false,
  stopAt,
  onEnded,
}: {
  videoId: string;
  variants: Variant[];
  start: number;
  expanded: boolean;
  controlsHost: HTMLElement | null;
  engineRef: RefObject<Engine | null>;
  title: string;
  artist: string | null;
  onUnavailable: () => void;
  background?: boolean;
  /** Where the song stops (the radio's best parts). */
  stopAt?: number;
  /** The end (or `stopAt`) was reached. Fires from media events, which keep coming with the screen locked. */
  onEnded?: () => void;
}) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const els = useRef<Record<number, HTMLVideoElement | null>>({});
  const [active, setActive] = useState(() => {
    const pref = readPref<boolean>("transpose", false);
    const shifted = variants.find((v) => v.semitones !== 0);
    return pref && shifted ? shifted.semitones : 0;
  });
  const activeRef = useRef(active);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<{ a: number; b: number | null } | null>(null);
  const loopRef = useRef(loop);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [scrub, setScrub] = useState<{ to: number; delta: number } | null>(null);
  const [switching, setSwitching] = useState(false);
  // Fixed for the life of the player: the Player remounts it when the radio starts or stops.
  const [audioMode] = useState(background);
  const endRef = useRef({ stopAt, onEnded });
  useEffect(() => {
    endRef.current = { stopAt, onEnded };
  });

  const variantKey = variants.map((v) => v.semitones).join(",");

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  // Load object URLs for every stored variant of this video.
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    (async () => {
      const next: Record<number, string> = {};
      for (const v of variants) {
        const url = await openLocalVideo(videoId, v.semitones);
        if (url) {
          made.push(url);
          next[v.semitones] = url;
        }
      }
      if (cancelled) return;
      if (next[0] == null) return onUnavailable();
      setUrls(next);
      if (next[activeRef.current] == null) {
        activeRef.current = 0;
        setActive(0);
      }
    })();
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, variantKey]);

  /** The video on screen. */
  const shown = useCallback(() => els.current[activeRef.current] ?? null, []);
  /** What plays the sound and keeps the time: the shared audio in background mode, else the video. */
  const cur = useCallback((): HTMLMediaElement | null => (audioMode ? sharedAudio() : shown()), [audioMode, shown]);

  const applyRate = useCallback(
    (s: number) => {
      setRate(s);
      Object.values(els.current).forEach((v) => v && (v.playbackRate = s));
      if (audioMode) sharedAudio().playbackRate = s;
    },
    [audioMode],
  );

  useEffect(() => {
    engineRef.current = {
      time: () => cur()?.currentTime ?? 0,
      duration: () => cur()?.duration || 0,
      playing: () => {
        const v = cur();
        return !!v && !v.paused && !v.ended;
      },
      seek: (t) => {
        const v = cur();
        if (v) v.currentTime = t;
      },
      play: () => void cur()?.play().catch(() => {}),
      pause: () => cur()?.pause(),
      rate: () => cur()?.playbackRate ?? 1,
      setRate: (r) => applyRate(r),
    };
    return () => {
      engineRef.current = null;
    };
  }, [engineRef, cur, applyRate]);

  // ---------- Background mode: the shared audio plays, the video follows ----------

  /** Puts the video where the audio is, playing only while the screen is on. */
  const follow = useCallback(() => {
    const v = shown();
    if (!audioMode || !v || v.readyState < 1) return;
    const a = sharedAudio();
    if (Math.abs(v.currentTime - a.currentTime) > 0.25) v.currentTime = a.currentTime;
    v.playbackRate = a.playbackRate;
    if (!a.paused && document.visibilityState === "visible") void v.play().catch(() => {});
    else if (!v.paused) v.pause();
  }, [audioMode, shown]);

  // The audio starts as soon as the file is open: no waiting for the video.
  useEffect(() => {
    const url = urls[activeRef.current];
    if (!audioMode || !url) return;
    const a = sharedAudio();
    if (a.src === url) return;
    a.src = url;
    a.playbackRate = rate;
    const begin = () => {
      if (start) a.currentTime = start;
      setDuration(a.duration);
      void a.play().catch(() => setPlaying(false));
    };
    a.addEventListener("loadedmetadata", begin, { once: true });
    return () => a.removeEventListener("loadedmetadata", begin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioMode, urls]);

  useEffect(() => {
    if (!audioMode) return;
    const me = Symbol("player");
    claimAudio(me);
    const a = sharedAudio();
    // Only a song's end counts, not the silent clip that unlocks the element.
    const ended = () => a.src.startsWith("blob:") && endRef.current.onEnded?.();
    const on: [string, () => void][] = [
      ["play", () => (setPlaying(true), follow())],
      ["pause", () => (setPlaying(false), follow())],
      ["ended", () => (setPlaying(false), follow(), ended())],
      ["seeked", follow],
      ["ratechange", follow],
      ["durationchange", () => a.duration && setDuration(a.duration)],
      [
        "timeupdate",
        () => {
          const end = endRef.current.stopAt;
          if (end != null && a.currentTime >= end) ended();
        },
      ],
    ];
    on.forEach(([e, h]) => a.addEventListener(e, h));
    // Screen off: stop decoding the picture (battery, heat); back on: pick it up where the sound is.
    document.addEventListener("visibilitychange", follow);
    // Keep the picture in step with the sound.
    const drift = setInterval(follow, 1000);
    return () => {
      on.forEach(([e, h]) => a.removeEventListener(e, h));
      document.removeEventListener("visibilitychange", follow);
      clearInterval(drift);
      releaseAudio(me);
    };
  }, [audioMode, follow]);

  // Start playing once the first variant is ready.
  const started = useRef(false);
  useEffect(() => {
    started.current = false;
  }, [videoId]);
  const onReady = (semitones: number) => {
    const v = els.current[semitones];
    if (!v || semitones !== activeRef.current) return;
    if (audioMode) return follow();
    if (started.current) return;
    started.current = true;
    setDuration(v.duration);
    if (start) v.currentTime = start;
    v.playbackRate = rate;
    void v.play().catch(() => setPlaying(false));
  };

  const showFlash = (kind: Flash["kind"], text?: string) => setFlash({ id: Date.now(), kind, text });

  const togglePlay = useCallback(() => {
    const v = cur();
    if (!v) return;
    if (v.paused || v.ended) {
      void v.play().catch(() => {});
      showFlash("play");
    } else {
      v.pause();
      showFlash("pause");
    }
  }, [cur]);

  const seekTo = useCallback(
    (t: number) => {
      const v = cur();
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - 0.05));
    },
    [cur],
  );

  const seekBy = useCallback((d: number) => seekTo((cur()?.currentTime ?? 0) + d), [cur, seekTo]);

  /** Back to the start of the loop (or of the video) and play: the "one more time" button. */
  const restart = useCallback(() => {
    const v = cur();
    if (!v) return;
    v.currentTime = loopRef.current?.a ?? 0;
    void v.play().catch(() => {});
  }, [cur]);

  async function switchVariant(next: number) {
    if (next === activeRef.current || urls[next] == null || switching) return;
    if (audioMode) {
      // Same spot in the other file; the picture switches with it.
      const a = sharedAudio();
      const old = shown();
      const wasPlaying = !a.paused;
      const t = a.currentTime;
      setSwitching(true);
      try {
        a.src = urls[next];
        await new Promise((r) => a.addEventListener("loadedmetadata", r, { once: true }));
        a.currentTime = t;
        old?.pause();
        activeRef.current = next;
        setActive(next);
        writePref("transpose", next !== 0);
        if (wasPlaying) await a.play().catch(() => {});
        follow();
      } finally {
        setSwitching(false);
      }
      return;
    }
    const from = cur();
    const to = els.current[next];
    if (!from || !to) return;
    setSwitching(true);
    const wasPlaying = !from.paused;
    const t = from.currentTime;
    from.pause();
    try {
      if (to.readyState < 1) await new Promise((r) => to.addEventListener("loadedmetadata", r, { once: true }));
      to.playbackRate = from.playbackRate;
      to.currentTime = t;
      await new Promise((r) => to.addEventListener("seeked", r, { once: true }));
      from.muted = true;
      to.muted = false;
      activeRef.current = next;
      setActive(next);
      writePref("transpose", next !== 0);
      if (wasPlaying) await to.play().catch(() => {});
    } finally {
      setSwitching(false);
    }
  }

  // Keep A–B loops tight: check every frame while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = cur();
      const l = loopRef.current;
      if (v && l && l.b != null && v.currentTime >= l.b) v.currentTime = l.a;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, cur]);

  function cycleLoop() {
    const t = cur()?.currentTime ?? 0;
    if (!loop) setLoop({ a: t, b: null });
    else if (loop.b == null) setLoop(t > loop.a + 0.5 ? { a: loop.a, b: t } : null);
    else setLoop(null);
  }

  // Lock screen / headphone controls.
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    ms.metadata = new MediaMetadata({ title, artist: artist ?? "" });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void cur()?.play()],
      ["pause", () => cur()?.pause()],
      ["seekbackward", () => seekBy(-SKIP)],
      ["seekforward", () => seekBy(SKIP)],
      ["seekto", (d) => d.seekTime != null && seekTo(d.seekTime)],
    ];
    for (const [a, h] of handlers) {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* unsupported action */
      }
    }
    return () => {
      for (const [a] of handlers) {
        try {
          ms.setActionHandler(a, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [title, artist, cur, seekBy, seekTo]);

  // ---------- Gestures ----------
  const gesture = useRef<{ x: number; y: number; t0: number; time: number; scrubbing: boolean; id: number } | null>(null);
  const taps = useRef<{ side: "left" | "right"; at: number; total: number; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const lastScrubSeek = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    gesture.current = { x: e.clientX, y: e.clientY, t0: Date.now(), time: cur()?.currentTime ?? 0, scrubbing: false, id: e.pointerId };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || !expanded) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.scrubbing) {
      if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      g.scrubbing = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const width = e.currentTarget.clientWidth || 1;
    const dur = cur()?.duration || 0;
    const to = Math.max(0, Math.min(dur, g.time + (dx / width) * SCRUB_SPAN));
    setScrub({ to, delta: to - g.time });
    const now = Date.now();
    if (now - lastScrubSeek.current > 90) {
      lastScrubSeek.current = now;
      seekTo(to);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId) return;
    if (g.scrubbing) {
      if (scrub) seekTo(scrub.to);
      setScrub(null);
      return;
    }
    if (Date.now() - g.t0 > 600) return; // long press: ignore
    if (!expanded) return togglePlay();

    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    const side = rel < 0.33 ? "left" : rel > 0.67 ? "right" : null;
    const prev = taps.current;
    if (!side) {
      if (prev?.timer) clearTimeout(prev.timer);
      taps.current = null;
      return togglePlay();
    }
    const now = Date.now();
    // Second (third, …) tap on the same side: skip, and keep the streak going.
    if (prev && prev.side === side && now - prev.at < (prev.total ? 700 : DOUBLE_TAP_MS)) {
      if (prev.timer) clearTimeout(prev.timer);
      const total = prev.total + SKIP;
      seekBy(side === "left" ? -SKIP : SKIP);
      showFlash(side === "left" ? "back" : "fwd", `${side === "left" ? "−" : "+"}${total}s`);
      taps.current = { side, at: now, total, timer: null };
      return;
    }
    if (prev?.timer) clearTimeout(prev.timer);
    // A lone side tap still toggles play, once we know no second tap follows.
    taps.current = {
      side,
      at: now,
      total: 0,
      timer: setTimeout(() => {
        taps.current = null;
        togglePlay();
      }, DOUBLE_TAP_MS),
    };
  };

  useEffect(() => () => {
    if (taps.current?.timer) clearTimeout(taps.current.timer);
  }, []);

  const hasShift = variants.length > 1 && Object.keys(urls).length > 1;

  const controls = (
    <div className="nv-controls">
      <SeekBar getVideo={cur} duration={duration} loop={loop} onSeek={seekTo} />
      <div className="nv-buttons">
        <button className="icon-btn nv-skip" aria-label={loop ? "Back to loop start" : "Restart"} title={loop ? "Back to A" : "Restart"} onClick={restart}>
          <SkipBack />
        </button>
        <button className="icon-btn nv-skip" aria-label={`Back ${SKIP} seconds`} onClick={() => seekBy(-SKIP)}>
          <RotateCcw />
          <span>{SKIP}</span>
        </button>
        <button className="nv-play" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
          {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
        <button className="icon-btn nv-skip" aria-label={`Forward ${SKIP} seconds`} onClick={() => seekBy(SKIP)}>
          <RotateCw />
          <span>{SKIP}</span>
        </button>
        <button
          className={`chip sm nv-loop ${loop ? "active" : ""}`}
          aria-label="A–B loop"
          onClick={cycleLoop}
          title="Tap at the start of the part, tap again at its end, tap once more to clear"
        >
          <Repeat />
          {!loop ? "A–B" : loop.b == null ? `A ${clock(loop.a)} · set B` : `${clock(loop.a)}–${clock(loop.b)}`}
        </button>
      </div>

      {hasShift && (
        <div className="nv-row">
          <span className="step-title" style={{ margin: 0 }}>
            Tuning
          </span>
          <div className="segmented nv-tuning" role="radiogroup" aria-label="Tuning">
            {variants
              .filter((v) => urls[v.semitones] != null)
              .map((v) => (
                <button
                  key={v.semitones}
                  role="radio"
                  aria-checked={active === v.semitones}
                  className={`chip sm ${active === v.semitones ? "active" : ""}`}
                  disabled={switching}
                  onClick={() => void switchVariant(v.semitones)}
                >
                  {v.label}
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="nv-row">
        <span className="step-title" style={{ margin: 0 }}>
          Speed
        </span>
        <div className="segmented" style={{ flexWrap: "wrap" }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`chip sm ${rate === s ? "active" : ""}`}
              onClick={() => applyRate(s)}
            >
              {s === 1 ? "1×" : `${s}×`}
            </button>
          ))}
        </div>
      </div>
      <p className="meta" style={{ margin: 0 }}>
        Tap to pause · double-tap the sides to skip {SKIP}s · drag sideways to scrub
      </p>
    </div>
  );

  return (
    <>
      {variants.map((v) =>
        urls[v.semitones] ? (
          <video
            key={v.semitones}
            ref={(el) => {
              els.current[v.semitones] = el;
            }}
            className={`nv-video ${active === v.semitones ? "on" : ""}`}
            src={urls[v.semitones]}
            playsInline
            preload="auto"
            muted={audioMode || active !== v.semitones}
            onLoadedMetadata={() => onReady(v.semitones)}
            onDurationChange={(e) => !audioMode && active === v.semitones && setDuration(e.currentTarget.duration)}
            onPlay={() => !audioMode && active === v.semitones && setPlaying(true)}
            onPause={() => !audioMode && active === v.semitones && setPlaying(false)}
            onEnded={() => {
              if (audioMode || active !== v.semitones) return;
              setPlaying(false);
              endRef.current.onEnded?.();
            }}
          />
        ) : null,
      )}
      <div
        className="nv-gestures"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture.current = null;
          setScrub(null);
        }}
      >
        {scrub && (
          <div className="nv-scrub">
            <strong>{clock(scrub.to)}</strong>
            <span>
              {scrub.delta >= 0 ? "+" : "−"}
              {Math.abs(Math.round(scrub.delta))}s
            </span>
          </div>
        )}
        {flash && (
          <div key={flash.id} className={`nv-flash ${flash.kind}`} aria-hidden>
            {flash.kind === "play" && <Play fill="currentColor" />}
            {flash.kind === "pause" && <Pause fill="currentColor" />}
            {(flash.kind === "back" || flash.kind === "fwd") && (
              <>
                {flash.kind === "back" ? <RotateCcw /> : <RotateCw />}
                <span>{flash.text}</span>
              </>
            )}
          </div>
        )}
        {!playing && !scrub && expanded && (
          <div className="nv-paused" aria-hidden>
            <Play fill="currentColor" />
          </div>
        )}
        <ProgressLine getVideo={cur} duration={duration} />
        {hasShift && active !== 0 && <span className="nv-badge">{variants.find((v) => v.semitones === active)?.label}</span>}
      </div>
      {expanded && controlsHost && createPortal(controls, controlsHost)}
    </>
  );
}

/** Thin progress line along the bottom of the video, visible in every layout (mini player too). */
function ProgressLine({ getVideo, duration }: { getVideo: () => HTMLMediaElement | null; duration: number }) {
  const fill = useRef<HTMLElement>(null);
  useEffect(() => {
    let raf = 0;
    const paint = () => {
      const v = getVideo();
      if (v && fill.current && duration > 0) fill.current.style.width = `${(v.currentTime / duration) * 100}%`;
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [getVideo, duration]);
  return (
    <span className="nv-line" aria-hidden>
      <i ref={fill} />
    </span>
  );
}

/** Seek bar that repaints itself every frame without re-rendering the player. */
function SeekBar({
  getVideo,
  duration,
  loop,
  onSeek,
}: {
  getVideo: () => HTMLMediaElement | null;
  duration: number;
  loop: { a: number; b: number | null } | null;
  onSeek: (t: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    let raf = 0;
    const paint = () => {
      const v = getVideo();
      if (v && !dragging.current && duration > 0) {
        const pct = (v.currentTime / duration) * 100;
        fill.current!.style.width = `${pct}%`;
        knob.current!.style.left = `${pct}%`;
        now.current!.textContent = clock(v.currentTime);
        bar.current!.setAttribute("aria-valuenow", String(Math.round(v.currentTime)));
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [getVideo, duration]);

  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    fill.current!.style.width = `${pct * 100}%`;
    knob.current!.style.left = `${pct * 100}%`;
    now.current!.textContent = clock(pct * duration);
    return pct * duration;
  };

  return (
    <div className="nv-seek">
      <span ref={now} className="nv-time">
        0:00
      </span>
      <div
        ref={bar}
        className="nv-bar"
        role="slider"
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={0}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          at(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && at(e.clientX)}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          onSeek(at(e.clientX));
        }}
        onPointerCancel={() => (dragging.current = false)}
      >
        <div className="nv-track">
          {loop && duration > 0 && (
            <div
              className="nv-loop-range"
              style={{
                left: `${(loop.a / duration) * 100}%`,
                width: loop.b != null ? `${((loop.b - loop.a) / duration) * 100}%` : "2px",
              }}
            />
          )}
          <div ref={fill} className="nv-fill" />
        </div>
        <div ref={knob} className="nv-knob" />
      </div>
      <span className="nv-time">{clock(duration)}</span>
    </div>
  );
}
