"use client";

import { Check, ChevronDown, ExternalLink, Gauge, Guitar, Play, Plus, SkipForward, Sparkles, Star, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { jamPlayed, openLink, openResource, openSongsterr, placeSameRecording, playedOnce } from "@/lib/client/actions";
import { duration } from "@/lib/client/format";
import { useLocalVariants } from "@/lib/client/offline";
import { detachRadio, getRadio, radioNext, radioPrev, stopRadio, useRadio, youtubeStoppedWhenLocked } from "@/lib/client/radio";
import { useData } from "@/lib/client/store";
import { closePlayer, playVideo, readPref, setPlayerExpanded, toast, usePlayer, writePref } from "@/lib/client/ui";
import { newTake, sample, thresholdFor, type Take } from "@/lib/client/takes";
import { useView } from "@/lib/client/views";
import { RESOURCE_LABEL, riffColor, type Resource } from "@/lib/shared/types";
import { hostLabel } from "@/lib/shared/urls";
import { scaleSuggestions } from "@/lib/shared/music";
import { transposeFor } from "@/lib/shared/tuning";
import { clearStar, holdFor, starHere } from "./BacklogCard";
import { NativeVideo, SPEEDS as NATIVE_SPEEDS, type Engine, type Variant } from "./NativeVideo";
import { CarMode, RadioPanel } from "./RadioControls";
import { RiffBar } from "./RiffBar";
import { SourceBadge } from "./SourceBadge";
import { Thumb } from "./Thumb";

// Minimal typing for the YouTube IFrame Player API.
interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onError?: (e: { data: number }) => void;
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  ytPromise ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      ytPromise = null;
      reject(new Error("YouTube API unavailable"));
    };
    document.head.appendChild(s);
  });
  return ytPromise;
}

function startSeconds(url: string) {
  try {
    const t = new URL(url).searchParams.get("t");
    if (!t) return 0;
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
  } catch {
    return 0;
  }
}

const SPEEDS = [0.5, 0.75, 1];
const PLAYING = 1;

function clock(sec: number) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What the player needs, whether it plays a song resource or a jam backing track. */
interface Media {
  key: string;
  videoId: string | null;
  url: string;
  title: string;
  author: string | null;
  durationSeconds: number | null;
  label: string;
  miniTitle: string;
  played: (auto: boolean) => void;
}

function JamInfo({ trackId }: { trackId: string }) {
  const data = useData();
  const t = data.jamTracks.find((x) => x.id === trackId);
  if (!t) return null;
  const scales = scaleSuggestions(t.musicalKey);
  const facts = [t.musicalKey, t.bpm ? `${t.bpm} BPM` : null, t.timeSignature, t.style].filter(Boolean);
  return (
    <div className="jam-info">
      {facts.length > 0 && (
        <div className="segmented">
          {facts.map((f) => (
            <span key={f} className="chip sm">
              {f}
            </span>
          ))}
        </div>
      )}
      {scales.length > 0 && (
        <div>
          <p className="step-title">Try these scales</p>
          <div className="scale-list">
            {scales.map((s, i) => (
              <span key={s} className={`scale ${i === 0 ? "first" : ""}`}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {t.notes && <p className="secondary" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{t.notes}</p>}
      <p className="meta" style={{ margin: 0 }}>
        Jammed {t.playCount}×{t.playCount ? ` · last ${new Date(t.lastPlayedAt!).toLocaleDateString()}` : ""}
      </p>
    </div>
  );
}

function StarRow({
  entryId,
  resource,
  star,
  engine,
  seek,
}: {
  entryId: string;
  resource: Resource;
  star: number | null;
  engine: RefObject<Engine | null>;
  seek: (t: number) => void;
}) {
  return (
    <div className="player-star">
      <button
        {...holdFor(star != null ? () => clearStar(entryId, resource, star) : null)}
        className={`chip sm star-hold ${star != null ? "starred" : ""}`}
        onClick={() => starHere(entryId, resource, engine.current?.time() ?? 0, star)}
      >
        <Star fill={star != null ? "currentColor" : "none"} /> {star != null ? "Move ⭐ here" : "Favorite moment"}
      </button>
      {star != null && (
        <>
          <button className="chip sm" onClick={() => seek(star)} aria-label="Jump to the star">
            <Play /> {duration(star)}
          </button>
          <button className="chip sm" onClick={() => clearStar(entryId, resource, star)} aria-label="Remove the star">
            <X /> Remove
          </button>
        </>
      )}
      {star == null && <span className="hint">Tap where your favorite part starts</span>}
    </div>
  );
}

export function Player() {
  const state = usePlayer();
  const data = useData();
  const view = useView(state?.kind === "resource" ? state.entryId : null);
  const resource = state?.kind === "resource" ? (data.resources.find((r) => r.id === state.resourceId) ?? null) : null;
  const jam = state?.kind === "jam" ? (data.jamTracks.find((t) => t.id === state.trackId) ?? null) : null;

  const media: Media | null =
    resource && view
      ? {
          key: resource.id,
          videoId: resource.externalId,
          url: resource.url,
          title: resource.title || view.song.title,
          author: resource.author,
          durationSeconds: resource.durationSeconds,
          label: resource.customLabel || RESOURCE_LABEL[resource.type],
          miniTitle: view.song.title,
          played: (auto) => playedOnce(view.id, { auto }),
        }
      : jam
        ? {
            key: jam.id,
            videoId: jam.videoId,
            url: jam.url,
            title: jam.title,
            author: jam.author,
            durationSeconds: jam.durationSeconds,
            label: ["Jam", jam.musicalKey, jam.bpm ? `${jam.bpm} BPM` : null].filter(Boolean).join(" · "),
            miniTitle: jam.title,
            played: (auto) => jamPlayed(jam.id, { auto }),
          }
        : null;

  // --- radio (listening to a playlist) -----------------------------------
  const radio = useRadio();
  const track = radio?.tracks[radio.index];
  const onAir = !!radio && !!track && state?.kind === "resource" && track.entryId === state.entryId;
  const onAirRef = useRef(onAir);
  useEffect(() => {
    onAirRef.current = onAir;
  });
  // Opening another song (or closing the player) leaves the radio.
  useEffect(() => {
    if (radio && (!state || (state.kind === "resource" ? state.entryId !== track?.entryId : true))) detachRadio();
  }, [radio, state, track?.entryId]);

  const wrap = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const engine = useRef<Engine | null>(null);
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);

  // Phones/tablets play videos stored on the device (fetched from the desktop app) in TuneDeck's own player.
  const local = useLocalVariants(media?.videoId ?? null);
  const [nativeFailed, setNativeFailed] = useState<string | null>(null);
  const native = !!media?.videoId && local.includes(0) && nativeFailed !== media.videoId;
  const shift = resource?.type === "standard_tuning" ? null : transposeFor(view?.entry.tuning);
  const variants: Variant[] = [{ semitones: 0, label: view?.entry.tuning || "Original" }];
  if (shift && local.includes(shift.semitones)) variants.push({ semitones: shift.semitones, label: shift.target });
  const onNativeUnavailable = useCallback(() => setNativeFailed(media?.videoId ?? null), [media?.videoId]);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);

  // --- riff loop -----------------------------------------------------------
  const entryRiffs = state?.kind === "resource" ? data.riffs.filter((r) => r.repertoireEntryId === state.entryId) : [];
  // The loop is whatever the active riff marks in the playing video, so editing a mark moves it live.
  const requestedRiff = state?.kind === "resource" ? (state.riffId ?? null) : null;
  const [riffId, setRiffId] = useState<string | null>(null);
  const riff = riffId ? data.riffs.find((r) => r.id === riffId) : undefined;
  const mark = riff && resource ? riff.marks[resource.id] : undefined;
  const loop = mark && mark.b != null ? { a: mark.a, b: mark.b } : null;
  const loopRef = useRef(loop);
  useEffect(() => {
    loopRef.current = loop;
  });
  const requestedStart = (() => {
    const r = requestedRiff ? data.riffs.find((x) => x.id === requestedRiff) : undefined;
    return r && resource ? r.marks[resource.id]?.a : state?.kind === "resource" ? state.start : undefined;
  })();

  /** Seeks made by the loop itself; jumps right after one are not the user's. */
  const ownSeekAt = useRef(0);
  const seekOwn = useCallback((t: number) => {
    ownSeekAt.current = performance.now();
    engine.current?.seek(t);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRiffId(requestedRiff);
    // Same video already playing: jump straight to the riff.
    if (requestedStart != null) seekOwn(requestedStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedRiff, resource?.id]);

  // Reaching the end of the riff goes back to its start, counting each pass. Jumping outside the
  // riff yourself (dragging the video, a seek bar or the timeline) turns the loop off instead of
  // pulling you back; jumps inside it keep looping.
  const [reps, setReps] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReps(0);
  }, [riffId, resource?.id]);
  useEffect(() => {
    if (!loop) return;
    // Playback at speed <= 1 never moves the playhead faster than the wall clock, so any bigger
    // move is a jump: a drag, a seek bar or the timeline, while playing or while paused.
    let last: number | null = null;
    let lastAt = 0;
    const id = setInterval(() => {
      const p = engine.current;
      const l = loopRef.current;
      if (!p || !l) return;
      const now = performance.now();
      // Right after the loop's own seek the reported time can lag: start over from the new spot.
      if (now - ownSeekAt.current < 700) {
        last = null;
        return;
      }
      const t = p.time();
      if (!p.playing()) {
        // Paused: time stands still, so keep the clock in step but not the position (a drag while
        // paused shows up as a jump on play).
        if (last == null) last = t;
        lastAt = now;
        return;
      }
      if (last == null && (t < l.a - 0.1 || t > l.b + 0.8)) {
        // Not where the loop's own seek put it (plus at most the settle time of playback):
        // the user moved it, e.g. kept dragging across the riff's end.
        setRiffId(null);
        toast("Loop off: you left the riff");
        return;
      }
      const moved = last == null ? 0 : t - last;
      const elapsed = (now - lastAt) / 1000;
      const jumped = last != null && (moved < -0.15 || moved > elapsed + 0.15);
      last = t;
      lastAt = now;
      if (jumped) {
        if (t < l.a - 0.1 || t > l.b + 0.1) {
          setRiffId(null);
          toast("Loop off: you left the riff");
        }
        return;
      }
      if (t >= l.b) {
        seekOwn(l.a);
        setReps((n) => n + 1);
      }
    }, 40);
    return () => clearInterval(id);
  }, [!!loop]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- auto +1 -------------------------------------------------------------
  const take = useRef<Take>(newTake());
  const playedRef = useRef<Media["played"] | null>(null);
  const [auto, setAuto] = useState(true);
  const autoRef = useRef(true);
  const [progress, setProgress] = useState({ watched: 0, threshold: 60, counted: false });
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    playedRef.current = media?.played ?? null;
  });

  useEffect(() => {
    const on = readPref("autoPlus", true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuto(on);
    autoRef.current = on;
  }, []);

  const resetTake = () => {
    take.current = newTake();
    setProgress((p) => ({ ...p, watched: 0, counted: false }));
  };

  const markPlayed = () => {
    take.current = { ...take.current, counted: true };
    media?.played(false);
  };

  // Sample the playhead while playing; count a take once enough of it was really played.
  useEffect(() => {
    if (!state) return;
    const id = setInterval(() => {
      const p = engine.current;
      if (!p || !p.playing()) return;
      const r = sample(take.current, p.time());
      take.current = r.take;
      const threshold = thresholdFor(p.duration() || media?.durationSeconds);
      if (!take.current.counted && take.current.watched >= threshold && autoRef.current && !onAirRef.current && playedRef.current) {
        take.current = { ...take.current, counted: true };
        playedRef.current(true);
        setBurst((b) => b + 1);
      }
      setProgress({ watched: take.current.watched, threshold, counted: take.current.counted });
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state, media?.durationSeconds]);

  const videoId = media?.videoId ?? null;
  const expanded = state?.expanded ?? false;

  // Create the player once per session; later tracks reuse it so switching is instant.
  useEffect(() => {
    if (!videoId || !media) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    const start = requestedStart ?? startSeconds(media.url);
    resetTake();
    if (native) {
      yt.current?.destroy();
      yt.current = null;
      return;
    }
    if (yt.current) {
      yt.current.loadVideoById({ videoId, startSeconds: start });
      yt.current.setPlaybackRate(speed);
      return;
    }
    let cancelled = false;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !wrap.current) return;
        // YT replaces the host node with an iframe, so React must not own it.
        const host = document.createElement("div");
        wrap.current.replaceChildren(host);
        const player = new YT.Player(host, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, start },
          events: {
            onError: (e) =>
              setError(e.data === 101 || e.data === 150 ? "The owner doesn't allow this video to play inside other apps." : "This video can't be played here."),
          },
        });
        yt.current = player;
        const ready = () => typeof player.getPlayerState === "function";
        engine.current = {
          time: () => (ready() ? player.getCurrentTime() : 0),
          duration: () => (ready() ? player.getDuration() : 0),
          playing: () => ready() && player.getPlayerState() === PLAYING,
          seek: (t) => ready() && player.seekTo(t, true),
          play: () => ready() && player.playVideo(),
          pause: () => ready() && player.pauseVideo(),
          rate: () => (ready() ? player.getPlaybackRate() : 1),
          setRate: (r) => {
            setSpeed(r);
            if (ready()) player.setPlaybackRate(r);
          },
        };
      })
      .catch(() => setError("Couldn't load the YouTube player. Check your connection."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, media?.key, native]);

  // Radio: at the end of a song (or of its best part) the next one starts. Listening never counts a +1.
  const trackStart = useRef(0);
  useEffect(() => {
    trackStart.current = performance.now();
  }, [radio?.seq]);
  useEffect(() => {
    if (!onAir) return;
    const id = setInterval(() => {
      const p = engine.current;
      const r = radio;
      if (!p || !r || performance.now() - trackStart.current < 2500) return;
      const t = p.time();
      const d = p.duration();
      const end = r.tracks[r.index]?.end;
      if ((end != null && t >= end) || (d > 0 && t >= d - 0.8 && !p.playing())) void radioNext("end", r.seq);
    }, 400);
    return () => clearInterval(id);
  }, [onAir, radio]);
  // A video that can't play here is skipped.
  useEffect(() => {
    if (!onAir || !error) return;
    const id = setTimeout(() => void radioNext("error"), 2500);
    return () => clearTimeout(id);
  }, [onAir, error, radio?.seq]);
  // Screen locked on a YouTube song: with Premium it may play on. If it stops instead, go to the
  // next song saved on the phone (those always play locked) and skip YouTube while locked from then on.
  useEffect(() => {
    if (!onAir || native || !radio) return;
    const seq = radio.seq;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      // Paused before locking: that was you, not YouTube.
      if (document.visibilityState !== "hidden" || (!engine.current?.playing() && performance.now() - trackStart.current > 2500)) return;
      timer = setTimeout(() => {
        if (document.visibilityState !== "hidden" || engine.current?.playing()) return;
        if (!getRadio()?.tracks.some((t) => t.local)) return;
        youtubeStoppedWhenLocked();
        void radioNext("error", seq);
      }, 8000);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [onAir, native, radio?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // The same video again (a one-song queue going round): start it over.
  const lastResource = useRef<string | null>(null);
  useEffect(() => {
    if (!onAir) return;
    if (lastResource.current === track?.resourceId) {
      engine.current?.seek(track.start ?? 0);
      engine.current?.play();
    }
    lastResource.current = track?.resourceId ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radio?.seq]);
  // Lock screen, headphones and the car's steering-wheel buttons skip songs.
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms || !onAir || !view) return;
    ms.metadata = new MediaMetadata({
      title: view.song.title,
      artist: view.song.artist,
      album: radio?.playlist.name ?? "TuneDeck",
      artwork: view.thumb ? [{ src: view.thumb, sizes: "480x360", type: "image/jpeg" }] : [],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["nexttrack", () => void radioNext("skip")],
      ["previoustrack", () => radioPrev()],
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
  }, [onAir, view, radio?.playlist.name]);

  const close = onAir ? stopRadio : closePlayer;

  // Tear down when the player is closed.
  useEffect(() => {
    if (state) return;
    yt.current?.destroy();
    yt.current = null;
    engine.current = null;
    wrap.current?.replaceChildren();
  }, [state]);

  // Keyboard shortcuts for both engines (YouTube's own only work while its frame has focus).
  // Tablet keyboards and Bluetooth page-turner pedals too. "M" (mark a riff) lives in the RiffBar.
  const [keyFlash, setKeyFlash] = useState<{ id: number; text: string } | null>(null);
  const nativeRef = useRef(native);
  useEffect(() => {
    nativeRef.current = native;
  });
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const show = (text: string) => setKeyFlash({ id: performance.now(), text });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setPlayerExpanded(false);
      const target = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (target && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable)) return;
      const p = engine.current;
      if (!p) return;
      const by = (sec: number) => {
        const d = p.duration();
        p.seek(Math.max(0, Math.min(p.time() + sec, d ? d - 0.05 : Infinity)));
        show(sec < 0 ? `−${-sec}s` : `+${sec}s`);
      };
      const speeds = nativeRef.current ? NATIVE_SPEEDS : SPEEDS;
      const setRate = (r: number) => {
        p.setRate(r);
        show(r === 1 ? "1×" : `${r}×`);
      };
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === " " || key === "k") {
        const was = p.playing();
        if (was) p.pause();
        else p.play();
        show(was ? "Pause" : "Play");
      } else if (key === "j") by(-10);
      else if (key === "l") by(10);
      else if (key === "ArrowLeft" || key === "PageUp") by(-5);
      else if (key === "ArrowRight" || key === "PageDown") by(5);
      else if (key === ",") by(-1);
      else if (key === ".") by(1);
      else if (key === "<") setRate([...speeds].reverse().find((s) => s < p.rate() - 0.01) ?? speeds[0]);
      else if (key === ">") setRate(speeds.find((s) => s > p.rate() + 0.01) ?? speeds[speeds.length - 1]);
      else if (key === "Home") {
        p.seek(0);
        show("0:00");
      } else if (/^[0-9]$/.test(key)) {
        p.seek((p.duration() * Number(key)) / 10);
        show(`${Number(key) * 10}%`);
      } else if (key === "r" && loopRef.current) {
        seekOwn(loopRef.current.a);
        p.play();
        show("Riff start");
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded, seekOwn]);

  if (!state || !media) return null;
  const carMode = expanded && onAir && !!radio?.car && !!view;

  return (
    <div className={`player ${expanded ? "expanded" : "mini"} ${native ? "native" : ""} ${carMode ? "car-mode" : ""}`} role="region" aria-label="Video player">
      {expanded && (
        <div className="player-head">
          <button className="icon-btn" aria-label="Minimize" onClick={() => setPlayerExpanded(false)}>
            <ChevronDown />
          </button>
          <span className="grow meta" style={{ textAlign: "center" }}>
            {media.label}
          </span>
          <button className="icon-btn" aria-label="Close player" onClick={close}>
            <X />
          </button>
        </div>
      )}

      <div className="player-stage">
        {native && media.videoId ? (
          <NativeVideo
            // The radio plays through the shared audio: starting or leaving it remounts the player.
            key={`${media.key}${onAir ? ":radio" : ""}`}
            videoId={media.videoId}
            variants={variants}
            start={requestedStart ?? startSeconds(media.url)}
            expanded={expanded}
            controlsHost={controlsHost}
            engineRef={engine}
            title={media.miniTitle}
            artist={view?.song.artist ?? media.author}
            onUnavailable={onNativeUnavailable}
            background={onAir}
            stopAt={onAir ? track?.end : undefined}
            onEnded={onAir ? () => void radioNext("end", radio!.seq) : undefined}
          />
        ) : (
          <div className="player-video" ref={wrap} />
        )}
        {keyFlash && (
          <div key={keyFlash.id} className="key-flash" aria-hidden>
            {keyFlash.text}
          </div>
        )}
        {burst > 0 && (
          <div key={burst} className="autoplus" aria-hidden>
            <span className="ring" />
            <span className="ring r2" />
            <span className="plus">+1</span>
            <span className="caption">Counted</span>
          </div>
        )}
        {auto && !onAir && (
          <div className={`take-bar ${progress.counted ? "done" : ""}`} aria-hidden>
            <i style={{ width: `${Math.min(100, (progress.watched / progress.threshold) * 100)}%` }} />
          </div>
        )}
        {error && (
          <div className="player-error">
            <p>{error}</p>
            <button className="btn btn-primary btn-sm" onClick={() => openLink(media.url, view?.id)}>
              <ExternalLink /> Open on YouTube
            </button>
          </div>
        )}
      </div>

      {carMode ? (
        <CarMode radio={radio!} view={view!} engine={engine} />
      ) : expanded ? (
        <div className="player-body">
          {onAir && view && <RadioPanel radio={radio!} view={view} engine={engine} />}

          {/* Own player: its controls come first, right under (or beside) the video. */}
          {native && <div ref={setControlsHost} />}

          {/* Riffs right under the video: the part used with the guitar in hand. */}
          {view && resource && (
            <RiffBar entryId={view.id} resource={resource} riffId={riffId} setRiffId={setRiffId} engine={engine} seek={seekOwn} reps={reps} />
          )}

          {/* ⭐ where the favorite passage starts: Backlog previews and "What do I play now?" start there. */}
          {view && resource && <StarRow entryId={view.id} resource={resource} star={view.entry.stars?.[resource.id] ?? null} engine={engine} seek={seekOwn} />}

          <div className="player-info">
            <h2 className="clamp-2" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {media.title}
            </h2>
            <div className="meta mt-2">{[media.author, duration(media.durationSeconds)].filter(Boolean).join(" · ")}</div>
          </div>

          <div className="action-row">
            <button className="btn btn-primary btn-lg big-plus" onClick={markPlayed}>
              <Plus /> {jam ? "Jammed" : "Played"}
            </button>
            {view?.entry.songsterrUrl && (
              <button className="btn btn-surface btn-lg" onClick={() => openSongsterr(view.entry.songsterrUrl!, view.id)}>
                <Guitar /> Tab
              </button>
            )}
          </div>

          <div className="row-gap" style={{ flexWrap: "wrap" }}>
            {!native && <Gauge size={16} color="var(--text-tertiary)" />}
            {!native && SPEEDS.map((s) => (
              <button
                key={s}
                className={`chip sm ${speed === s ? "active" : ""}`}
                onClick={() => {
                  setSpeed(s);
                  yt.current?.setPlaybackRate(s);
                }}
              >
                {s === 1 ? "1×" : `${s}×`}
              </button>
            ))}
            <button className="chip sm" onClick={() => openLink(media.url, view?.id)} style={{ marginLeft: "auto" }}>
              <ExternalLink /> YouTube
            </button>
          </div>

          {!onAir && <div className="auto-row">
            <button
              className={`chip sm ${auto ? "active" : ""}`}
              aria-pressed={auto}
              onClick={() => {
                const next = !auto;
                setAuto(next);
                autoRef.current = next;
                writePref("autoPlus", next);
              }}
            >
              <Sparkles /> Auto +1 {auto ? "on" : "off"}
            </button>
            <span className="meta">
              {loop
                ? "Looping a riff — song plays aren't counted while it loops."
                : !auto
                ? `Tap ${jam ? "Jammed" : "Played"} when you finish.`
                : progress.counted
                  ? "Counted ✓ — rewind to play it again."
                  : `Counts after ${clock(Math.max(0, progress.threshold - progress.watched))} more of playing. Skipping ahead doesn't count; rewinding starts a new take.`}
            </span>
            {auto && progress.counted && <Check size={16} color="var(--success)" />}
          </div>}

          {jam && <JamInfo trackId={jam.id} />}



          {view && resource && (
            <>
              <Link href={`/song?id=${view.id}`} className="row" onClick={() => setPlayerExpanded(false)}>
                <Thumb src={view.thumb} title={view.song.title} />
                <span className="row-main">
                  <span className="row-title truncate">{view.song.title}</span>
                  <span className="meta truncate">{view.song.artist}</span>
                </span>
              </Link>

              {view.resources.length > 1 && (
                <div>
                  <p className="step-title">Versions</p>
                  <div className="list">
                    {view.resources.map((r) => (
                      <button
                        key={r.id}
                        className={`pick ${r.id === resource.id ? "active" : ""}`}
                        // Keep the selected riff: it loops in the other video too, or gets marked there.
                        onClick={() => {
                          if (!riffId || r.provider !== "youtube" || !r.externalId) return openResource(r);
                          // Copy the timing first when it is the same recording, so the video opens on the riff.
                          placeSameRecording(riffId, r.id);
                          playVideo(r.id, view.id, riffId);
                        }}
                      >
                        <Thumb src={r.thumbnailUrl} title={r.title ?? view.song.title}>
                          {r.provider === "youtube" && <SourceBadge videoId={r.externalId} />}
                          {r.id === resource.id && (
                            <div className="thumb-overlay" style={{ justifyContent: "center", alignItems: "center", inset: 0 }}>
                              <span className="badge accent">
                                <Play /> Playing
                              </span>
                            </div>
                          )}
                        </Thumb>
                        <span className="row-main">
                          <span className="res-label" style={{ alignSelf: "flex-start" }}>
                            {r.customLabel || RESOURCE_LABEL[r.type]}
                          </span>
                          <span className="row-title truncate" style={{ fontWeight: 500, fontSize: 13.5 }}>
                            {r.title || hostLabel(r.url)}
                          </span>
                          {entryRiffs.some((x) => x.marks[r.id]) && (
                            <span className="riff-dots" aria-label="Riffs marked in this video">
                              {entryRiffs
                                .filter((x) => x.marks[r.id])
                                .map((x) => (
                                  <i key={x.id} style={{ background: riffColor(x) }} title={x.name} />
                                ))}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <button className="player-mini-text" onClick={() => setPlayerExpanded(true)}>
            <span className="dock-title truncate">{media.miniTitle}</span>
            <span className="meta truncate">{media.label}</span>
          </button>
          {onAir ? (
            <button className="icon-btn sm" aria-label="Next song" onClick={() => void radioNext("skip")}>
              <SkipForward />
            </button>
          ) : (
            <button className="plus-one" aria-label="Played once more" onClick={markPlayed}>
              <Plus />1
            </button>
          )}
          <button className="icon-btn sm muted" aria-label="Close player" onClick={close}>
            <X />
          </button>
        </>
      )}
    </div>
  );
}
