"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ClipboardPaste, Library, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardCard } from "@/components/BoardCard";
import { LoadingList } from "@/components/Loading";
import { TopBar } from "@/components/TopBar";
import { moveEntry } from "@/lib/client/actions";
import { daysSince } from "@/lib/client/format";
import { useData, useLoaded } from "@/lib/client/store";
import { useViews, type SongView } from "@/lib/client/views";
import { INSTRUMENT_LABEL, STATUSES, STATUS_LABEL, type Instrument, type Status } from "@/lib/shared/types";
import { normalizeKey } from "@/lib/shared/urls";

type Columns = Record<Status, string[]>;
type Quick = "pinned" | "tab" | "stale";

const QUICK_LABEL: Record<Quick, string> = { pinned: "Pinned", tab: "Has tab", stale: "Not played in 30d" };

const colId = (s: Status) => `col:${s}`;
const pillId = (s: Status) => `pill:${s}`;
const statusOfDroppable = (id: string): Status | null =>
  id.startsWith("col:") || id.startsWith("pill:") ? (id.split(":")[1] as Status) : null;

const byPosition = (a: SongView, b: SongView) =>
  (a.entry.position ?? 0) - (b.entry.position ?? 0) || b.entry.createdAt.localeCompare(a.entry.createdAt);

// ---------------------------------------------------------------------------

function SortableCard({ view, wasDragging }: { view: SongView; wasDragging: () => boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: view.id });
  return (
    <BoardCard
      view={view}
      dragRef={setNodeRef}
      dragProps={{ ...attributes, ...listeners }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      ghost={isDragging}
      wasDragging={wasDragging}
    />
  );
}

function Column({
  status,
  views,
  wasDragging,
  highlight,
}: {
  status: Status;
  views: SongView[];
  wasDragging: () => boolean;
  highlight: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId(status) });
  return (
    <section className={`board-col ${isOver || highlight ? "over" : ""}`} data-status={status} id={`column-${status}`}>
      <header className="board-col-head">
        <span className="status-badge" data-status={status} />
        <h2>{STATUS_LABEL[status]}</h2>
        <span className="meta">{views.length}</span>
        <Link href={`/add?manual=1&status=${status}`} className="icon-btn sm muted" aria-label={`Add to ${STATUS_LABEL[status]}`}>
          <Plus />
        </Link>
      </header>
      <SortableContext items={views.map((v) => v.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="board-col-body">
          {views.map((v) => (
            <SortableCard key={v.id} view={v} wasDragging={wasDragging} />
          ))}
          {views.length === 0 && <div className="board-empty">Drop songs here</div>}
        </div>
      </SortableContext>
    </section>
  );
}

function StatusPill({
  status,
  count,
  active,
  dragging,
  onClick,
}: {
  status: Status;
  count: number;
  active: boolean;
  dragging: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: pillId(status) });
  return (
    <button
      ref={setNodeRef}
      className={`status-pill ${active ? "active" : ""} ${dragging ? "droppable" : ""} ${isOver ? "over" : ""}`}
      onClick={onClick}
    >
      <span className="status-badge" data-status={status} />
      {STATUS_LABEL[status]}
      <span className="n">{count}</span>
    </button>
  );
}

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
  const [activeCol, setActiveCol] = useState<Status>("WANT_TO_PLAY");
  const boardRef = useRef<HTMLDivElement>(null);
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

  const derived = useMemo(() => {
    const cols = Object.fromEntries(STATUSES.map((s) => [s, [] as string[]])) as Columns;
    for (const v of filtered.slice().sort(byPosition)) cols[v.entry.status].push(v.id);
    return cols;
  }, [filtered]);

  const byId = useMemo(() => new Map(views.map((v) => [v.id, v])), [views]);

  const tunings = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of views) if (v.entry.tuning) m.set(v.entry.tuning, (m.get(v.entry.tuning) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [views]);
  const instruments = useMemo(() => Array.from(new Set(views.map((v) => v.entry.instrument))), [views]);
  const tags = useMemo(() => data.tags.slice().sort((a, b) => a.name.localeCompare(b.name)), [data.tags]);
  const filterCount = Number(!!tuning) + tagIds.length + Number(!!instrument) + quick.length + Number(!!query);

  // --- drag & drop ---------------------------------------------------------
  const [cols, setCols] = useState<Columns | null>(null); // live layout while dragging
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<Status | null>(null);
  const dragEndedAt = useRef(0);
  const wasDragging = useCallback(() => Date.now() - dragEndedAt.current < 250, []);
  const layout = cols ?? derived;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const containerOf = (id: string, c: Columns): Status | null =>
    statusOfDroppable(id) ?? STATUSES.find((s) => c[s].includes(id)) ?? null;

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setCols(structuredClone(derived));
    navigator.vibrate?.(8);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !cols) return;
    const overId = String(over.id);
    if (overId.startsWith("pill:")) {
      setOverStatus(statusOfDroppable(overId));
      return;
    }
    setOverStatus(null);
    const from = containerOf(String(active.id), cols);
    const to = containerOf(overId, cols);
    if (!from || !to || from === to) return;
    setCols((c) => {
      if (!c) return c;
      const src = c[from].filter((id) => id !== active.id);
      const dst = c[to].slice();
      const idx = overId.startsWith("col:") ? dst.length : Math.max(0, dst.indexOf(overId));
      dst.splice(idx, 0, String(active.id));
      return { ...c, [from]: src, [to]: dst };
    });
  };

  const finish = () => {
    dragEndedAt.current = Date.now();
    setCols(null);
    setActiveId(null);
    setOverStatus(null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    if (!over || !cols) return finish();
    const overId = String(over.id);

    // Dropped on a status pill: move to the top of that column.
    if (overId.startsWith("pill:")) {
      const status = statusOfDroppable(overId)!;
      const others = views.filter((v) => v.entry.status === status && v.id !== id);
      const top = others.length ? Math.min(...others.map((v) => v.entry.position ?? 0)) - 1 : 0;
      moveEntry(id, status, top);
      return finish();
    }

    // Resolve the target from the drop point itself, so a fast drop that skipped
    // onDragOver still lands in the right column.
    const from = containerOf(id, cols);
    const status = containerOf(overId, cols) ?? from;
    if (!from || !status) return finish();
    let list: string[];
    if (from === status) {
      list = cols[status];
      if (!overId.startsWith("col:") && list.includes(overId)) list = arrayMove(list, list.indexOf(id), list.indexOf(overId));
    } else {
      list = cols[status].filter((x) => x !== id);
      const at = overId.startsWith("col:") ? list.length : Math.max(0, list.indexOf(overId));
      list.splice(at, 0, id);
    }
    const i = list.indexOf(id);
    const pos = (x: string | undefined) => (x ? (byId.get(x)?.entry.position ?? 0) : undefined);
    const prev = pos(list[i - 1]);
    const next = pos(list[i + 1]);
    const position =
      prev == null && next == null ? 0 : prev == null ? next! - 1 : next == null ? prev + 1 : (prev + next) / 2;
    moveEntry(id, status, position);
    finish();
  };

  // --- mobile column navigation -------------------------------------------
  const scrollToColumn = (s: Status) => {
    document.getElementById(`column-${s}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onScroll = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      const w = first.getBoundingClientRect().width + 12;
      setActiveCol(STATUSES[Math.min(STATUSES.length - 1, Math.round(el.scrollLeft / w))]);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loaded, views.length]);

  // Deep links like /?status=LEARNING open on that column.
  useEffect(() => {
    const s = params.get("status") as Status | null;
    if (loaded && s && STATUSES.includes(s)) setTimeout(() => scrollToColumn(s), 50);
  }, [params, loaded]);

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
  const activeView = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      <TopBar
        brand
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
          </>
        }
      />

      <div className="container board-filters">
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

        <div className="status-strip mobile-only">
          {STATUSES.map((s) => (
            <StatusPill
              key={s}
              status={s}
              count={layout[s].length}
              active={activeCol === s}
              dragging={!!activeId}
              onClick={() => scrollToColumn(s)}
            />
          ))}
        </div>
      </div>

      <div ref={boardRef} className={`board ${activeId ? "is-dragging" : ""}`}>
        {STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            views={layout[s].map((id) => byId.get(id)!).filter(Boolean)}
            wasDragging={wasDragging}
            highlight={overStatus === s}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
        {activeView ? <BoardCard view={activeView} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

export default function BoardPage() {
  return (
    <Suspense>
      <Board />
    </Suspense>
  );
}
