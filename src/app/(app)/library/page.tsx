"use client";

import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { LoadingList } from "@/components/Loading";
import { Sheet } from "@/components/Sheet";
import { SongCard } from "@/components/SongCard";
import { SongRow } from "@/components/SongRow";
import { TopBar } from "@/components/TopBar";
import { daysSince } from "@/lib/client/format";
import { useData, useLoaded } from "@/lib/client/store";
import { readPref, writePref } from "@/lib/client/ui";
import { byLastPlayedAsc, byLastPlayedDesc, byRecentlyAdded, byTitle, useViews, type SongView } from "@/lib/client/views";
import { INSTRUMENT_LABEL, STATUS_LABEL, type Instrument, type Status } from "@/lib/shared/types";
import { normalizeKey } from "@/lib/shared/urls";

type StatusFilter = "ALL" | "READY" | Status;
type Has = "songsterr" | "original" | "guitar_cover" | "lesson" | "backing_track" | "pdf" | "midi";
type Sort = "added" | "title" | "artist" | "played" | "plays" | "stale";

interface Advanced {
  artist: string | null;
  tagIds: string[];
  genre: string | null;
  difficulty: number | null;
  capo: "any" | "yes" | "no";
  favorites: boolean;
  has: Has[];
  played: "any" | "never" | "recent" | "stale";
  added: "any" | "7" | "30" | "90";
  sort: Sort;
}

const NO_ADVANCED: Advanced = {
  artist: null,
  tagIds: [],
  genre: null,
  difficulty: null,
  capo: "any",
  favorites: false,
  has: [],
  played: "any",
  added: "any",
  sort: "added",
};

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "LEARNING", label: "Learning" },
  { key: "WANT_TO_PLAY", label: "Want to Play" },
  { key: "READY", label: "Ready" },
  { key: "CAN_PLAY", label: "Can Play" },
  { key: "MASTERED", label: "Mastered" },
  { key: "ARCHIVED", label: "Archived" },
];

const HAS_LABEL: Record<Has, string> = {
  songsterr: "Songsterr",
  original: "Original video",
  guitar_cover: "Guitar cover",
  lesson: "Lesson",
  backing_track: "Backing track",
  pdf: "PDF",
  midi: "MIDI",
};

const TUNING_MODE_ORDER: Status[] = ["LEARNING", "CAN_PLAY", "MASTERED", "WANT_TO_PLAY"];

function matchStatus(v: SongView, s: StatusFilter) {
  if (s === "ALL") return v.entry.status !== "ARCHIVED";
  if (s === "READY") return v.entry.status === "CAN_PLAY" || v.entry.status === "MASTERED";
  return v.entry.status === s;
}

function has(v: SongView, h: Has) {
  if (h === "songsterr") return Boolean(v.entry.songsterrUrl);
  if (h === "pdf" || h === "midi") return v.attachments.some((a) => a.type === h);
  return Boolean(v.byType[h]?.length);
}

const SORTS: Record<Sort, { label: string; fn: (a: SongView, b: SongView) => number }> = {
  added: { label: "Recently added", fn: byRecentlyAdded },
  title: { label: "Title", fn: byTitle },
  artist: { label: "Artist", fn: (a, b) => a.song.artist.localeCompare(b.song.artist) || byTitle(a, b) },
  played: { label: "Recently played", fn: byLastPlayedDesc },
  plays: { label: "Most played", fn: (a, b) => b.entry.playCount - a.entry.playCount || byTitle(a, b) },
  stale: { label: "Not played recently", fn: byLastPlayedAsc },
};

function countAdvanced(a: Advanced) {
  return (
    Number(!!a.artist) +
    a.tagIds.length +
    Number(!!a.genre) +
    Number(a.difficulty != null) +
    Number(a.capo !== "any") +
    Number(a.favorites) +
    a.has.length +
    Number(a.played !== "any") +
    Number(a.added !== "any")
  );
}

function Library() {
  const params = useSearchParams();
  const loaded = useLoaded();
  const data = useData();
  const views = useViews();

  const [status, setStatusF] = useState<StatusFilter>((params.get("status") as StatusFilter) || "ALL");
  const [tuning, setTuning] = useState<string | null>(params.get("tuning"));
  const [instrument, setInstrument] = useState<Instrument | null>((params.get("instrument") as Instrument) || null);
  const [adv, setAdv] = useState<Advanced>(() => ({
    ...NO_ADVANCED,
    tagIds: params.get("tag") ? [params.get("tag")!] : [],
    sort: (params.get("sort") as Sort) || "added",
  }));
  const [searchOpen, setSearchOpen] = useState(params.get("search") === "1");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<"list" | "cards">("list");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Per-device preference, read after mount to keep hydration stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(readPref("libraryView", "list"));
  }, []);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Keep primary filters in the URL so back/forward and shared links restore them.
  useEffect(() => {
    const q = new URLSearchParams();
    if (status !== "ALL") q.set("status", status);
    if (tuning) q.set("tuning", tuning);
    if (instrument) q.set("instrument", instrument);
    const s = q.toString();
    window.history.replaceState(window.history.state, "", s ? `/library?${s}` : "/library");
  }, [status, tuning, instrument]);

  const instruments = useMemo(() => Array.from(new Set(views.map((v) => v.entry.instrument))), [views]);
  const tunings = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of views) if (v.entry.tuning && v.entry.status !== "ARCHIVED") m.set(v.entry.tuning, (m.get(v.entry.tuning) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [views]);
  const artists = useMemo(() => Array.from(new Set(views.map((v) => v.song.artist).filter(Boolean))).sort(), [views]);
  const genres = useMemo(
    () => Array.from(new Set(views.map((v) => v.song.genre).filter((g): g is string => !!g))).sort(),
    [views],
  );

  const base = useMemo(() => {
    const q = normalizeKey(query);
    return views.filter((v) => {
      if (tuning && v.entry.tuning !== tuning) return false;
      if (instrument && v.entry.instrument !== instrument) return false;
      if (q) {
        const hay = normalizeKey(`${v.song.title} ${v.song.artist} ${v.tags.map((t) => t.name).join(" ")}`);
        if (!hay.includes(q)) return false;
      }
      if (adv.artist && v.song.artist !== adv.artist) return false;
      if (adv.genre && v.song.genre !== adv.genre) return false;
      if (adv.difficulty != null && v.entry.difficulty !== adv.difficulty) return false;
      if (adv.capo === "yes" && !v.entry.capo) return false;
      if (adv.capo === "no" && v.entry.capo) return false;
      if (adv.favorites && !v.entry.isFavorite) return false;
      if (adv.tagIds.length && !adv.tagIds.every((id) => v.tags.some((t) => t.id === id))) return false;
      if (adv.has.length && !adv.has.every((h) => has(v, h))) return false;
      if (adv.played === "never" && v.entry.lastPlayedAt) return false;
      if (adv.played === "recent" && daysSince(v.entry.lastPlayedAt) > 7) return false;
      if (adv.played === "stale" && daysSince(v.entry.lastPlayedAt) <= 30) return false;
      if (adv.added !== "any" && daysSince(v.entry.createdAt) > Number(adv.added)) return false;
      return true;
    });
  }, [views, tuning, instrument, query, adv]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of STATUS_TABS) c[t.key] = base.filter((v) => matchStatus(v, t.key)).length;
    return c;
  }, [base]);

  const results = useMemo(() => {
    const fn = SORTS[adv.sort].fn;
    return base
      .filter((v) => matchStatus(v, status))
      .sort((a, b) => Number(b.entry.isFavorite) - Number(a.entry.isFavorite) || fn(a, b));
  }, [base, status, adv.sort]);

  const tuningMode = Boolean(tuning) && status === "ALL";
  const advCount = countAdvanced(adv);
  const showInstrument = instruments.length > 1;

  const renderList = (list: SongView[]) =>
    mode === "cards" ? (
      <div className="grid">
        {list.map((v) => (
          <SongCard key={v.id} view={v} showInstrument={showInstrument} />
        ))}
      </div>
    ) : (
      <div className="list">
        {list.map((v) => (
          <SongRow key={v.id} view={v} showTags showInstrument={showInstrument} />
        ))}
      </div>
    );

  return (
    <>
      <TopBar
        title="Library"
        actions={
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
            <button
              className="icon-btn"
              aria-label={mode === "list" ? "Card view" : "List view"}
              onClick={() => {
                const next = mode === "list" ? "cards" : "list";
                setMode(next);
                writePref("libraryView", next);
              }}
            >
              {mode === "list" ? <LayoutGrid /> : <List />}
            </button>
            <button className="icon-btn" aria-label="Filters" onClick={() => setSheet(true)}>
              <SlidersHorizontal />
              {advCount > 0 && <span className="count">{advCount}</span>}
            </button>
          </>
        }
      />
      <div className="container">
        {searchOpen && (
          <div className="input-icon" style={{ marginBottom: 12 }}>
            <Search />
            <input
              ref={searchRef}
              className="input search"
              placeholder="Search songs, artists, tags"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        <div className="tabs" role="tablist">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={status === t.key}
              className={`tab ${status === t.key ? "active" : ""}`}
              onClick={() => setStatusF(t.key)}
            >
              {t.label}
              <span className="n">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="chip-row mt-3">
          <button className={`chip ${!tuning ? "active" : ""}`} onClick={() => setTuning(null)}>
            Any tuning
          </button>
          {tunings.map((t) => (
            <button key={t} className={`chip ${tuning === t ? "active" : ""}`} onClick={() => setTuning(tuning === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>

        {showInstrument && (
          <div className="chip-row mt-2">
            <button className={`chip sm ${!instrument ? "active" : ""}`} onClick={() => setInstrument(null)}>
              All instruments
            </button>
            {instruments.map((i) => (
              <button key={i} className={`chip sm ${instrument === i ? "active" : ""}`} onClick={() => setInstrument(instrument === i ? null : i)}>
                {INSTRUMENT_LABEL[i]}
              </button>
            ))}
          </div>
        )}

        {advCount > 0 && (
          <div className="row-gap mt-3" style={{ flexWrap: "wrap" }}>
            <span className="meta">{advCount} advanced filter{advCount > 1 ? "s" : ""}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdv({ ...NO_ADVANCED, sort: adv.sort })}>
              Clear
            </button>
          </div>
        )}

        <div className="mt-6">
          {!loaded ? (
            <LoadingList />
          ) : results.length === 0 ? (
            <div className="empty">
              <SlidersHorizontal />
              <h3>No songs match</h3>
              <p>Try another status, tuning or filter.</p>
            </div>
          ) : tuningMode ? (
            <>
              <div className="tuning-hero">
                <SlidersHorizontal />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>Tuning mode · {tuning}</div>
                  <div className="meta">Everything you can play without retuning.</div>
                </div>
              </div>
              {TUNING_MODE_ORDER.map((st) => {
                const group = results.filter((v) => v.entry.status === st);
                if (!group.length) return null;
                return (
                  <section key={st} className="section">
                    <div className="section-head">
                      <h2 className="section-title">
                        {STATUS_LABEL[st]} <span className="meta">{group.length}</span>
                      </h2>
                    </div>
                    {renderList(group)}
                  </section>
                );
              })}
            </>
          ) : (
            renderList(results)
          )}
        </div>
      </div>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Filters"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAdv({ ...NO_ADVANCED, sort: adv.sort })}>
              Reset
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setSheet(false)}>
              Show {results.length} song{results.length === 1 ? "" : "s"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <span className="label">Sort by</span>
            <div className="segmented">
              {(Object.keys(SORTS) as Sort[]).map((k) => (
                <button key={k} className={`chip sm ${adv.sort === k ? "active" : ""}`} onClick={() => setAdv({ ...adv, sort: k })}>
                  {SORTS[k].label}
                </button>
              ))}
            </div>
          </div>

          {data.tags.length > 0 && (
            <div className="field">
              <span className="label">Tags</span>
              <div className="segmented">
                {data.tags
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((t) => {
                    const on = adv.tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        className={`chip sm ${on ? "active" : ""}`}
                        onClick={() =>
                          setAdv({ ...adv, tagIds: on ? adv.tagIds.filter((x) => x !== t.id) : [...adv.tagIds, t.id] })
                        }
                      >
                        <span className="tag-dot" style={t.color ? { background: t.color } : undefined} />
                        {t.name}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="field">
            <span className="label">Has</span>
            <div className="segmented">
              {(Object.keys(HAS_LABEL) as Has[]).map((h) => {
                const on = adv.has.includes(h);
                return (
                  <button
                    key={h}
                    className={`chip sm ${on ? "active" : ""}`}
                    onClick={() => setAdv({ ...adv, has: on ? adv.has.filter((x) => x !== h) : [...adv.has, h] })}
                  >
                    {HAS_LABEL[h]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <span className="label">Played</span>
            <div className="segmented">
              {(
                [
                  ["any", "Any time"],
                  ["never", "Never played"],
                  ["recent", "Last 7 days"],
                  ["stale", "Not in 30+ days"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={`chip sm ${adv.played === k ? "active" : ""}`} onClick={() => setAdv({ ...adv, played: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Date added</span>
            <div className="segmented">
              {(
                [
                  ["any", "Any time"],
                  ["7", "Last 7 days"],
                  ["30", "Last 30 days"],
                  ["90", "Last 90 days"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={`chip sm ${adv.added === k ? "active" : ""}`} onClick={() => setAdv({ ...adv, added: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-row" style={{ padding: 0 }}>
            <span className="grow">Pinned only</span>
            <button
              className="switch"
              role="switch"
              aria-checked={adv.favorites}
              onClick={() => setAdv({ ...adv, favorites: !adv.favorites })}
            />
          </div>

          <div className="form-2">
            <div className="field">
              <label htmlFor="f-artist">Artist</label>
              <select
                id="f-artist"
                className="select"
                value={adv.artist ?? ""}
                onChange={(e) => setAdv({ ...adv, artist: e.target.value || null })}
              >
                <option value="">Any</option>
                {artists.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-genre">Genre</label>
              <select
                id="f-genre"
                className="select"
                value={adv.genre ?? ""}
                onChange={(e) => setAdv({ ...adv, genre: e.target.value || null })}
              >
                <option value="">Any</option>
                {genres.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-diff">Difficulty</label>
              <select
                id="f-diff"
                className="select"
                value={adv.difficulty ?? ""}
                onChange={(e) => setAdv({ ...adv, difficulty: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Any</option>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {"●".repeat(d)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-capo">Capo</label>
              <select
                id="f-capo"
                className="select"
                value={adv.capo}
                onChange={(e) => setAdv({ ...adv, capo: e.target.value as Advanced["capo"] })}
              >
                <option value="any">Any</option>
                <option value="yes">With capo</option>
                <option value="no">No capo</option>
              </select>
            </div>
          </div>

          <div className="field">
            <span className="label">Instrument</span>
            <div className="segmented">
              <button className={`chip sm ${!instrument ? "active" : ""}`} onClick={() => setInstrument(null)}>
                All
              </button>
              {(["guitar", "bass", "piano"] as Instrument[]).map((i) => (
                <button key={i} className={`chip sm ${instrument === i ? "active" : ""}`} onClick={() => setInstrument(i)}>
                  {INSTRUMENT_LABEL[i]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}

export default function LibraryPage() {
  return (
    <Suspense>
      <Library />
    </Suspense>
  );
}
