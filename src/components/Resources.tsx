"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ExternalLink, GripVertical, Link2, Pencil, Play, RefreshCw, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  addResource,
  deleteResource,
  openLink,
  openResource,
  reorderResources,
  retryEnrich,
  setPrimaryResource,
  updateResource,
} from "@/lib/client/actions";
import { duration } from "@/lib/client/format";
import { usePlayer } from "@/lib/client/ui";
import { primaryOf, type SongView } from "@/lib/client/views";
import { RESOURCE_LABEL, RESOURCE_SHORT, RESOURCE_TYPES, type Resource, type ResourceType } from "@/lib/shared/types";
import { detectProvider, extractFirstUrl, hostLabel } from "@/lib/shared/urls";
import { CategoryChips, LabelInput } from "./Pickers";
import { SourceBadge } from "./SourceBadge";
import { Thumb } from "./Thumb";

function EditPanel({ r, onDone }: { r: Resource; onDone: () => void }) {
  const [title, setTitle] = useState(r.title ?? "");
  const [label, setLabel] = useState(r.customLabel ?? "");
  const [type, setType] = useState<ResourceType>(r.type);
  return (
    <div className="inline-panel">
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <CategoryChips value={type} onChange={setType} />
      <LabelInput value={label} onChange={setLabel} />
      <div className="row-gap" style={{ flexWrap: "wrap" }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            updateResource(r.id, { title: title.trim() || null, customLabel: label.trim() || null, type });
            onDone();
          }}
        >
          <Check /> Save
        </button>
        {r.provider === "youtube" && r.metaStatus !== "ok" && (
          <button className="btn btn-ghost btn-sm" onClick={() => retryEnrich(r.id)}>
            <RefreshCw /> Fetch details
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => openLink(r.url, r.repertoireEntryId)}>
          <ExternalLink /> Open link
        </button>
        <button className="btn btn-ghost btn-sm" style={{ color: "#ff6b6b", marginLeft: "auto" }} onClick={() => deleteResource(r.id)}>
          <Trash2 /> Remove
        </button>
      </div>
    </div>
  );
}

function ResourceItem({ r, view, showStar, isPrimary }: { r: Resource; view: SongView; showStar: boolean; isPrimary: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id });
  const [editing, setEditing] = useState(false);
  const player = usePlayer();
  const playing = player?.kind === "resource" && player.resourceId === r.id;
  const loading = r.metaStatus === "pending" && !r.title;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "dragging" : ""}>
      <div className={`res-item ${playing ? "playing" : ""}`}>
        <button className="drag-handle" aria-label="Reorder" {...attributes} {...listeners}>
          <GripVertical />
        </button>
        <button onClick={() => openResource(r)} className="res-open">
          {r.thumbnailUrl ? (
            <Thumb src={r.thumbnailUrl} title={r.title ?? view.song.title}>
              {r.provider === "youtube" && <SourceBadge videoId={r.externalId} />}
              {r.provider === "youtube" && (
                <span className="bcard-play" aria-hidden>
                  <Play fill="currentColor" />
                </span>
              )}
              {r.durationSeconds != null && (
                <div className="thumb-overlay" style={{ justifyContent: "flex-end" }}>
                  <span className="badge">{duration(r.durationSeconds)}</span>
                </div>
              )}
            </Thumb>
          ) : (
            <div className="res-icon">
              <ExternalLink />
            </div>
          )}
          <span className="row-main" style={{ textAlign: "left" }}>
            <span className="res-badges">
              <span className={`res-type ${r.type}`}>{RESOURCE_SHORT[r.type]}</span>
              {isPrimary && showStar && <span className="res-type primary">★ Primary</span>}
              {r.customLabel && <span className="res-label truncate">{r.customLabel}</span>}
            </span>
            {loading ? (
              <>
                <span className="skeleton-line" style={{ width: "80%" }} />
                <span className="skeleton-line mt-2" style={{ width: "40%" }} />
              </>
            ) : (
              <>
                <span className="res-title clamp-2">{r.title || hostLabel(r.url)}</span>
                <span className="meta truncate">
                  {playing ? "Playing now" : r.author || hostLabel(r.url)}
                  {r.metaStatus === "failed" && " · details unavailable"}
                </span>
              </>
            )}
          </span>
        </button>
        {showStar && (
          <button
            className={`icon-btn sm ${isPrimary ? "" : "muted"}`}
            aria-label={isPrimary ? "Primary version" : "Make primary"}
            aria-pressed={isPrimary}
            onClick={() => setPrimaryResource(r.id)}
          >
            <Star fill={isPrimary ? "currentColor" : "none"} />
          </button>
        )}
        <button className={`icon-btn sm ${editing ? "" : "muted"}`} aria-label="Edit" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
          <Pencil />
        </button>
      </div>
      {editing && <EditPanel r={r} onDone={() => setEditing(false)} />}
    </div>
  );
}

function Group({ view, type, list }: { view: SongView; type: ResourceType; list: Resource[] }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const primary = primaryOf(list);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = list.map((r) => r.id);
    reorderResources(view.id, arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  return (
    <div className="res-group" aria-label={RESOURCE_LABEL[type]}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="list">
            {list.map((r) => (
              <ResourceItem key={r.id} r={r} view={view} showStar={list.length > 1} isPrimary={primary?.id === r.id} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

/** Paste a link right on the page; category and label appear inline once a URL is detected. */
function InlineAdd({ view }: { view: SongView }) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const url = extractFirstUrl(text);
  const [type, setType] = useState<ResourceType>(view.byType.original?.length ? "guitar_cover" : "original");
  const save = () => {
    if (!url) return;
    addResource(view.id, { url, type, customLabel: label });
    setText("");
    setLabel("");
  };
  return (
    <div className="inline-add">
      <form
        className="paste-box"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Link2 />
        <input placeholder="Paste a YouTube or any link to add it" value={text} inputMode="url" onChange={(e) => setText(e.target.value)} />
        {url && (
          <button className="btn btn-primary btn-sm" type="submit">
            Add
          </button>
        )}
      </form>
      {url && (
        <div className="inline-panel">
          <span className="meta">{detectProvider(url) === "youtube" ? "YouTube video" : hostLabel(url)} — what is it?</span>
          <CategoryChips value={type} onChange={setType} />
          <LabelInput value={label} onChange={setLabel} />
        </div>
      )}
    </div>
  );
}

export function ResourcesSection({ view }: { view: SongView }) {
  const types = RESOURCE_TYPES.filter((t) => view.byType[t]?.length);
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Videos & links</h2>
      </div>
      <InlineAdd view={view} />
      <div className="mt-4">
        {types.map((t) => (
          <Group key={t} view={view} type={t} list={view.byType[t]!} />
        ))}
      </div>
    </section>
  );
}
