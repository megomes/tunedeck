"use client";

import { Download, FileMusic, FileText, LoaderCircle, Pencil, Trash2, Upload, EllipsisVertical } from "lucide-react";
import { useRef, useState } from "react";
import { deleteAttachment, updateAttachment, uploadAttachment } from "@/lib/client/actions";
import { fileSize, timeAgo } from "@/lib/client/format";
import { useStore } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";
import type { SongView } from "@/lib/client/views";
import type { Attachment } from "@/lib/shared/types";
import { Sheet } from "./Sheet";

export function AttachmentsSection({ view }: { view: SongView }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<Attachment | null>(null);
  const [renaming, setRenaming] = useState<Attachment | null>(null);
  const [label, setLabel] = useState("");
  const offline = useStore((s) => s.sync === "offline");

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setBusy(file.name);
      try {
        await uploadAttachment(view.id, file);
        toast(`${file.name} uploaded`);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Upload failed");
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Files</h2>
        <button className="btn btn-ghost btn-sm" disabled={!!busy || offline} onClick={() => input.current?.click()}>
          {busy ? <LoaderCircle className="spin" /> : <Upload />}
          {busy ? "Uploading…" : "PDF / MIDI"}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept=".pdf,.mid,.midi,application/pdf,audio/midi,audio/x-midi"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      {view.attachments.length === 0 ? (
        <p className="meta">Sheet music, tabs, chord sheets or MIDI files.{offline ? " Uploading needs a connection." : ""}</p>
      ) : (
        <div className="list">
          {view.attachments.map((a) => (
            <div key={a.id} className="row">
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="row-gap" style={{ flex: 1, minWidth: 0, gap: 12 }}>
                <span className="tag-icon">{a.type === "pdf" ? <FileText /> : <FileMusic />}</span>
                <span className="row-main">
                  <span className="row-title truncate" style={{ fontWeight: 500 }}>
                    {a.label || a.filename}
                  </span>
                  <span className="meta truncate">
                    {a.type.toUpperCase()} · {fileSize(a.sizeBytes)} · {timeAgo(a.createdAt)}
                  </span>
                </span>
              </a>
              <button className="icon-btn sm muted" aria-label="File options" onClick={() => setMenu(a)}>
                <EllipsisVertical />
              </button>
            </div>
          ))}
        </div>
      )}

      {menu && (
        <Sheet open onClose={() => setMenu(null)} title={menu.label || menu.filename}>
          <div className="menu-list">
            <a className="menu-item" href={`/api/attachments/${menu.id}?download=1`} onClick={() => setMenu(null)}>
              <Download />
              <span className="grow">Download</span>
            </a>
            <button
              className="menu-item"
              onClick={() => {
                setRenaming(menu);
                setLabel(menu.label ?? "");
                setMenu(null);
              }}
            >
              <Pencil />
              <span className="grow">Label</span>
            </button>
            <button
              className="menu-item danger"
              onClick={() => {
                if (confirm(`Delete ${menu.filename}? The file will be removed from storage.`)) deleteAttachment(menu.id);
                setMenu(null);
              }}
            >
              <Trash2 />
              <span className="grow">Delete file</span>
            </button>
          </div>
        </Sheet>
      )}
      {renaming && (
        <Sheet
          open
          onClose={() => setRenaming(null)}
          title="File label"
          footer={
            <button
              className="btn btn-primary btn-block"
              onClick={() => {
                updateAttachment(renaming.id, { label: label.trim() || null });
                setRenaming(null);
              }}
            >
              Save
            </button>
          }
        >
          <input className="input" autoFocus value={label} placeholder={renaming.filename} onChange={(e) => setLabel(e.target.value)} />
        </Sheet>
      )}
    </section>
  );
}
