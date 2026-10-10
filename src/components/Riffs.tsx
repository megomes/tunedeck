"use client";

import { Play, Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { createRiff, deleteRiff, openResource, playRiff, updateRiff } from "@/lib/client/actions";
import { useData } from "@/lib/client/store";
import type { SongView } from "@/lib/client/views";
import { RESOURCE_SHORT, STATUSES, STATUS_LABEL, type Riff } from "@/lib/shared/types";

export function riffTime(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(1).padStart(4, "0")}`;
}

function RiffItem({ r, view }: { r: Riff; view: SongView }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const videos = view.resources.filter((x) => x.provider === "youtube" && x.externalId);
  return (
    <div className="riff-card">
      <div className="riff-row-head">
        {renaming == null ? (
          <button className="riff-name truncate" title="Rename" onClick={() => setRenaming(r.name)}>
            {r.name}
          </button>
        ) : (
          <form
            className="grow"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming.trim()) updateRiff(r.id, { name: renaming.trim() });
              setRenaming(null);
            }}
          >
            <input className="input" style={{ height: 34 }} autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
          </form>
        )}
        <button className="icon-btn sm muted" aria-label="Remove riff" onClick={() => deleteRiff(r.id)}>
          <Trash2 />
        </button>
      </div>

      <div className="seg-scroll" role="radiogroup" aria-label="Riff status">
        {STATUSES.map((s) => (
          <button key={s} role="radio" aria-checked={r.status === s} className={`seg ${r.status === s ? "active" : ""}`} onClick={() => updateRiff(r.id, { status: s })}>
            <span className="status-badge" data-status={s} />
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {videos.length === 0 ? (
        <p className="meta" style={{ margin: 0 }}>Add a YouTube video to mark where this riff is.</p>
      ) : (
        <div className="riff-marks">
          {videos.map((v) => {
            const m = r.marks[v.id];
            return (
              <button
                key={v.id}
                className={`chip sm ${m ? "" : "dim"}`}
                onClick={() => (m ? playRiff(r.id, v.id) : openResource(v))}
                title={m ? "Play and loop" : "Play this video and mark the riff in the player"}
              >
                {m?.b != null ? <Repeat /> : <Play />}
                {v.customLabel || RESOURCE_SHORT[v.type]}
                <span className="meta">{m ? `${riffTime(m.a)}–${m.b != null ? riffTime(m.b) : "?"}` : "mark"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Song page: the riffs of this song, each with its own status and a mark per video. */
export function RiffsSection({ view }: { view: SongView }) {
  const data = useData();
  const [name, setName] = useState("");
  const riffs = data.riffs.filter((r) => r.repertoireEntryId === view.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <section className="section" id="riffs">
      <div className="section-head">
        <h2 className="section-title">Riffs</h2>
      </div>
      <div className="riff-list">
        {riffs.map((r) => (
          <RiffItem key={r.id} r={r} view={view} />
        ))}
        <form
          className="row-gap"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createRiff(view.id, name);
            setName("");
          }}
        >
          <input
            className="input"
            style={{ height: 40, borderRadius: 999 }}
            placeholder={riffs.length ? "Another riff…" : "Learn just a part: Intro riff, Solo…"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn btn-surface btn-sm" type="submit" disabled={!name.trim()}>
            <Plus /> Riff
          </button>
        </form>
        {riffs.length > 0 && <p className="meta" style={{ margin: 0 }}>Play a video and use Start here / End here in the player to mark it.</p>}
      </div>
    </section>
  );
}
