"use client";

import { ChevronRight, Play, Search, Shuffle, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingList } from "@/components/Loading";
import { riffTime } from "@/components/Riffs";
import { Thumb } from "@/components/Thumb";
import { TopBar } from "@/components/TopBar";
import { playRiff } from "@/lib/client/actions";
import { useData, useLoaded } from "@/lib/client/store";
import { useViews, type SongView } from "@/lib/client/views";
import { STATUSES, STATUS_LABEL, type Riff, type Status } from "@/lib/shared/types";
import { normalizeKey } from "@/lib/shared/urls";

interface Item {
  riff: Riff;
  view: SongView;
  /** Videos where both ends are marked, so the riff loops. */
  looped: number;
}

function RiffCard({ item }: { item: Item }) {
  const router = useRouter();
  const { riff, view } = item;
  const first = view.resources.find((r) => riff.marks[r.id]?.b != null) ?? view.resources.find((r) => riff.marks[r.id]);
  const m = first ? riff.marks[first.id] : undefined;
  const open = () => {
    if (!playRiff(riff.id)) router.push(`/song?id=${view.id}#riffs`);
  };
  return (
    <div className="bcard jcard" onClick={open} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && open()}>
      <div className="bcard-thumb">
        <div className="bcard-thumb-hit">
          <Thumb src={first?.thumbnailUrl ?? view.thumb} title={view.song.title}>
            {m && (
              <span className="bcard-play" aria-hidden>
                <Play fill="currentColor" />
              </span>
            )}
            {m && (
              <div className="thumb-overlay">
                <span className="badge">{m.b != null ? `${riffTime(m.a)}–${riffTime(m.b)}` : riffTime(m.a)}</span>
              </div>
            )}
          </Thumb>
        </div>
      </div>
      <div className="bcard-main">
        <span className="bcard-title clamp-2">{riff.name}</span>
        <span className="secondary truncate">
          {view.song.title}
          {view.song.artist ? ` — ${view.song.artist}` : ""}
        </span>
        <span className="card-meta">
          {item.looped ? `Loops in ${item.looped} video${item.looped > 1 ? "s" : ""}` : "Not marked yet"}
          {view.entry.tuning ? ` · ${view.entry.tuning}` : ""}
        </span>
      </div>
      <div className="bcard-actions" onClick={(e) => e.stopPropagation()}>
        <Link href={`/song?id=${view.id}#riffs`} className="icon-btn sm muted" aria-label="Open song">
          <ChevronRight />
        </Link>
      </div>
    </div>
  );
}

export default function RiffsPage() {
  const data = useData();
  const views = useViews();
  const loaded = useLoaded();
  const [status, setStatus] = useState<Status | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const items = useMemo(() => {
    const byId = new Map(views.map((v) => [v.id, v]));
    return data.riffs
      .map((riff) => {
        const view = byId.get(riff.repertoireEntryId);
        if (!view) return null;
        const looped = view.resources.filter((r) => riff.marks[r.id]?.b != null).length;
        return { riff, view, looped };
      })
      .filter((x): x is Item => !!x);
  }, [data.riffs, views]);

  const filtered = useMemo(() => {
    const q = normalizeKey(query);
    return items
      .filter((i) => (!status || i.riff.status === status) && (!q || normalizeKey(`${i.riff.name} ${i.view.song.title} ${i.view.song.artist}`).includes(q)))
      .sort((a, b) => b.riff.updatedAt.localeCompare(a.riff.updatedAt));
  }, [items, status, query]);

  /** Warm-up: a random riff you already play, in a video where it loops. */
  const known = filtered.filter((i) => (i.riff.status === "CAN_PLAY" || i.riff.status === "MASTERED") && i.looped);
  const surprise = () => {
    const pick = known[Math.floor(Math.random() * known.length)];
    if (pick) playRiff(pick.riff.id);
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
      {known.length > 0 && (
        <button className="btn btn-primary btn-sm" onClick={surprise}>
          <Shuffle /> Warm up
        </button>
      )}
    </>
  );

  if (!loaded) {
    return (
      <>
        <TopBar title="Riffs" />
        <LoadingList />
      </>
    );
  }
  if (!items.length) {
    return (
      <>
        <TopBar title="Riffs" />
        <div className="container">
          <div className="empty" style={{ paddingTop: 64 }}>
            <Zap />
            <h3>Learn just the riff</h3>
            <p>Open a song, add a riff (Intro, Solo…) and mark where it starts and ends in each video. It loops while you practice.</p>
            <Link href="/" className="btn btn-surface mt-3">
              Go to Library
            </Link>
          </div>
        </div>
      </>
    );
  }

  const groups = STATUSES.map((s) => ({ s, list: filtered.filter((i) => i.riff.status === s) })).filter((g) => g.list.length);
  const counts = new Map(STATUSES.map((s) => [s, items.filter((i) => i.riff.status === s).length]));

  return (
    <>
      <TopBar title="Riffs" actions={actions} />
      <div className="container">
        {searchOpen && (
          <div className="input-icon" style={{ margin: "12px 0 0" }}>
            <Search />
            <input ref={searchRef} className="input search" placeholder="Search riff, song or artist" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        )}

        <div className="chip-row mt-3">
          <button className={`chip ${status == null ? "active" : ""}`} onClick={() => setStatus(null)}>
            All {items.length}
          </button>
          {STATUSES.filter((s) => counts.get(s)).map((s) => (
            <button key={s} className={`chip ${status === s ? "active" : ""}`} onClick={() => setStatus(status === s ? null : s)}>
              <span className="status-badge" data-status={s} />
              {STATUS_LABEL[s]} {counts.get(s)}
            </button>
          ))}
        </div>

        {groups.length === 0 ? (
          <div className="empty">
            <Zap />
            <h3>No riffs match</h3>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.s} className="section">
              <p className="step-title">
                {STATUS_LABEL[g.s]} · {g.list.length}
              </p>
              <div className="jam-grid">
                {g.list.map((i) => (
                  <RiffCard key={i.riff.id} item={i} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
