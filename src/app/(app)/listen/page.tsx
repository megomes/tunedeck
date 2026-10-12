"use client";

import {
  CalendarHeart,
  Car,
  Disc3,
  Guitar,
  Hash,
  Headphones,
  Heart,
  History,
  Mic2,
  Play,
  Repeat,
  Shuffle,
  Sparkles,
  Sprout,
  Star,
  Timer,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { LoadingList } from "@/components/Loading";
import { TopBar } from "@/components/TopBar";
import { totalLength } from "@/lib/client/backlog";
import { useOffline } from "@/lib/client/offline";
import {
  MODE_LABEL,
  TRIP_OPTIONS,
  VERSION_LABEL,
  buildPlaylists,
  playableCount,
  readListens,
  setRadioPrefs,
  startRadio,
  useRadio,
  useRadioPrefs,
  type Playlist,
  type PlaylistIcon,
  type RadioMode,
  type Version,
} from "@/lib/client/radio";
import { useData, useLoaded } from "@/lib/client/store";
import { useViews, type SongView } from "@/lib/client/views";

const ICONS: Record<PlaylistIcon, LucideIcon> = {
  all: Disc3,
  daily: CalendarHeart,
  repeat: Repeat,
  rediscover: History,
  star: Star,
  fresh: Sprout,
  pinned: Heart,
  tab: Guitar,
  status: Disc3,
  tag: Hash,
  tuning: Guitar,
  artist: Mic2,
  filter: Disc3,
};

function Cover({ list, byId }: { list: Playlist; byId: Map<string, SongView> }) {
  const thumbs = list.entryIds
    .map((id) => byId.get(id)?.thumb)
    .filter(Boolean)
    .slice(0, 4) as string[];
  const Icon = ICONS[list.icon];
  return (
    <div className="pl-cover" style={{ ["--pl" as string]: list.color }}>
      {thumbs.length >= 4 ? (
        <div className="pl-mosaic">
          {thumbs.map((t, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={t} alt="" loading="lazy" />
          ))}
        </div>
      ) : thumbs[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pl-single" src={thumbs[0]} alt="" loading="lazy" />
      ) : null}
      <div className="pl-tint" />
      <Icon className="pl-icon" />
      <span className="pl-play" aria-hidden>
        <Play fill="currentColor" />
      </span>
    </div>
  );
}

export default function ListenPage() {
  const loaded = useLoaded();
  const data = useData();
  const allViews = useViews();
  const views = useMemo(() => allViews.filter((v) => !v.entry.riffOnly), [allViews]);
  const byId = useMemo(() => new Map(views.map((v) => [v.id, v])), [views]);
  const handheld = useOffline((s) => s.handheld);
  const videos = useOffline((s) => (s.handheld ? s.videos : null));
  const prefs = useRadioPrefs();
  const radio = useRadio();

  const sections = useMemo(() => (loaded ? buildPlaylists(views, data, readListens()) : []), [loaded, views, data]);
  const everything: Playlist = useMemo(
    () => ({
      id: "all",
      name: "Everything",
      description: "All your songs",
      icon: "all",
      color: "#FF2D2D",
      entryIds: views.filter((v) => v.entry.status !== "ARCHIVED").map((v) => v.id),
    }),
    [views],
  );
  const all = playableCount(everything.entryIds, views, videos, prefs);

  const start = (list: Playlist, car?: boolean) => startRadio(list, { views, videos }, { car });

  if (!loaded) {
    return (
      <>
        <TopBar title="Listen" />
        <LoadingList />
      </>
    );
  }

  return (
    <>
      <TopBar title="Listen" />
      <div className="container listen">
        <div className="listen-hero">
          <div className="listen-hero-text">
            <Headphones />
            <div>
              <h2>Your repertoire, as a radio</h2>
              <p className="meta">
                {all.n} songs · {totalLength(all.seconds)}
                {prefs.trip ? ` · cut to a ${prefs.trip}-min drive` : ""}
              </p>
            </div>
          </div>
          <div className="listen-hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => start(everything)} disabled={!all.n}>
              <Shuffle /> Shuffle all
            </button>
            <button className="btn btn-surface btn-lg" onClick={() => start(everything, true)} disabled={!all.n}>
              <Car /> Drive
            </button>
          </div>
        </div>

        <div className="listen-prefs">
          <div className="chip-row">
            {(Object.keys(VERSION_LABEL) as Version[]).map((v) => (
              <button key={v} className={`chip sm ${prefs.version === v ? "active" : ""}`} onClick={() => setRadioPrefs({ version: v })}>
                {VERSION_LABEL[v]}
              </button>
            ))}
            <span className="chip-sep" />
            {(Object.keys(MODE_LABEL) as RadioMode[]).map((m) => (
              <button key={m} className={`chip sm ${prefs.mode === m ? "active" : ""}`} onClick={() => setRadioPrefs({ mode: m })}>
                {m === "highlights" && <Sparkles />} {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="chip-row">
            <button className={`chip sm ${prefs.shuffle ? "active" : ""}`} onClick={() => setRadioPrefs({ shuffle: !prefs.shuffle })}>
              <Shuffle /> Shuffle
            </button>
            <button
              className={`chip sm ${prefs.dj ? "active" : ""}`}
              onClick={() => setRadioPrefs({ dj: !prefs.dj })}
              title="A voice says the next song and its tuning between songs"
            >
              <Mic2 /> DJ voice
            </button>
            {handheld && (
              <button className={`chip sm ${prefs.savedOnly ? "active" : ""}`} onClick={() => setRadioPrefs({ savedOnly: !prefs.savedOnly })}>
                <Wifi /> No data: saved only
              </button>
            )}
            <span className="chip-sep" />
            <Timer size={16} color="var(--text-tertiary)" style={{ flexShrink: 0, alignSelf: "center" }} />
            {TRIP_OPTIONS.map((t) => (
              <button key={t} className={`chip sm ${prefs.trip === t ? "active" : ""}`} onClick={() => setRadioPrefs({ trip: t })}>
                {t ? `${t} min` : "No timer"}
              </button>
            ))}
          </div>
          <p className="meta listen-hint">
            {prefs.mode === "highlights"
              ? "Best parts: each song plays from its ⭐ (or past the intro) for 35 seconds."
              : prefs.trip
                ? "The queue is cut to fit the drive, so the music ends when you arrive."
                : "Listening doesn't count as a +1: that's only for when you play."}
          </p>
        </div>

        {sections.map((sec) => (
          <section key={sec.title} className="section">
            <div className="section-head">
              <h2 className="section-title">{sec.title}</h2>
            </div>
            <div className="carousel compact">
              {sec.lists.map((list) => {
                const { n, seconds } = playableCount(list.entryIds, views, videos, prefs, list.mode);
                const playing = radio?.playlist.id === list.id;
                return (
                  <button
                    key={list.id}
                    className={`pl-card ${playing ? "playing" : ""}`}
                    disabled={!n}
                    onClick={() => start(list)}
                    title={list.description}
                  >
                    <Cover list={list} byId={byId} />
                    <span className="pl-name truncate">{list.name}</span>
                    <span className="meta truncate">
                      {playing ? "Playing now" : n ? `${n} song${n === 1 ? "" : "s"} · ${totalLength(seconds)}` : "Nothing to play"}
                    </span>
                    <span className="meta pl-desc clamp-2">{list.description}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
