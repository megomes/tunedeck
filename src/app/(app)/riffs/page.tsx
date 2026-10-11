"use client";

import { ChevronRight, Play, Plus, Search, Shuffle, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Kanban, type DragBits } from "@/components/Kanban";
import { LoadingList } from "@/components/Loading";
import { riffTime } from "@/components/Riffs";
import { Thumb } from "@/components/Thumb";
import { TopBar } from "@/components/TopBar";
import { moveRiff, openResource, playRiff } from "@/lib/client/actions";
import { useData, useLoaded } from "@/lib/client/store";
import { useViews, type SongView } from "@/lib/client/views";
import { riffColor, type Riff, type Status } from "@/lib/shared/types";
import { normalizeKey } from "@/lib/shared/urls";

interface Item {
  id: string;
  status: Status;
  position: number;
  createdAt: string;
  riff: Riff;
  view: SongView;
  /** Videos where both ends are marked, so the riff loops. */
  looped: number;
}

function RiffCard({ item, drag, wasDragging }: { item: Item; drag: DragBits | null; wasDragging: () => boolean }) {
  const router = useRouter();
  const { riff, view } = item;
  const first = view.resources.find((r) => riff.marks[r.id]?.b != null) ?? view.resources.find((r) => riff.marks[r.id]);
  const m = first ? riff.marks[first.id] : undefined;
  const open = () => {
    if (wasDragging()) return;
    if (!playRiff(riff.id)) router.push(`/song?id=${view.id}#riffs`);
  };
  return (
    <div
      ref={drag?.dragRef}
      style={{ ...drag?.style, ["--rc" as string]: riffColor(riff) }}
      className={`bcard riff-tab-card ${drag ? "" : "overlay"} ${drag?.ghost ? "ghost" : ""}`}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && open()}
      {...drag?.dragProps}
    >
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
        <span className="bcard-title clamp-2">
          <i className="riff-dot" /> {riff.name}
        </span>
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

/** A riff-only song with no riff yet: open its video and mark the first one. */
function PendingChip({ view }: { view: SongView }) {
  const router = useRouter();
  const video = view.resources.find((r) => r.provider === "youtube" && r.externalId);
  return (
    <button className="riff-pending" onClick={() => (video ? openResource(video) : router.push(`/song?id=${view.id}`))}>
      <Thumb src={view.thumb} title={view.song.title} />
      <span className="row-main">
        <span className="truncate" style={{ fontWeight: 600, fontSize: 13.5 }}>
          {view.song.title}
        </span>
        <span className="meta truncate">{video ? "Play it and tap Mark a riff" : "Add a video to mark riffs"}</span>
      </span>
    </button>
  );
}

function RiffsBoard() {
  const params = useSearchParams();
  const data = useData();
  const views = useViews();
  const loaded = useLoaded();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const all = useMemo(() => {
    const byId = new Map(views.map((v) => [v.id, v]));
    return data.riffs
      .map((riff): Item | null => {
        const view = byId.get(riff.repertoireEntryId);
        if (!view) return null;
        const looped = view.resources.filter((r) => riff.marks[r.id]?.b != null).length;
        return { id: riff.id, status: riff.status, position: riff.position ?? 0, createdAt: riff.createdAt, riff, view, looped };
      })
      .filter((x): x is Item => !!x);
  }, [data.riffs, views]);

  const items = useMemo(() => {
    const q = normalizeKey(query);
    return q ? all.filter((i) => normalizeKey(`${i.riff.name} ${i.view.song.title} ${i.view.song.artist}`).includes(q)) : all;
  }, [all, query]);

  // Riff-only songs that have no riff yet would otherwise be nowhere.
  const pending = useMemo(
    () => views.filter((v) => v.entry.riffOnly && !data.riffs.some((r) => r.repertoireEntryId === v.id)),
    [views, data.riffs],
  );

  /** Warm-up: a random riff you already play, in a video where it loops. */
  const known = all.filter((i) => (i.status === "CAN_PLAY" || i.status === "MASTERED") && i.looped);
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
  if (!all.length && !pending.length) {
    return (
      <>
        <TopBar title="Riffs" />
        <div className="container">
          <div className="empty" style={{ paddingTop: 64 }}>
            <Zap />
            <h3>Learn just the riff</h3>
            <p>Add a song for just its riffs (it stays off the Library), or open any song and mark a riff in its video. It loops while you practice.</p>
            <Link href="/add?riffs=1" className="btn btn-primary mt-3">
              <Plus /> Add a song for its riffs
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Riffs" actions={actions} />
      <Kanban
        items={items}
        all={all}
        onMove={moveRiff}
        emptyLabel="Drop riffs here"
        initialStatus={params.get("status") as Status | null}
        renderCard={(item, drag, wasDragging) => <RiffCard item={item} drag={drag} wasDragging={wasDragging} />}
        filters={
          <>
            {searchOpen && (
              <div className="input-icon" style={{ marginBottom: 10 }}>
                <Search />
                <input
                  ref={searchRef}
                  className="input search"
                  placeholder="Search riff, song or artist"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            )}
            {pending.length > 0 && !query && (
              <div className="riff-pending-row">
                <span className="step-title" style={{ margin: 0 }}>
                  No riff marked yet
                </span>
                <div className="riff-pending-list">
                  {pending.map((v) => (
                    <PendingChip key={v.id} view={v} />
                  ))}
                </div>
              </div>
            )}
          </>
        }
      />
    </>
  );
}

export default function RiffsPage() {
  return (
    <Suspense>
      <RiffsBoard />
    </Suspense>
  );
}
