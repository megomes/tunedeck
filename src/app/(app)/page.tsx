"use client";

import { ClipboardPaste, Library, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BoardCard } from "@/components/BoardCard";
import { Kanban } from "@/components/Kanban";
import { LoadingList } from "@/components/Loading";
import { TopBar } from "@/components/TopBar";
import { moveEntry } from "@/lib/client/actions";
import { daysSince } from "@/lib/client/format";
import { useData, useLoaded } from "@/lib/client/store";
import { useViews, type SongView } from "@/lib/client/views";
import { INSTRUMENT_LABEL, type Instrument, type Status } from "@/lib/shared/types";
import { normalizeKey } from "@/lib/shared/urls";

type Quick = "pinned" | "tab" | "stale";

const QUICK_LABEL: Record<Quick, string> = { pinned: "Pinned", tab: "Has tab", stale: "Not played in 30d" };

/** A song as a board item. */
const asItem = (v: SongView) => ({ id: v.id, status: v.entry.status, position: v.entry.position ?? 0, createdAt: v.entry.createdAt, view: v });

// ---------------------------------------------------------------------------

function Welcome() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  return (
    <div className="container">
      <div className="empty" style={{ paddingTop: 72 }}>
        <Library />
        <h3>Build your repertoire</h3>
        <p>Paste a YouTube or Songsterr link, or add a song by name. It takes seconds.</p>
      </div>
      <form
        className="paste-box"
        style={{ maxWidth: 560, margin: "0 auto" }}
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/add?url=${encodeURIComponent(url)}`);
        }}
      >
        <ClipboardPaste />
        <input placeholder="Paste a link…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={!url.trim()}>
          Add
        </button>
      </form>
      <div style={{ textAlign: "center", marginTop: 18 }}>
        <Link href="/add?manual=1" className="btn btn-ghost">
          <Plus /> Add a song manually
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Board() {
  const params = useSearchParams();
  const loaded = useLoaded();
  const data = useData();
  const allViews = useViews();
  // Riff-only songs live in the Riffs tab, not on the board.
  const views = useMemo(() => allViews.filter((v) => !v.entry.riffOnly), [allViews]);

  const [tuning, setTuning] = useState<string | null>(params.get("tuning"));
  const [tagIds, setTagIds] = useState<string[]>(params.get("tag") ? [params.get("tag")!] : []);
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [quick, setQuick] = useState<Quick[]>([]);
  const [searchOpen, setSearchOpen] = useState(params.get("search") === "1");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // --- filtering -----------------------------------------------------------
  const filtered = useMemo(() => {
    const q = normalizeKey(query);
    return views.filter((v) => {
      if (tuning && v.entry.tuning !== tuning) return false;
      if (instrument && v.entry.instrument !== instrument) return false;
      if (tagIds.length && !tagIds.every((id) => v.tags.some((t) => t.id === id))) return false;
      if (quick.includes("pinned") && !v.entry.isFavorite) return false;
      if (quick.includes("tab") && !v.entry.songsterrUrl) return false;
      if (quick.includes("stale") && daysSince(v.entry.lastPlayedAt) <= 30) return false;
      if (q && !normalizeKey(`${v.song.title} ${v.song.artist} ${v.tags.map((t) => t.name).join(" ")}`).includes(q)) return false;
      return true;
    });
  }, [views, tuning, instrument, tagIds, quick, query]);

  const items = useMemo(() => filtered.map(asItem), [filtered]);
  const all = useMemo(() => views.map(asItem), [views]);

  const tunings = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of views) if (v.entry.tuning) m.set(v.entry.tuning, (m.get(v.entry.tuning) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [views]);
  const instruments = useMemo(() => Array.from(new Set(views.map((v) => v.entry.instrument))), [views]);
  const tags = useMemo(() => data.tags.slice().sort((a, b) => a.name.localeCompare(b.name)), [data.tags]);
  const filterCount = Number(!!tuning) + tagIds.length + Number(!!instrument) + quick.length + Number(!!query);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  if (!loaded) {
    return (
      <>
        <TopBar brand />
        <LoadingList />
      </>
    );
  }
  if (!views.length) {
    return (
      <>
        <TopBar brand />
        <Welcome />
      </>
    );
  }

  const toggleQuick = (q: Quick) => setQuick((l) => (l.includes(q) ? l.filter((x) => x !== q) : [...l, q]));

  return (
    <>
      <TopBar
        brand
        actions={
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
        }
      />
      <Kanban
        items={items}
        all={all}
        onMove={moveEntry}
        emptyLabel="Drop songs here"
        addHref={(s) => `/add?manual=1&status=${s}`}
        initialStatus={loaded ? (params.get("status") as Status | null) : null}
        renderCard={(x, drag, wasDragging) =>
          drag ? (
            <BoardCard
              view={x.view}
              dragRef={drag.dragRef}
              dragProps={drag.dragProps}
              style={drag.style}
              ghost={drag.ghost}
              wasDragging={wasDragging}
            />
          ) : (
            <BoardCard view={x.view} overlay />
          )
        }
        filters={
          <>
    {searchOpen && (
      <div className="input-icon" style={{ marginBottom: 10 }}>
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
    <div className="chip-row">
      {filterCount > 0 && (
        <button
          className="chip"
          onClick={() => {
            setTuning(null);
            setTagIds([]);
            setInstrument(null);
            setQuick([]);
            setQuery("");
          }}
        >
          <X /> Clear
        </button>
      )}
      {tunings.map((t) => (
        <button key={t} className={`chip ${tuning === t ? "active" : ""}`} onClick={() => setTuning(tuning === t ? null : t)}>
          {t}
        </button>
      ))}
      <span className="chip-sep" />
      {tags.map((t) => {
        const on = tagIds.includes(t.id);
        return (
          <button
            key={t.id}
            className={`chip ${on ? "active" : ""}`}
            onClick={() => setTagIds(on ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])}
          >
            <span className="tag-dot" style={t.color ? { background: t.color } : undefined} />
            {t.name}
          </button>
        );
      })}
      {tags.length > 0 && <span className="chip-sep" />}
      {(Object.keys(QUICK_LABEL) as Quick[]).map((q) => (
        <button key={q} className={`chip ${quick.includes(q) ? "active" : ""}`} onClick={() => toggleQuick(q)}>
          {QUICK_LABEL[q]}
        </button>
      ))}
      {instruments.length > 1 &&
        instruments.map((i) => (
          <button key={i} className={`chip ${instrument === i ? "active" : ""}`} onClick={() => setInstrument(instrument === i ? null : i)}>
            {INSTRUMENT_LABEL[i]}
          </button>
        ))}
    </div>
          </>
        }
      />
    </>
  );
}

export default function BoardPage() {
  return (
    <Suspense>
      <Board />
    </Suspense>
  );
}
