"use client";

import { Check, ChevronDown, ExternalLink, Gauge, Guitar, Play, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { jamPlayed, openLink, openResource, openSongsterr, playedOnce } from "@/lib/client/actions";
import { duration } from "@/lib/client/format";
import { useLocalVariants } from "@/lib/client/offline";
import { useData } from "@/lib/client/store";
import { closePlayer, readPref, setPlayerExpanded, usePlayer, writePref } from "@/lib/client/ui";
import { newTake, sample, thresholdFor, type Take } from "@/lib/client/takes";
import { useView } from "@/lib/client/views";
import { RESOURCE_LABEL } from "@/lib/shared/types";
import { hostLabel } from "@/lib/shared/urls";
import { scaleSuggestions } from "@/lib/shared/music";
import { transposeFor } from "@/lib/shared/tuning";
import { NativeVideo, type Engine, type Variant } from "./NativeVideo";
import { SourceBadge } from "./SourceBadge";
import { Thumb } from "./Thumb";

// Minimal typing for the YouTube IFrame Player API.
interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
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
      if (!take.current.counted && take.current.watched >= threshold && autoRef.current && playedRef.current) {
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
    const start = startSeconds(media.url);
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
        };
      })
      .catch(() => setError("Couldn't load the YouTube player. Check your connection."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, media?.key, native]);

  // Tear down when the player is closed.
  useEffect(() => {
    if (state) return;
    yt.current?.destroy();
    yt.current = null;
    engine.current = null;
    wrap.current?.replaceChildren();
  }, [state]);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlayerExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  if (!state || !media) return null;

  return (
    <div className={`player ${expanded ? "expanded" : "mini"} ${native ? "native" : ""}`} role="region" aria-label="Video player">
      {expanded && (
        <div className="player-head">
          <button className="icon-btn" aria-label="Minimize" onClick={() => setPlayerExpanded(false)}>
            <ChevronDown />
          </button>
          <span className="grow meta" style={{ textAlign: "center" }}>
            {media.label}
          </span>
          <button className="icon-btn" aria-label="Close player" onClick={closePlayer}>
            <X />
          </button>
        </div>
      )}

      <div className="player-stage">
        {native && media.videoId ? (
          <NativeVideo
            key={media.key}
            videoId={media.videoId}
            variants={variants}
            start={startSeconds(media.url)}
            expanded={expanded}
            controlsHost={controlsHost}
            engineRef={engine}
            title={media.miniTitle}
            artist={view?.song.artist ?? media.author}
            onUnavailable={onNativeUnavailable}
          />
        ) : (
          <div className="player-video" ref={wrap} />
        )}
        {burst > 0 && (
          <div key={burst} className="autoplus" aria-hidden>
            <span className="ring" />
            <span className="ring r2" />
            <span className="plus">+1</span>
            <span className="caption">Counted</span>
          </div>
        )}
        {auto && (
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

      {expanded ? (
        <div className="player-body">
          {/* Own player: its controls come first, right under (or beside) the video. */}
          {native && <div ref={setControlsHost} />}

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

          <div className="auto-row">
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
              {!auto
                ? `Tap ${jam ? "Jammed" : "Played"} when you finish.`
                : progress.counted
                  ? "Counted ✓ — rewind to play it again."
                  : `Counts after ${clock(Math.max(0, progress.threshold - progress.watched))} more of playing. Skipping ahead doesn't count; rewinding starts a new take.`}
            </span>
            {auto && progress.counted && <Check size={16} color="var(--success)" />}
          </div>

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
                      <button key={r.id} className={`pick ${r.id === resource.id ? "active" : ""}`} onClick={() => openResource(r)}>
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
          <button className="plus-one" aria-label="Played once more" onClick={markPlayed}>
            <Plus />1
          </button>
          <button className="icon-btn sm muted" aria-label="Close player" onClick={closePlayer}>
            <X />
          </button>
        </>
      )}
    </div>
  );
}
