"use client";

import { Check, ChevronDown, ExternalLink, Gauge, Guitar, Play, Plus, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { openLink, openResource, openSongsterr, playedOnce } from "@/lib/client/actions";
import { duration } from "@/lib/client/format";
import { useData } from "@/lib/client/store";
import { closePlayer, readPref, setPlayerExpanded, usePlayer, writePref } from "@/lib/client/ui";
import { newTake, sample, thresholdFor, type Take } from "@/lib/client/takes";
import { useView } from "@/lib/client/views";
import { RESOURCE_LABEL } from "@/lib/shared/types";
import { hostLabel } from "@/lib/shared/urls";
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

export function Player() {
  const state = usePlayer();
  const data = useData();
  const view = useView(state?.entryId ?? null);
  const resource = data.resources.find((r) => r.id === state?.resourceId) ?? null;

  const wrap = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);

  // --- auto +1 -------------------------------------------------------------
  const take = useRef<Take>(newTake());
  const entryRef = useRef<string | null>(null);
  const [auto, setAuto] = useState(true);
  const autoRef = useRef(true);
  const [progress, setProgress] = useState({ watched: 0, threshold: 60, counted: false });
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    entryRef.current = state?.entryId ?? null;
  }, [state?.entryId]);

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

  // Sample the playhead while playing; count a take once enough of it was really played.
  useEffect(() => {
    if (!state) return;
    const id = setInterval(() => {
      const p = yt.current;
      if (!p || typeof p.getPlayerState !== "function" || p.getPlayerState() !== PLAYING) return;
      const r = sample(take.current, p.getCurrentTime());
      take.current = r.take;
      const threshold = thresholdFor(p.getDuration() || resource?.durationSeconds);
      if (!take.current.counted && take.current.watched >= threshold && autoRef.current && entryRef.current) {
        take.current = { ...take.current, counted: true };
        playedOnce(entryRef.current, { auto: true });
        setBurst((b) => b + 1);
      }
      setProgress({ watched: take.current.watched, threshold, counted: take.current.counted });
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!state, resource?.durationSeconds]);

  const videoId = resource?.externalId ?? null;
  const expanded = state?.expanded ?? false;

  // Create the player once per session; later tracks reuse it so switching versions is instant.
  useEffect(() => {
    if (!videoId || !resource) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    const start = startSeconds(resource.url);
    resetTake();
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
        yt.current = new YT.Player(host, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, start },
          events: {
            onError: (e) =>
              setError(e.data === 101 || e.data === 150 ? "The owner doesn't allow this video to play inside other apps." : "This video can't be played here."),
          },
        });
      })
      .catch(() => setError("Couldn't load the YouTube player. Check your connection."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, resource?.id]);

  // Tear down when the player is closed.
  useEffect(() => {
    if (state) return;
    yt.current?.destroy();
    yt.current = null;
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

  if (!state || !resource || !view) return null;

  const versions = view.resources;
  const label = resource.customLabel || RESOURCE_LABEL[resource.type];

  return (
    <div className={`player ${expanded ? "expanded" : "mini"}`} role="region" aria-label="Video player">
      {expanded && (
        <div className="player-head">
          <button className="icon-btn" aria-label="Minimize" onClick={() => setPlayerExpanded(false)}>
            <ChevronDown />
          </button>
          <span className="grow meta" style={{ textAlign: "center" }}>
            {label}
          </span>
          <button className="icon-btn" aria-label="Close player" onClick={closePlayer}>
            <X />
          </button>
        </div>
      )}

      <div className="player-stage">
        <div className="player-video" ref={wrap} />
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
            <button className="btn btn-primary btn-sm" onClick={() => openLink(resource.url, view.id)}>
              <ExternalLink /> Open on YouTube
            </button>
          </div>
        )}
      </div>

      {expanded ? (
        <div className="player-body">
          <div className="player-info">
            <h2 className="clamp-2" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {resource.title || view.song.title}
            </h2>
            <div className="meta mt-2">
              {[resource.author, duration(resource.durationSeconds)].filter(Boolean).join(" · ")}
            </div>
          </div>

          <div className="action-row">
            <button
              className="btn btn-primary btn-lg big-plus"
              onClick={() => {
                take.current = { ...take.current, counted: true };
                playedOnce(view.id);
              }}
            >
              <Plus /> Played
            </button>
            {view.entry.songsterrUrl && (
              <button className="btn btn-surface btn-lg" onClick={() => openSongsterr(view.entry.songsterrUrl!, view.id)}>
                <Guitar /> Tab
              </button>
            )}
          </div>

          <div className="row-gap" style={{ flexWrap: "wrap" }}>
            <Gauge size={16} color="var(--text-tertiary)" />
            {SPEEDS.map((s) => (
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
            <button className="chip sm" onClick={() => openLink(resource.url, view.id)} style={{ marginLeft: "auto" }}>
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
                ? "Tap Played when you finish."
                : progress.counted
                  ? "Counted ✓ — rewind to play it again."
                  : `Counts after ${clock(Math.max(0, progress.threshold - progress.watched))} more of playing. Skipping ahead doesn't count; rewinding starts a new take.`}
            </span>
            {auto && progress.counted && <Check size={16} color="var(--success)" />}
          </div>

          <Link href={`/song?id=${view.id}`} className="row" onClick={() => setPlayerExpanded(false)}>
            <Thumb src={view.thumb} title={view.song.title} />
            <span className="row-main">
              <span className="row-title truncate">{view.song.title}</span>
              <span className="meta truncate">{view.song.artist}</span>
            </span>
          </Link>

          {versions.length > 1 && (
            <div>
              <p className="step-title">Versions</p>
              <div className="list">
                {versions.map((r) => (
                  <button
                    key={r.id}
                    className={`pick ${r.id === resource.id ? "active" : ""}`}
                    onClick={() => openResource(r)}
                  >
                    <Thumb src={r.thumbnailUrl} title={r.title ?? view.song.title}>
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
        </div>
      ) : (
        <>
          <button className="player-mini-text" onClick={() => setPlayerExpanded(true)}>
            <span className="dock-title truncate">{view.song.title}</span>
            <span className="meta truncate">{label}</span>
          </button>
          <button
            className="plus-one"
            aria-label="Played once more"
            onClick={() => {
              take.current = { ...take.current, counted: true };
              playedOnce(view.id);
            }}
          >
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
