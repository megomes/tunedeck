"use client";

import { Car, ChevronDown, Heart, ListMusic, ListPlus, MonitorPlay, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { addToUpNext, toggleFavorite } from "@/lib/client/actions";
import { duration } from "@/lib/client/format";
import { MODE_LABEL, radioJump, radioNext, radioPrev, radioToYouTubeMusic, setCarMode, stopRadio, type RadioState } from "@/lib/client/radio";
import { setPlayerExpanded } from "@/lib/client/ui";
import { useViews, type SongView } from "@/lib/client/views";
import { STATUS_LABEL } from "@/lib/shared/types";
import type { Engine } from "./NativeVideo";
import { Thumb } from "./Thumb";

/** Whether the engine is playing, polled (the YouTube iframe has no event we keep). */
function usePlaying(engine: RefObject<Engine | null>) {
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setPlaying(engine.current?.playing() ?? false), 400);
    return () => clearInterval(id);
  }, [engine]);
  return playing;
}

function toggle(engine: RefObject<Engine | null>) {
  const p = engine.current;
  if (!p) return;
  if (p.playing()) p.pause();
  else p.play();
}

function clockAt(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "Learn it" for a song still parked; ♥ for the rest. */
function LikeButtons({ view, big }: { view: SongView; big?: boolean }) {
  const parked = view.entry.status === "BACKLOG" || view.entry.status === "ARCHIVED";
  const cls = big ? "car-btn side" : "chip sm";
  return (
    <>
      <button
        className={`${cls} ${view.entry.isFavorite ? "liked" : ""}`}
        aria-pressed={view.entry.isFavorite}
        onClick={() => toggleFavorite(view.id)}
      >
        <Heart fill={view.entry.isFavorite ? "currentColor" : "none"} />
        {big ? null : view.entry.isFavorite ? " Pinned" : " Pin"}
      </button>
      {parked ? (
        <button className={cls} onClick={() => addToUpNext(view.id)} aria-label="Add to Up Next">
          <ListPlus /> {big ? "Learn it" : " Learn it"}
        </button>
      ) : (
        !big && <span className="chip sm static">{STATUS_LABEL[view.entry.status]}</span>
      )}
    </>
  );
}

function Queue({ radio, onPick }: { radio: RadioState; onPick?: () => void }) {
  const views = useViews();
  const byId = new Map(views.map((v) => [v.id, v]));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(".now")?.scrollIntoView({ block: "nearest" });
  }, [radio.index]);
  return (
    <div className="radio-queue list" ref={ref}>
      {radio.tracks.map((t, i) => {
        const v = byId.get(t.entryId);
        if (!v) return null;
        return (
          <button
            key={`${t.entryId}-${i}`}
            className={`row ${i === radio.index ? "now" : ""} ${i < radio.index ? "past" : ""}`}
            onClick={() => {
              radioJump(i);
              onPick?.();
            }}
          >
            <span className="radio-num">{i === radio.index ? <Play size={14} fill="currentColor" /> : i + 1}</span>
            <Thumb src={v.thumb} title={v.song.title} />
            <span className="row-main">
              <span className="row-title truncate">{v.song.title}</span>
              <span className="meta truncate">{[v.song.artist, v.entry.tuning].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="meta">{duration(t.seconds)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Radio controls at the top of the expanded player. */
export function RadioPanel({ radio, view, engine }: { radio: RadioState; view: SongView; engine: RefObject<Engine | null> }) {
  const playing = usePlaying(engine);
  const [queueOpen, setQueueOpen] = useState(false);
  return (
    <div className="radio-panel">
      <div className="radio-head">
        <span className="radio-live">Listening</span>
        <span className="grow truncate radio-name">{radio.playlist.name}</span>
        <span className="meta">
          {radio.index + 1}/{radio.tracks.length}
          {radio.mode === "highlights" ? ` · ${MODE_LABEL.highlights}` : ""}
          {radio.endsAt ? ` · ends ${clockAt(radio.endsAt)}` : ""}
        </span>
      </div>
      <div className="radio-transport">
        <button className="icon-btn" aria-label="Previous song" onClick={radioPrev} disabled={radio.index === 0}>
          <SkipBack />
        </button>
        <button className="radio-play" aria-label={playing ? "Pause" : "Play"} onClick={() => toggle(engine)}>
          {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
        <button className="icon-btn" aria-label="Next song" onClick={() => void radioNext("skip")}>
          <SkipForward />
        </button>
      </div>
      <div className="row-gap" style={{ flexWrap: "wrap" }}>
        <LikeButtons view={view} />
        <button className={`chip sm ${queueOpen ? "active" : ""}`} onClick={() => setQueueOpen((o) => !o)}>
          <ListMusic /> Queue
        </button>
        <button className="chip sm" onClick={() => setCarMode(true)}>
          <Car /> Car mode
        </button>
        <button className="chip sm" onClick={radioToYouTubeMusic} title="The rest of the queue plays in YouTube Music (Android Auto)">
          <MonitorPlay /> YouTube Music
        </button>
        <button className="chip sm" onClick={stopRadio} style={{ marginLeft: "auto" }}>
          <X /> Stop
        </button>
      </div>
      {queueOpen && <Queue radio={radio} />}
    </div>
  );
}

/**
 * Car mode: huge buttons you can hit without looking, swipe the song sideways to skip, and the
 * screen stays on.
 */
export function CarMode({ radio, view, engine }: { radio: RadioState; view: SongView; engine: RefObject<Engine | null> }) {
  const playing = usePlaying(engine);
  const [queueOpen, setQueueOpen] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [nudge, setNudge] = useState(0);

  // Keep the screen awake while driving.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const get = () =>
      navigator.wakeLock
        ?.request("screen")
        .then((l) => {
          if (gone) void l.release();
          else lock = l;
        })
        .catch(() => {});
    void get();
    const onVisible = () => document.visibilityState === "visible" && void get();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  // Start at the top: the big buttons must be in reach right away.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.closest(".player")?.scrollTo(0, 0);
  }, []);

  const next = radio.tracks[radio.index + 1];
  const nextView = useViews().find((v) => v.id === next?.entryId);

  return (
    <div className="car" ref={root}>
      <div className="car-top">
        <button className="icon-btn" aria-label="Leave car mode" onClick={() => setCarMode(false)}>
          <ChevronDown />
        </button>
        <span className="grow truncate meta" style={{ textAlign: "center" }}>
          {radio.playlist.name} · {radio.index + 1}/{radio.tracks.length}
          {radio.endsAt ? ` · ends ${clockAt(radio.endsAt)}` : ""}
        </span>
        <button className="icon-btn" aria-label="Queue" onClick={() => setQueueOpen((o) => !o)}>
          <ListMusic />
        </button>
      </div>

      {queueOpen ? (
        <div className="car-queue">
          <Queue radio={radio} onPick={() => setQueueOpen(false)} />
        </div>
      ) : (
        <div
          className="car-now"
          style={{ transform: `translateX(${nudge}px)` }}
          onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
          onPointerMove={(e) => {
            const s = swipe.current;
            if (s && Math.abs(e.clientX - s.x) > Math.abs(e.clientY - s.y)) setNudge((e.clientX - s.x) * 0.4);
          }}
          onPointerUp={(e) => {
            const s = swipe.current;
            swipe.current = null;
            setNudge(0);
            if (!s) return;
            const dx = e.clientX - s.x;
            if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(e.clientY - s.y)) return;
            if (dx < 0) void radioNext("skip");
            else radioPrev();
          }}
          onPointerCancel={() => {
            swipe.current = null;
            setNudge(0);
          }}
        >
          <div className="car-title clamp-2">{view.song.title}</div>
          <div className="car-artist truncate">{view.song.artist}</div>
          <div className="car-facts">
            {view.entry.tuning && <span>{view.entry.tuning}</span>}
            {view.entry.capo ? <span>Capo {view.entry.capo}</span> : null}
            <span>{STATUS_LABEL[view.entry.status]}</span>
          </div>
          {nextView && <div className="car-next truncate">Next: {nextView.song.title}</div>}
        </div>
      )}

      <div className="car-transport">
        <button className="car-btn" aria-label="Previous song" onClick={radioPrev} disabled={radio.index === 0}>
          <SkipBack fill="currentColor" />
        </button>
        <button className="car-btn play" aria-label={playing ? "Pause" : "Play"} onClick={() => toggle(engine)}>
          {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
        <button className="car-btn" aria-label="Next song" onClick={() => void radioNext("skip")}>
          <SkipForward fill="currentColor" />
        </button>
      </div>
      <div className="car-actions">
        <LikeButtons view={view} big />
        <button className="car-btn side" onClick={() => setPlayerExpanded(false)} aria-label="Minimize">
          <ChevronDown />
        </button>
      </div>
    </div>
  );
}
