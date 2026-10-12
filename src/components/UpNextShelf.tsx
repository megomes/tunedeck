"use client";

import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";
import { moveEntry, setStatus } from "@/lib/client/actions";
import { type SongView } from "@/lib/client/views";
import { UP_NEXT_MAX } from "@/lib/shared/types";
import { Thumb } from "./Thumb";

function Slot({ view, n, wasDragging }: { view: SongView; n: number; wasDragging: () => boolean }) {
  const router = useRouter();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: view.id });
  return (
    <div
      ref={setNodeRef}
      className={`upnext-slot filled ${isDragging ? "ghost" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => !wasDragging() && router.push(`/song?id=${view.id}`)}
    >
      <Thumb src={view.thumb} title={view.song.title}>
        <span className="upnext-n">{n}</span>
      </Thumb>
      <div className="upnext-text">
        <span className="truncate upnext-title">{view.song.title}</span>
        <span className="meta truncate">{view.song.artist}</span>
      </div>
      <button
        className="icon-btn sm muted upnext-back"
        aria-label="Back to the Backlog"
        title="Back to the Backlog"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setStatus(view.id, "BACKLOG");
        }}
      >
        <Undo2 />
      </button>
    </div>
  );
}

/**
 * Up Next: the few songs pulled out of the Backlog to learn next. It is the Library's
 * Want to Play column, so whatever happens here shows there too. Drag to reorder.
 */
export function UpNextShelf({ queue }: { queue: SongView[] }) {
  const ids = useMemo(() => queue.map((v) => v.id), [queue]);
  const endedAt = useRef(0);
  const wasDragging = () => Date.now() - endedAt.current < 250;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endedAt.current = Date.now();
    if (!over || active.id === over.id) return;
    const list = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    const i = list.indexOf(String(active.id));
    const pos = (id: string | undefined) => queue.find((v) => v.id === id)?.entry.position;
    const prev = pos(list[i - 1]);
    const next = pos(list[i + 1]);
    const position = prev == null ? (next ?? 0) - 1 : next == null ? prev + 1 : (prev + next) / 2;
    moveEntry(String(active.id), "WANT_TO_PLAY", position);
  };

  const empty = Math.max(0, UP_NEXT_MAX - queue.length);
  return (
    <section className="upnext">
      <header className="upnext-head">
        <span className="status-badge" data-status="WANT_TO_PLAY" />
        <h2 className="section-title">Up Next</h2>
        <span className="meta">
          {queue.length}/{UP_NEXT_MAX}
        </span>
        <span className="grow" />
        <Link href="/?status=WANT_TO_PLAY" className="btn btn-ghost btn-sm">
          Library <ArrowRight />
        </Link>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className="upnext-row">
            {queue.map((v, i) => (
              <Slot key={v.id} view={v} n={i + 1} wasDragging={wasDragging} />
            ))}
            {Array.from({ length: empty }, (_, i) => (
              <div key={`empty-${i}`} className="upnext-slot empty">
                <span className="upnext-n">{queue.length + i + 1}</span>
                <span className="meta">Free</span>
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
