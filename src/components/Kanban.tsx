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
import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { STATUSES, STATUS_LABEL, type Status } from "@/lib/shared/types";

/** Anything that sits in a status column with a manual order. */
export interface KanbanItem {
  id: string;
  status: Status;
  position: number;
  createdAt: string;
}

/** What a card needs to be draggable. Absent on the drag overlay. */
export interface DragBits {
  dragRef: Ref<HTMLDivElement>;
  dragProps: HTMLAttributes<HTMLDivElement>;
  style: CSSProperties;
  ghost: boolean;
}

type Columns = Record<Status, string[]>;

const colId = (s: Status) => `col:${s}`;
const pillId = (s: Status) => `pill:${s}`;
const statusOfDroppable = (id: string): Status | null =>
  id.startsWith("col:") || id.startsWith("pill:") ? (id.split(":")[1] as Status) : null;

const never = () => false;

export const byPosition = (a: KanbanItem, b: KanbanItem) => (a.position ?? 0) - (b.position ?? 0) || b.createdAt.localeCompare(a.createdAt);

/** Position that puts an item at the top of a column. */
export function topOf(items: KanbanItem[], status: Status, except?: string) {
  const col = items.filter((x) => x.status === status && x.id !== except);
  return col.length ? Math.min(...col.map((x) => x.position ?? 0)) - 1 : 0;
}

function SortableCard<T extends KanbanItem>({ item, render }: { item: T; render: (item: T, drag: DragBits | null) => ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: item.id });
  return render(item, {
    dragRef: setNodeRef,
    dragProps: { ...attributes, ...listeners },
    style: { transform: CSS.Translate.toString(transform), transition },
    ghost: isDragging,
  });
}

function Column<T extends KanbanItem>({
  status,
  items,
  render,
  highlight,
  addHref,
  emptyLabel,
  count,
}: {
  status: Status;
  items: T[];
  render: (item: T, drag: DragBits | null) => ReactNode;
  highlight: boolean;
  addHref?: (s: Status) => string | null;
  emptyLabel: string;
  count?: (s: Status, n: number) => ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId(status) });
  const href = addHref?.(status);
  return (
    <section className={`board-col ${isOver || highlight ? "over" : ""}`} data-status={status} id={`column-${status}`}>
      <header className="board-col-head">
        <span className="status-badge" data-status={status} />
        <h2>{STATUS_LABEL[status]}</h2>
        <span className="meta">{count ? count(status, items.length) : items.length}</span>
        {href && (
          <Link href={href} className="icon-btn sm muted" aria-label={`Add to ${STATUS_LABEL[status]}`}>
            <Plus />
          </Link>
        )}
      </header>
      <SortableContext items={items.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="board-col-body">
          {items.map((x) => (
            <SortableCard key={x.id} item={x} render={render} />
          ))}
          {items.length === 0 && <div className="board-empty">{emptyLabel}</div>}
        </div>
      </SortableContext>
    </section>
  );
}

function StatusPill({ status, count, active, dragging, onClick }: { status: Status; count: number; active: boolean; dragging: boolean; onClick: () => void }) {
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

/**
 * Status board with drag & drop between and inside columns. On phones: one column per screen,
 * swipe between them, long-press to drag, or drop on the sticky status pills.
 * Used by the Library (songs) and Riffs.
 */
export function Kanban<T extends KanbanItem>({
  items,
  all = items,
  onMove,
  renderCard,
  filters,
  addHref,
  emptyLabel,
  initialStatus,
  statuses = STATUSES,
  count,
}: {
  /** Items shown (after filters). */
  items: T[];
  /** Every item, for positions at the top of a column. */
  all?: T[];
  onMove: (id: string, status: Status, position: number) => void;
  /** Renders a card; `drag` is null on the drag overlay. Clicks right after a drop are suppressed via `wasDragging`. */
  renderCard: (item: T, drag: DragBits | null, wasDragging: () => boolean) => ReactNode;
  /** Above the mobile status pills (search, filter chips). */
  filters?: ReactNode;
  addHref?: (s: Status) => string | null;
  emptyLabel: string;
  initialStatus?: Status | null;
  /** The columns, in order. */
  statuses?: readonly Status[];
  /** Column header count (default: the number of cards). */
  count?: (s: Status, n: number) => ReactNode;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [activeCol, setActiveCol] = useState<Status>("WANT_TO_PLAY");

  const derived = useMemo(() => {
    const cols = Object.fromEntries(statuses.map((s) => [s, [] as string[]])) as Columns;
    for (const x of items.slice().sort(byPosition)) cols[x.status]?.push(x.id);
    return cols;
  }, [items, statuses]);
  const byId = useMemo(() => new Map(all.map((x) => [x.id, x])), [all]);

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
    statusOfDroppable(id) ?? statuses.find((s) => c[s]?.includes(id)) ?? null;

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
      onMove(id, status, topOf(all, status, id));
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
    const pos = (x: string | undefined) => (x ? (byId.get(x)?.position ?? 0) : undefined);
    const prev = pos(list[i - 1]);
    const next = pos(list[i + 1]);
    const position =
      prev == null && next == null ? 0 : prev == null ? next! - 1 : next == null ? prev + 1 : (prev + next) / 2;
    onMove(id, status, position);
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
      setActiveCol(statuses[Math.min(statuses.length - 1, Math.round(el.scrollLeft / w))]);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [statuses]);

  // Deep links like ?status=LEARNING open on that column.
  useEffect(() => {
    if (initialStatus && statuses.includes(initialStatus)) setTimeout(() => scrollToColumn(initialStatus), 50);
  }, [initialStatus, statuses]);

  const activeItem = activeId ? byId.get(activeId) : null;
  const render = (x: T, drag: DragBits | null) => renderCard(x, drag, wasDragging);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      <div className="container board-filters">
        {filters}
        <div className="status-strip mobile-only">
          {statuses.map((s) => (
            <StatusPill key={s} status={s} count={layout[s].length} active={activeCol === s} dragging={!!activeId} onClick={() => scrollToColumn(s)} />
          ))}
        </div>
      </div>

      <div ref={boardRef} className={`board ${activeId ? "is-dragging" : ""}`}>
        {statuses.map((s) => (
          <Column
            key={s}
            status={s}
            count={count}
            items={layout[s].map((id) => byId.get(id)!).filter(Boolean)}
            render={render}
            highlight={overStatus === s}
            addHref={addHref}
            emptyLabel={emptyLabel}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
        {activeItem ? renderCard(activeItem, null, never) : null}
      </DragOverlay>
    </DndContext>
  );
}
