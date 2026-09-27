"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EllipsisVertical, ExternalLink, GripVertical, LoaderCircle, Pencil, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  addResource,
  deleteResource,
  openExternal,
  reorderResources,
  retryEnrich,
  setPrimaryResource,
  updateResource,
} from "@/lib/client/actions";
import { duration } from "@/lib/client/format";
import { primaryOf, type SongView } from "@/lib/client/views";
import { RESOURCE_LABEL, RESOURCE_TYPES, type Resource, type ResourceType } from "@/lib/shared/types";
import { extractFirstUrl, hostLabel } from "@/lib/shared/urls";
import { CategoryChips, LabelInput } from "./Pickers";
import { Sheet } from "./Sheet";
import { Thumb } from "./Thumb";

function ResourceItem({ r, view, isPrimary, onMenu }: { r: Resource; view: SongView; isPrimary: boolean; onMenu: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const loading = r.metaStatus === "pending" && !r.title;
  return (
    <div ref={setNodeRef} style={style} className={`res-item ${isDragging ? "dragging" : ""}`}>
      <button className="drag-handle" aria-label="Reorder" {...attributes} {...listeners}>
        <GripVertical />
      </button>
      <button onClick={() => openExternal(r.url, view.id)} style={{ display: "contents" }}>
        {r.thumbnailUrl ? (
          <Thumb src={r.thumbnailUrl} title={r.title ?? view.song.title}>
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
        <div className="row-main" style={{ textAlign: "left" }}>
          {r.customLabel && <span className="res-label truncate">{r.customLabel}</span>}
          {loading ? (
            <>
              <div className="skeleton-line" style={{ width: "80%" }} />
              <div className="skeleton-line mt-2" style={{ width: "40%" }} />
            </>
          ) : (
            <>
              <span className="row-title clamp-2" style={{ fontSize: 14, fontWeight: 500 }}>
                {r.title || hostLabel(r.url)}
              </span>
              <span className="meta truncate">
                {isPrimary && <Star size={11} fill="currentColor" style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />}
                {r.author || hostLabel(r.url)}
                {r.metaStatus === "failed" && " · metadata unavailable"}
              </span>
            </>
          )}
        </div>
      </button>
      <button className="icon-btn sm muted" aria-label="Resource options" onClick={onMenu}>
        <EllipsisVertical />
      </button>
    </div>
  );
}

function Group({ view, type, list, onMenu }: { view: SongView; type: ResourceType; list: Resource[]; onMenu: (r: Resource) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const primary = primaryOf(list);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = list.map((r) => r.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    reorderResources(view.id, next);
  };
  return (
    <div className="res-group">
      <div className="res-group-head">
        <h3>{RESOURCE_LABEL[type]}</h3>
        <span className="meta">{list.length > 1 ? `${list.length} versions` : ""}</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="list">
            {list.map((r) => (
              <ResourceItem key={r.id} r={r} view={view} isPrimary={list.length > 1 && primary?.id === r.id} onMenu={() => onMenu(r)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function AddResourceSheet({
  view,
  open,
  onClose,
  initialType = "original",
}: {
  view: SongView;
  open: boolean;
  onClose: () => void;
  initialType?: ResourceType;
}) {
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ResourceType>(initialType);
  const [label, setLabel] = useState("");
  const parsed = extractFirstUrl(url);
  const save = () => {
    if (!parsed) return;
    addResource(view.id, { url: parsed, type, customLabel: label });
    setUrl("");
    setLabel("");
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add resource"
      footer={
        <button className="btn btn-primary btn-block" disabled={!parsed} onClick={save}>
          Save
        </button>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="res-url">Link</label>
          <input
            id="res-url"
            className="input"
            placeholder="https://youtube.com/watch?v=…"
            value={url}
            autoFocus
            inputMode="url"
            onChange={(e) => setUrl(e.target.value)}
          />
          {url && !parsed && <span className="error-text">That doesn&apos;t look like a link.</span>}
        </div>
        <div className="field">
          <span className="label">Category</span>
          <CategoryChips value={type} onChange={setType} />
        </div>
        <div className="field">
          <span className="label">Label</span>
          <LabelInput value={label} onChange={setLabel} />
        </div>
      </div>
    </Sheet>
  );
}

function EditResourceSheet({ r, onClose }: { r: Resource; onClose: () => void }) {
  const [title, setTitle] = useState(r.title ?? "");
  const [label, setLabel] = useState(r.customLabel ?? "");
  const [type, setType] = useState<ResourceType>(r.type);
  const [url, setUrl] = useState(r.url);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit resource"
      footer={
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            updateResource(r.id, {
              title: title.trim() || null,
              customLabel: label.trim() || null,
              type,
              url: url.trim() || r.url,
            });
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="er-title">Title</label>
          <input id="er-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Manual title" />
        </div>
        <div className="field">
          <label htmlFor="er-url">Link</label>
          <input id="er-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="field">
          <span className="label">Category</span>
          <CategoryChips value={type} onChange={setType} />
        </div>
        <div className="field">
          <span className="label">Label</span>
          <LabelInput value={label} onChange={setLabel} />
        </div>
      </div>
    </Sheet>
  );
}

export function ResourcesSection({ view }: { view: SongView }) {
  const [menu, setMenu] = useState<Resource | null>(null);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [adding, setAdding] = useState(false);
  const types = RESOURCE_TYPES.filter((t) => view.byType[t]?.length);

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Resources</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
          <Plus /> Add
        </button>
      </div>
      {types.length === 0 ? (
        <button className="panel" style={{ width: "100%", textAlign: "left" }} onClick={() => setAdding(true)}>
          <div className="row-gap">
            <Plus size={18} />
            <span>Add the original video, a cover, a lesson or a backing track</span>
          </div>
        </button>
      ) : (
        types.map((t) => <Group key={t} view={view} type={t} list={view.byType[t]!} onMenu={setMenu} />)
      )}

      <AddResourceSheet view={view} open={adding} onClose={() => setAdding(false)} />

      {menu && (
        <Sheet open onClose={() => setMenu(null)} title={menu.customLabel || menu.title || hostLabel(menu.url)}>
          <div className="menu-list">
            <button
              className="menu-item"
              onClick={() => {
                openExternal(menu.url, view.id);
                setMenu(null);
              }}
            >
              <ExternalLink />
              <span className="grow">Open</span>
            </button>
            {(view.byType[menu.type]?.length ?? 0) > 1 && (
              <button
                className="menu-item"
                onClick={() => {
                  setPrimaryResource(menu.id);
                  setMenu(null);
                }}
              >
                <Star />
                <span className="grow">Make primary {RESOURCE_LABEL[menu.type].toLowerCase()}</span>
              </button>
            )}
            <button
              className="menu-item"
              onClick={() => {
                setEditing(menu);
                setMenu(null);
              }}
            >
              <Pencil />
              <span className="grow">Edit title, label or category</span>
            </button>
            {menu.provider === "youtube" && menu.metaStatus !== "ok" && (
              <button
                className="menu-item"
                onClick={() => {
                  retryEnrich(menu.id);
                  setMenu(null);
                }}
              >
                {menu.metaStatus === "pending" ? <LoaderCircle className="spin" /> : <RefreshCw />}
                <span className="grow">Retry fetching metadata</span>
              </button>
            )}
            <button
              className="menu-item danger"
              onClick={() => {
                deleteResource(menu.id);
                setMenu(null);
              }}
            >
              <Trash2 />
              <span className="grow">Remove</span>
            </button>
          </div>
        </Sheet>
      )}
      {editing && <EditResourceSheet r={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
