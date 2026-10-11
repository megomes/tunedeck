"use client";

import { AudioLines, ClipboardPaste, Pencil, Play, Plus, Search, Shuffle, Star, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { jamMenu } from "@/components/CardMenus";
import { contextMenu } from "@/components/ContextMenu";
import { LoadingList } from "@/components/Loading";
import { SourceBadge } from "@/components/SourceBadge";
import { Thumb } from "@/components/Thumb";
import { TopBar } from "@/components/TopBar";
import { jamPlayed, playJamTrack, toggleJamFavorite } from "@/lib/client/actions";
import { daysSince, duration, timeAgo } from "@/lib/client/format";
import { useData, useLoaded } from "@/lib/client/store";
import { readPref, writePref } from "@/lib/client/ui";
import { ROOTS, TEMPO_LABEL, parseKey, shortKey, tempoOf, type Tempo } from "@/lib/shared/music";
import type { JamTrack } from "@/lib/shared/types";
import { normalizeKey } from "@/lib/shared/urls";

type Sort = "most" | "least" | "recent" | "newest" | "bpm" | "title";
const SORTS: Record<Sort, { label: string; fn: (a: JamTrack, b: JamTrack) => number }> = {
  most: { label: "Most played", fn: (a, b) => b.playCount - a.playCount || a.title.localeCompare(b.title) },
  least: { label: "Least played", fn: (a, b) => a.playCount - b.playCount || (a.lastPlayedAt ?? "").localeCompare(b.lastPlayedAt ?? "") },
  recent: { label: "Recently played", fn: (a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "") },
  newest: { label: "Newest", fn: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  bpm: { label: "BPM", fn: (a, b) => (a.bpm ?? 999) - (b.bpm ?? 999) },
  title: { label: "A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
};

const keyOrder = (k: string) => {
  const p = parseKey(k);
  return p ? ROOTS.indexOf(p.root as (typeof ROOTS)[number]) * 10 + (p.mode === "major" ? 0 : 1) : 999;
};

function JamCard({ t }: { t: JamTrack }) {
  const router = useRouter();
  const facts = [t.bpm ? `${t.bpm} BPM` : null, t.style, t.timeSignature && t.timeSignature !== "4/4" ? t.timeSignature : null].filter(Boolean);
  return (
    <div
      className="bcard jcard"
      onClick={() => playJamTrack(t.id)}
      onContextMenu={contextMenu(() => jamMenu(t.id, router.push))}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && playJamTrack(t.id)}
    >
      <div className="bcard-thumb">
        <div className="bcard-thumb-hit">
          <Thumb src={t.thumbnailUrl} title={t.title}>
            <SourceBadge videoId={t.videoId} />
            <span className="bcard-play" aria-hidden>
              <Play fill="currentColor" />
            </span>
            <div className="thumb-overlay">
              {t.musicalKey ? <span className="badge key-badge">{shortKey(t.musicalKey)}</span> : <span />}
              {t.durationSeconds != null && <span className="badge">{duration(t.durationSeconds)}</span>}
            </div>
          </Thumb>
        </div>
        <button
          className={`jcard-fav ${t.isFavorite ? "on" : ""}`}
          aria-label={t.isFavorite ? "Unfavorite" : "Favorite"}
          onClick={(e) => {
            e.stopPropagation();
            toggleJamFavorite(t.id);
          }}
        >
          <Star fill={t.isFavorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="bcard-main">
        <span className="bcard-title clamp-2">{t.title}</span>
        {facts.length > 0 && <span className="secondary truncate">{facts.join(" · ")}</span>}
        <span className="card-meta">{t.playCount ? `${t.playCount}× · ${timeAgo(t.lastPlayedAt)}` : "Not jammed yet"}</span>
      </div>
      <div className="bcard-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="plus-one"
          aria-label="Jammed once more"
          onClick={() => jamPlayed(t.id)}
        >
          <Plus />1
        </button>
        <Link href={`/jam/edit?id=${t.id}`} className="icon-btn sm muted" aria-label="Edit backing track">
          <Pencil />
        </Link>
      </div>
    </div>
  );
}

function Empty() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  return (
    <div className="container">
      <div className="empty" style={{ paddingTop: 64 }}>
        <AudioLines />
        <h3>Jam over backing tracks</h3>
        <p>Save YouTube backing tracks with their key, tempo and style. Pick one, play along, and TuneDeck counts your jams.</p>
      </div>
      <form
        className="paste-box"
        style={{ maxWidth: 560, margin: "0 auto" }}
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/jam/add?url=${encodeURIComponent(url)}`);
        }}
      >
        <ClipboardPaste />
        <input placeholder="Paste a backing track link…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={!url.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

export default function JamPage() {
  const data = useData();
  const loaded = useLoaded();
  const tracks = data.jamTracks;

  const [keys, setKeys] = useState<string[]>([]);
  const [style, setStyle] = useState<string | null>(null);
  const [tempo, setTempo] = useState<Tempo | null>(null);
  const [favs, setFavs] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [sort, setSort] = useState<Sort>("most");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSort(readPref<Sort>("jamSort", "most"));
  }, []);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const allKeys = useMemo(
    () => Array.from(new Set(tracks.map((t) => t.musicalKey).filter((k): k is string => !!k))).sort((a, b) => keyOrder(a) - keyOrder(b)),
    [tracks],
  );
  const allStyles = useMemo(() => Array.from(new Set(tracks.map((t) => t.style).filter((s): s is string => !!s))).sort(), [tracks]);
  const tempos = useMemo(() => (["slow", "medium", "fast"] as Tempo[]).filter((tp) => tracks.some((t) => tempoOf(t.bpm) === tp)), [tracks]);

  const list = useMemo(() => {
    const q = normalizeKey(query);
    return tracks
      .filter((t) => {
        if (keys.length && !keys.includes(t.musicalKey ?? "")) return false;
        if (style && t.style !== style) return false;
        if (tempo && tempoOf(t.bpm) !== tempo) return false;
        if (favs && !t.isFavorite) return false;
        if (fresh && t.playCount > 0 && daysSince(t.lastPlayedAt) <= 14) return false;
        if (q && !normalizeKey(`${t.title} ${t.style ?? ""} ${t.musicalKey ?? ""} ${t.notes ?? ""}`).includes(q)) return false;
        return true;
      })
      .sort(SORTS[sort].fn);
  }, [tracks, keys, style, tempo, favs, fresh, query, sort]);

  const totalJams = data.jamPlays.length;
  const thisWeek = data.jamPlays.filter((p) => daysSince(p.playedAt) <= 7).length;
  const filterCount = keys.length + Number(!!style) + Number(!!tempo) + Number(favs) + Number(fresh) + Number(!!query);

  /** Surprise me: random pick among the filtered tracks, favouring the ones played least. */
  const surprise = () => {
    if (!list.length) return;
    const weights = list.map((t) => 1 / (1 + t.playCount));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    const pick = list.find((_, i) => (r -= weights[i]) <= 0) ?? list[0];
    playJamTrack(pick.id);
  };

  const actions = (
    <>
      <button
        className="icon-btn"
        aria-label="Search"
        onClick={() => {
          setSearchOpen((o) => !o);
          setQuery("");
        }}
      >
        {searchOpen ? <X /> : <Search />}
      </button>
      {tracks.length > 0 && (
        <button className="btn btn-primary btn-sm" onClick={surprise} disabled={!list.length}>
          <Shuffle /> Surprise me
        </button>
      )}
    </>
  );

  if (!loaded) {
    return (
      <>
        <TopBar title="Jam" />
        <LoadingList />
      </>
    );
  }
  if (!tracks.length) {
    return (
      <>
        <TopBar title="Jam" />
        <Empty />
      </>
    );
  }

  return (
    <>
      <TopBar title="Jam" actions={actions} />
      <div className="container">
        <div className="jam-stats">
          <span>
            <strong>{tracks.length}</strong> backing tracks
          </span>
          <span>
            <strong>{totalJams}</strong> jams
          </span>
          <span>
            <strong>{thisWeek}</strong> this week
          </span>
        </div>

        {searchOpen && (
          <div className="input-icon" style={{ margin: "12px 0 0" }}>
            <Search />
            <input ref={searchRef} className="input search" placeholder="Search name, style, key, notes" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        )}

        <div className="chip-row mt-3">
          {filterCount > 0 && (
            <button
              className="chip"
              onClick={() => {
                setKeys([]);
                setStyle(null);
                setTempo(null);
                setFavs(false);
                setFresh(false);
                setQuery("");
              }}
            >
              <X /> Clear
            </button>
          )}
          <button className={`chip ${favs ? "active" : ""}`} onClick={() => setFavs(!favs)}>
            <Star /> Favorites
          </button>
          <button className={`chip ${fresh ? "active" : ""}`} onClick={() => setFresh(!fresh)}>
            Not played lately
          </button>
          {allKeys.length > 0 && <span className="chip-sep" />}
          {allKeys.map((k) => {
            const on = keys.includes(k);
            return (
              <button key={k} className={`chip ${on ? "active" : ""}`} onClick={() => setKeys(on ? keys.filter((x) => x !== k) : [...keys, k])}>
                {shortKey(k)}
              </button>
            );
          })}
          {tempos.length > 0 && <span className="chip-sep" />}
          {tempos.map((tp) => (
            <button key={tp} className={`chip ${tempo === tp ? "active" : ""}`} onClick={() => setTempo(tempo === tp ? null : tp)}>
              {TEMPO_LABEL[tp]}
            </button>
          ))}
          {allStyles.length > 0 && <span className="chip-sep" />}
          {allStyles.map((s) => (
            <button key={s} className={`chip ${style === s ? "active" : ""}`} onClick={() => setStyle(style === s ? null : s)}>
              {s}
            </button>
          ))}
        </div>

        <div className="tabs mt-2">
          {(Object.keys(SORTS) as Sort[]).map((s) => (
            <button
              key={s}
              className={`tab ${sort === s ? "active" : ""}`}
              onClick={() => {
                setSort(s);
                writePref("jamSort", s);
              }}
            >
              {SORTS[s].label}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <div className="empty">
            <AudioLines />
            <h3>No backing tracks match</h3>
            <p>Try another key, tempo or style.</p>
          </div>
        ) : (
          <div className="jam-grid mt-3">
            {list.map((t) => (
              <JamCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
