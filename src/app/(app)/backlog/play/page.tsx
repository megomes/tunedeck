"use client";

import { ArrowLeft, Check, ChevronUp, Info, Play, Plus, RotateCcw, Sparkles, Star, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipBars, clearStar, holdFor, starHere } from "@/components/BacklogCard";
import { Clip, prefetchClip, toggleClipsMuted, useClipMuted, type ClipCtl, type ClipState } from "@/components/Clip";
import { DifficultyMeter } from "@/components/Difficulty";
import { Thumb } from "@/components/Thumb";
import { addManyToUpNext, addPickScores, openResource, setSetting, setStatus, upNextFree } from "@/lib/client/actions";
import { CLIP_OPTIONS, clipSeconds, feedOrder, toItem, type BacklogItem } from "@/lib/client/backlog";
import { duration as clock } from "@/lib/client/format";
import { useOffline } from "@/lib/client/offline";
import { useData, useLoaded } from "@/lib/client/store";
import { closePlayer } from "@/lib/client/ui";
import { useViews } from "@/lib/client/views";

const PICKS = 5;
/** Watching a song this long and swiping on without picking it counts as a skip. */
const SKIP_AFTER_MS = 3000;

/** Big picture behind a slide: the thumbnail, blurred, so a 16:9 video fills a portrait screen. */
function Backdrop({ src }: { src: string | null | undefined }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="feed-backdrop" src={src} alt="" aria-hidden /> : <div className="feed-backdrop" aria-hidden />;
}

/**
 * "What do I play now?": a vertical feed of short clips from Backlog songs saved on this device,
 * like TikTok. Swipe up for the next song; tap the sides for the song's other clips. Pick up to 5,
 * then choose the one to play: it moves to Learning and the others can go to Up Next.
 * Picked songs come first next time, skipped ones last (pickScore).
 */
export default function PlayNowPage() {
  const router = useRouter();
  const loaded = useLoaded();
  const data = useData();
  const views = useViews();
  const offlineReady = useOffline((s) => s.loaded);
  const handheld = useOffline((s) => s.handheld);
  const videos = useOffline((s) => (s.handheld ? s.videos : null));
  const clipLen = clipSeconds(data.settings);
  const muted = useClipMuted();

  const items = useMemo(
    () =>
      views
        .filter((v) => v.entry.status === "BACKLOG" && !v.entry.riffOnly)
        .map((v) => toItem(v, videos))
        .filter((x) => x.preview?.externalId),
    [views, videos],
  );
  const byId = useMemo(() => new Map(items.map((x) => [x.view.id, x])), [items]);

  // The order is drawn once per round, so stars and picks don't reshuffle the feed under you.
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!order && loaded && offlineReady) setOrder(feedOrder(items));
  }, [order, loaded, offlineReady, items]);
  const slides = useMemo(() => (order ?? []).map((id) => byId.get(id)).filter((x): x is BacklogItem => !!x), [order, byId]);

  const [active, setActive] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [phase, setPhase] = useState<"feed" | "final">("feed");
  const [clip, setClip] = useState<ClipState | null>(null);
  const [hint, setHint] = useState(true);
  const ctl = useRef<ClipCtl | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // --- scores: +1 per pick, +2 more for the winner, −1 for songs watched and swiped past ---
  const skipped = useRef(new Set<string>());
  const watching = useRef<{ id: string; since: number } | null>(null);
  const counted = useRef(new Set<string>());
  const picksRef = useRef(picks);
  useEffect(() => {
    picksRef.current = picks;
  });
  /** Saves what hasn't been counted yet; safe to call more than once (leaving, choosing, closing the tab). */
  const flush = useCallback((winner?: string) => {
    const deltas: Record<string, number> = {};
    for (const id of skipped.current) if (!counted.current.has(id)) deltas[id] = -1;
    for (const id of picksRef.current) if (!counted.current.has(id)) deltas[id] = 1;
    if (winner) deltas[winner] = (deltas[winner] ?? 0) + 2;
    for (const id of Object.keys(deltas)) counted.current.add(id);
    skipped.current.clear();
    addPickScores(deltas);
  }, []);
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  const current = slides[active];
  useEffect(() => {
    const prev = watching.current;
    if (prev && prev.id !== current?.view.id && Date.now() - prev.since >= SKIP_AFTER_MS) skipped.current.add(prev.id);
    watching.current = current ? { id: current.view.id, since: Date.now() } : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClip(null);
    prefetchClip(slides[active + 1]?.preview?.externalId);
  }, [current, active, slides]);

  // Full screen: no app chrome, no other video playing, no page scroll behind.
  useEffect(() => {
    closePlayer();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== active) {
      setActive(i);
      setHint(false);
    }
  };

  const goSlide = (delta: number) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: (active + delta) * el.clientHeight, behavior: "smooth" });
  };

  const togglePick = (id: string) => {
    const has = picks.includes(id);
    if (!has && picks.length >= PICKS) return;
    const next = has ? picks.filter((x) => x !== id) : [...picks, id];
    setPicks(next);
    navigator.vibrate?.(has ? 8 : [10, 40, 10]);
    if (!has) {
      skipped.current.delete(id);
      // The fifth pick ends the round; otherwise move on to the next song.
      if (next.length === PICKS) setTimeout(() => setPhase("final"), 450);
      else setTimeout(() => goSlide(1), 350);
    }
  };

  const star = (x: BacklogItem) => x.preview && starHere(x.view.id, x.preview, ctl.current?.time() ?? 0, x.star);
  const unstar = (x: BacklogItem) => (x.preview && x.star != null ? () => clearStar(x.view.id, x.preview!, x.star!) : null);

  useEffect(() => {
    if (phase !== "feed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "j") goSlide(1);
      else if (e.key === "ArrowUp" || e.key === "k") goSlide(-1);
      else if (e.key === "ArrowRight") ctl.current?.next();
      else if (e.key === "ArrowLeft") ctl.current?.prev();
      else if (e.key === " ") ctl.current?.toggle();
      else if (e.key === "Enter" && current) togglePick(current.view.id);
      else if (e.key === "s" && current) star(current);
      else if (e.key === "S" && current) unstar(current)?.();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cycleClipLen = () => {
    const i = CLIP_OPTIONS.indexOf(clipLen);
    setSetting("clipSeconds", CLIP_OPTIONS[(i + 1) % CLIP_OPTIONS.length]);
  };

  const exit = () => router.push("/backlog");

  // --- nothing to play ---------------------------------------------------------
  const ready = loaded && offlineReady && order;
  if (!ready || !slides.length) {
    return (
      <div className="feed">
        <div className="feed-empty">
          <Sparkles />
          {!ready ? (
            <p>Loading…</p>
          ) : (
            <>
              <h3>No clips to play here</h3>
              <p>
                {handheld
                  ? "Previews play from Backlog videos saved on this device. Save them from your computer (Settings → Videos on this device)."
                  : "Previews play from videos saved on your phone or tablet. Open TuneDeck there."}
              </p>
            </>
          )}
          <button className="btn btn-surface" onClick={exit}>
            <ArrowLeft /> Back to the Backlog
          </button>
        </div>
      </div>
    );
  }

  if (phase === "final") {
    return (
      <Final
        picks={picks.map((id) => byId.get(id)).filter((x): x is BacklogItem => !!x)}
        clipLen={clipLen}
        onBack={() => setPhase("feed")}
        onRemove={(id) => setPicks((l) => l.filter((x) => x !== id))}
        onChoose={(winner, othersToUpNext) => {
          flush(winner.view.id);
          setStatus(winner.view.id, "LEARNING");
          if (othersToUpNext) addManyToUpNext(picks.filter((id) => id !== winner.view.id));
          router.push(`/song?id=${winner.view.id}`);
          if (winner.preview) openResource(winner.preview);
        }}
      />
    );
  }

  return (
    <div className="feed">
      <div ref={scroller} className="feed-scroll" onScroll={onScroll}>
        {slides.map((x, i) => {
          const on = i === active;
          const picked = picks.includes(x.view.id);
          const { song, entry } = x.view;
          const near = Math.abs(i - active) <= 2;
          return (
            <section key={x.view.id} className={`feed-slide ${on ? "on" : ""}`}>
              {near && <Backdrop src={x.preview?.thumbnailUrl ?? x.view.thumb} />}
              <div className="feed-media">
                {on && x.preview?.externalId ? (
                  <Clip videoId={x.preview.externalId} star={x.star} len={clipLen} ctlRef={ctl} onState={setClip} />
                ) : near ? (
                  <Thumb src={x.preview?.thumbnailUrl ?? x.view.thumb} title={song.title} />
                ) : null}
                {on && (
                  <button
                    className="feed-tap"
                    aria-label="Play or pause; tap the sides for other clips"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const f = (e.clientX - r.left) / r.width;
                      if (f < 0.3) ctl.current?.prev();
                      else if (f > 0.7) ctl.current?.next();
                      else ctl.current?.toggle();
                    }}
                  />
                )}
              </div>

              {on && (
                <>
                  <div className="feed-info">
                    <ClipBars state={clip} star={x.star != null} />
                    <h2 className="truncate">{song.title}</h2>
                    <p className="truncate">
                      {song.artist || "Unknown artist"}
                      {x.cover?.author && <span className="dot-sep">{x.cover.author}</span>}
                    </p>
                    <div className="feed-tags">
                      {entry.tuning && <span className="badge">{entry.tuning}</span>}
                      {x.duration != null && <span className="badge">{clock(x.duration)}</span>}
                      {x.star != null && (
                        <button className="badge star-hold" onClick={() => unstar(x)?.()} aria-label="Remove the star">
                          <Star fill="currentColor" /> {clock(x.star)} <X />
                        </button>
                      )}
                      {entry.difficulty ? <DifficultyMeter value={entry.difficulty} /> : null}
                      {clip?.paused && <span className="badge">Paused</span>}
                    </div>
                  </div>

                  <div className="feed-rail">
                    <button
                      {...holdFor(unstar(x))}
                      className={`rail-btn star-hold ${x.star != null ? "starred" : ""}`}
                      onClick={() => star(x)}
                      aria-label={x.star != null ? "Move the star here (hold to remove)" : "Star this moment"}
                    >
                      <Star fill={x.star != null ? "currentColor" : "none"} />
                      <span>{x.star != null ? "Move ⭐" : "Star"}</span>
                    </button>
                    <button
                      className={`rail-btn pick ${picked ? "picked" : ""}`}
                      onClick={() => togglePick(x.view.id)}
                      disabled={!picked && picks.length >= PICKS}
                      aria-label={picked ? "Remove from picks" : "Pick"}
                    >
                      {picked ? <Check /> : <Plus />}
                      <span>{picked ? "Picked" : "Pick"}</span>
                    </button>
                    <button className="rail-btn" onClick={() => router.push(`/song?id=${x.view.id}`)} aria-label="Open song">
                      <Info />
                      <span>Song</span>
                    </button>
                  </div>
                </>
              )}
              {on && hint && i === 0 && slides.length > 1 && (
                <div className="feed-hint" aria-hidden>
                  <ChevronUp />
                  Swipe up for the next song
                </div>
              )}
            </section>
          );
        })}
        <section className="feed-slide feed-end">
          <div className="feed-empty">
            <Sparkles />
            <h3>That&apos;s every saved song</h3>
            <p>{picks.length ? `You picked ${picks.length}. Time to choose one.` : "Nothing picked this round."}</p>
            {picks.length > 0 && (
              <button className="btn btn-primary" onClick={() => setPhase("final")}>
                Choose from my {picks.length}
              </button>
            )}
            <button
              className="btn btn-surface"
              onClick={() => {
                setOrder(feedOrder(items));
                scroller.current?.scrollTo({ top: 0 });
              }}
            >
              <RotateCcw /> Shuffle again
            </button>
          </div>
        </section>
      </div>

      <header className="feed-top">
        <button className="feed-round" onClick={exit} aria-label="Close">
          <X />
        </button>
        <span className="grow" />
        <button className="feed-round text" onClick={cycleClipLen} aria-label={`Clips of ${clipLen} seconds; tap to change`}>
          {clipLen}s
        </button>
        <button className="feed-round" onClick={toggleClipsMuted} aria-label={muted ? "Sound on" : "Mute"}>
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
      </header>

      <footer className="feed-tray">
        <div className="feed-tray-slots">
          {Array.from({ length: PICKS }, (_, i) => {
            const x = byId.get(picks[i]);
            return x ? (
              <button key={x.view.id} className="tray-slot filled" onClick={() => togglePick(x.view.id)} aria-label={`Remove ${x.view.song.title}`}>
                <Thumb src={x.preview?.thumbnailUrl ?? x.view.thumb} title={x.view.song.title} />
              </button>
            ) : (
              <span key={i} className="tray-slot" />
            );
          })}
        </div>
        <button className="btn btn-primary btn-sm" disabled={!picks.length} onClick={() => setPhase("final")}>
          Choose{picks.length ? ` (${picks.length})` : ""}
        </button>
      </footer>
    </div>
  );
}

/** Round two: the picks side by side; tap one to hear it again, then play one. */
function Final({
  picks,
  clipLen,
  onBack,
  onRemove,
  onChoose,
}: {
  picks: BacklogItem[];
  clipLen: number;
  onBack: () => void;
  onRemove: (id: string) => void;
  onChoose: (winner: BacklogItem, othersToUpNext: boolean) => void;
}) {
  const [focus, setFocus] = useState<string | null>(picks[0]?.view.id ?? null);
  const [clip, setClip] = useState<ClipState | null>(null);
  const [toQueue, setToQueue] = useState(true);
  const ctl = useRef<ClipCtl | null>(null);
  const free = upNextFree();
  const others = picks.length - 1;

  return (
    <div className="feed final">
      <header className="final-head">
        <button className="feed-round" onClick={onBack} aria-label="Back to the clips">
          <ArrowLeft />
        </button>
        <div className="grow">
          <h2>Which one now?</h2>
          <p className="meta">Tap to hear it again. The one you play goes to Learning.</p>
        </div>
      </header>

      {others > 0 && (
        <label className="final-queue">
          <input type="checkbox" checked={toQueue && free > 0} disabled={free === 0} onChange={(e) => setToQueue(e.target.checked)} />
          <span>
            Send the other {others} to Up Next
            <span className="meta">
              {" "}
              {free === 0 ? "· Up Next is full" : free < others ? `· only ${free} fit` : `· ${free} free`}
            </span>
          </span>
        </label>
      )}

      <div className="final-grid">
        {picks.map((x) => {
          const on = focus === x.view.id;
          return (
            <article key={x.view.id} className={`final-card ${on ? "on" : ""}`}>
              <div className="final-media" onClick={() => (on ? ctl.current?.toggle() : (setFocus(x.view.id), setClip(null)))}>
                {on && x.preview?.externalId ? (
                  <>
                    <Clip videoId={x.preview.externalId} star={x.star} len={clipLen} ctlRef={ctl} onState={setClip} />
                    <ClipBars state={clip} star={x.star != null} />
                  </>
                ) : (
                  <Thumb src={x.preview?.thumbnailUrl ?? x.view.thumb} title={x.view.song.title}>
                    <span className="final-play" aria-hidden>
                      <Play fill="currentColor" />
                    </span>
                  </Thumb>
                )}
              </div>
              <div className="final-body">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate final-title">{x.view.song.title}</div>
                  <div className="meta truncate">
                    {x.view.song.artist}
                    {x.view.entry.tuning && <span className="dot-sep">{x.view.entry.tuning}</span>}
                  </div>
                </div>
                <button className="icon-btn sm muted" aria-label="Drop this one" onClick={() => onRemove(x.view.id)}>
                  <X />
                </button>
              </div>
              <button className="btn btn-primary btn-block btn-sm" onClick={() => onChoose(x, toQueue && others > 0)}>
                <Play fill="currentColor" /> Play this one
              </button>
            </article>
          );
        })}
      </div>

      {!picks.length && (
        <div className="feed-empty">
          <p>No picks left.</p>
          <button className="btn btn-surface" onClick={onBack}>
            Back to the clips
          </button>
        </div>
      )}
    </div>
  );
}
