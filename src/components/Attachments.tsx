"use client";

import { Download, FileMusic, FileText, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { deleteAttachment, uploadAttachment } from "@/lib/client/actions";
import { fileSize, timeAgo } from "@/lib/client/format";
import { useStore } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";
import type { SongView } from "@/lib/client/views";

export function AttachmentsSection({ view }: { view: SongView }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
              <a className="icon-btn sm muted" href={`/api/attachments/${a.id}?download=1`} aria-label="Download">
                <Download />
              </a>
              <button
                className="icon-btn sm muted"
                aria-label="Delete file"
                onClick={() => confirm(`Delete ${a.filename}?`) && deleteAttachment(a.id)}
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
