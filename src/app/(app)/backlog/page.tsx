"use client";

import { Archive, CheckSquare, Inbox, ListPlus, Search, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BacklogCard } from "@/components/BacklogCard";
import { LoadingList } from "@/components/Loading";
import { TopBar } from "@/components/TopBar";
import { UpNextShelf } from "@/components/UpNextShelf";
import { addManyToUpNext, deleteEntry, setManyStatus } from "@/lib/client/actions";
import {
  GROUP_LABEL,
  QUICK_LABEL,
  SORT_LABEL,
  clipSeconds,
  groupItems,
  matches,
  sorter,
  toItem,
  totalLength,
  type GroupBy,
  type Quick,
  type SortBy,
} from "@/lib/client/backlog";
import { useOffline } from "@/lib/client/offline";
import { useData, useLoaded } from "@/lib/client/store";
import { readPref, writePref } from "@/lib/client/ui";
import { useViews } from "@/lib/client/views";

/** A view choice remembered on this device. */
function usePref<T>(key: string, fallback: T) {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setV(readPref(key, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = (next: T) => {
    setV(next);
    writePref(key, next);
  };
  return [v, set] as const;
}

export default function BacklogPage() {
  const loaded = useLoaded();
  const data = useData();
  const views = useViews();
  const handheld = useOffline((s) => s.handheld);
  const videos = useOffline((s) => (s.handheld ? s.videos : null));
  const clipLen = clipSeconds(data.settings);

  const [group, setGroup] = usePref<GroupBy>("backlog.group", "none");
  const [sort, setSort] = usePref<SortBy>("backlog.sort", "picks");
  const [quick, setQuick] = usePref<Quick[]>("backlog.quick", []);
  const [tuning, setTuning] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const items = useMemo(
    () => views.filter((v) => v.entry.status === "BACKLOG" && !v.entry.riffOnly).map((v) => toItem(v, videos)),
    [views, videos],
  );
  const queue = useMemo(
    () =>
      views
        .filter((v) => v.entry.status === "WANT_TO_PLAY" && !v.entry.riffOnly)
        .sort((a, b) => (a.entry.position ?? 0) - (b.entry.position ?? 0) || b.entry.createdAt.localeCompare(a.entry.createdAt)),
    [views],
  );
  // "Same tuning as Learning": what's already tuned on the guitar you're practicing with.
  const learningTunings = useMemo(
    () => new Set(views.filter((v) => v.entry.status === "LEARNING").map((v) => v.entry.tuning ?? "E Standard")),
    [views],
  );

  const shown = useMemo(
    () => items.filter((x) => matches(x, { query, tuning, tagIds, quick })).sort(sorter(sort, learningTunings)),
    [items, query, tuning, tagIds, quick, sort, learningTunings],
  );
  const groups = useMemo(() => groupItems(shown, group), [shown, group]);

  const tunings = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of items) {
      const t = x.view.entry.tuning ?? "No tuning set";
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [items]);
  const tags = useMemo(() => {
    const used = new Set(items.flatMap((x) => x.view.tags.map((t) => t.id)));
    return data.tags.filter((t) => used.has(t.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, data.tags]);

  const total = items.reduce((s, x) => s + (x.duration ?? 0), 0);
  const saved = items.filter((x) => x.preview).length;
  const filterCount = Number(!!tuning) + tagIds.length + quick.length + Number(!!query);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  if (!loaded) {
    return (
      <>
        <TopBar title="Backlog" />
        <LoadingList />
      </>
    );
  }

  const toggleSelect = (id: string) => setSelected((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const endSelect = () => {
    setSelecting(false);
    setSelected([]);
  };

  return (
    <>
      <TopBar
        title="Backlog"
        actions={
          <>
            <button
              className={`icon-btn ${selecting ? "active" : ""}`}
              aria-label={selecting ? "Stop selecting" : "Select songs"}
              onClick={() => (selecting ? endSelect() : (setSelecting(true), setPreviewId(null)))}
            >
              {selecting ? <X /> : <CheckSquare />}
            </button>
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
          </>
        }
      />

      <div className="container backlog">
        {!items.length && !queue.length ? (
          <div className="empty" style={{ paddingTop: 56 }}>
            <Inbox />
            <h3>The Backlog is empty</h3>
            <p>Covers you might learn someday land here: add one with Backlog as status, or pull your YouTube playlist in Settings.</p>
          </div>
        ) : (
          <>
            <div className="backlog-hero">
              {handheld ? (
                <Link href="/backlog/play" className={`playnow ${saved ? "" : "disabled"}`} aria-disabled={!saved} onClick={(e) => !saved && e.preventDefault()}>
                  <span className="playnow-icon">
                    <Sparkles />
                  </span>
                  <span className="playnow-text">
                    <strong>What do I play now?</strong>
                    <span>{saved ? "Swipe through clips, pick 5, then the one to play" : "Save the Backlog videos on this device first"}</span>
                  </span>
                </Link>
              ) : (
                <div className="playnow disabled" title="Previews play from videos saved on your phone or tablet">
                  <span className="playnow-icon">
                    <Sparkles />
                  </span>
                  <span className="playnow-text">
                    <strong>What do I play now?</strong>
                    <span>Open TuneDeck on your phone or tablet: previews play from the videos saved there</span>
                  </span>
                </div>
              )}
              <p className="meta backlog-stats">
                {items.length} song{items.length === 1 ? "" : "s"}
                {total > 0 && <span className="dot-sep">{totalLength(total)} of music</span>}
                {handheld && <span className="dot-sep">{saved} on this device</span>}
              </p>
            </div>

            <UpNextShelf queue={queue} />

            <div className="backlog-controls">
              {searchOpen && (
                <div className="input-icon" style={{ marginBottom: 10 }}>
                  <Search />
                  <input
                    ref={searchRef}
                    className="input search"
                    placeholder="Search songs, artists, channels, tags"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}
              <div className="backlog-view">
                <label className="pick-select">
                  <span>Group</span>
                  <select value={group} onChange={(e) => setGroup(e.target.value as GroupBy)}>
                    {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                      <option key={g} value={g}>
                        {GROUP_LABEL[g]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pick-select">
                  <span>Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortBy)}>
                    {(Object.keys(SORT_LABEL) as SortBy[]).map((s) => (
                      <option key={s} value={s}>
                        {SORT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="chip-row">
                {filterCount > 0 && (
                  <button
                    className="chip"
                    onClick={() => {
                      setTuning(null);
                      setTagIds([]);
                      setQuick([]);
                      setQuery("");
                    }}
                  >
                    <X /> Clear
                  </button>
                )}
                {(Object.keys(QUICK_LABEL) as Quick[])
                  .filter((q) => handheld || q !== "saved")
                  .map((q) => (
                    <button
                      key={q}
                      className={`chip ${quick.includes(q) ? "active" : ""}`}
                      onClick={() => setQuick(quick.includes(q) ? quick.filter((x) => x !== q) : [...quick, q])}
                    >
                      {QUICK_LABEL[q]}
                    </button>
                  ))}
                <span className="chip-sep" />
                {tunings.map((t) => (
                  <button key={t} className={`chip ${tuning === t ? "active" : ""}`} onClick={() => setTuning(tuning === t ? null : t)}>
                    {t}
                  </button>
                ))}
                {tags.length > 0 && <span className="chip-sep" />}
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
              </div>
            </div>

            {!shown.length && (
              <div className="empty">
                <Search />
                <h3>Nothing matches</h3>
                <p>Try fewer filters.</p>
              </div>
            )}

            {groups.map((g) => (
              <section key={g.key || "all"} className="backlog-group">
                {group !== "none" && (
                  <header className="backlog-group-head">
                    <h3>{g.label}</h3>
                    <span className="meta">{g.items.length}</span>
                  </header>
                )}
                <div className="backlog-grid">
                  {g.items.map((x) => (
                    <BacklogCard
                      key={x.view.id}
                      item={x}
                      clipLen={clipLen}
                      previewing={previewId === x.view.id}
                      onPreview={(on) => setPreviewId(on ? x.view.id : null)}
                      selecting={selecting}
                      selected={selected.includes(x.view.id)}
                      onSelect={() => toggleSelect(x.view.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {selecting && (
        <div className="select-bar" role="toolbar" aria-label="Selected songs">
          <span className="select-count">
            {selected.length} selected
            <button className="link" onClick={() => setSelected(selected.length === shown.length ? [] : shown.map((x) => x.view.id))}>
              {selected.length === shown.length ? "None" : "All"}
            </button>
          </span>
          <button
            className="btn btn-surface btn-sm"
            disabled={!selected.length}
            onClick={() => {
              addManyToUpNext(selected);
              endSelect();
            }}
          >
            <ListPlus /> Up Next
          </button>
          <button
            className="btn btn-surface btn-sm"
            disabled={!selected.length}
            onClick={() => {
              setManyStatus(selected, "ARCHIVED");
              endSelect();
            }}
          >
            <Archive /> Archive
          </button>
          <button
            className="icon-btn sm muted"
            aria-label="Delete selected"
            disabled={!selected.length}
            onClick={() => {
              if (!confirm(`Delete ${selected.length} song${selected.length === 1 ? "" : "s"}? Their videos, files and history go too.`)) return;
              selected.forEach(deleteEntry);
              endSelect();
            }}
          >
            <Trash2 />
          </button>
        </div>
      )}
    </>
  );
}
