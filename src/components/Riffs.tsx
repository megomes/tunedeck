"use client";

import { Play, Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { createRiff, deleteRiff, openResource, playRiff, setRiffStatus, updateRiff } from "@/lib/client/actions";
import { useData } from "@/lib/client/store";
import type { SongView } from "@/lib/client/views";
import { RESOURCE_SHORT, STATUSES, STATUS_LABEL, riffColor, type Riff, type Status } from "@/lib/shared/types";

export function riffTime(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** Thin bar under a video showing where each riff sits in it, in the riff's color. */
export function RiffStrip({ riffs, resourceId, duration }: { riffs: Riff[]; resourceId: string; duration: number | null }) {
  const marked = riffs.filter((r) => r.marks[resourceId]);
  if (!marked.length || !duration) return null;
  return (
    <span className="riff-strip" aria-label={`Riffs: ${marked.map((r) => r.name).join(", ")}`}>
      {marked.map((r) => {
        const m = r.marks[resourceId];
        const end = m.b ?? m.a;
        return (
          <i
            key={r.id}
            title={r.name}
            style={{
              left: `${(m.a / duration) * 100}%`,
              width: `max(3px, ${((end - m.a) / duration) * 100}%)`,
              background: riffColor(r),
            }}
          />
        );
      })}
    </span>
  );
}

/** Compact status picker for one riff (song page, player). */
export function RiffStatusSelect({ r }: { r: Riff }) {
  return (
    <label className="riff-status">
      <span className="status-badge" data-status={r.status} />
      <select aria-label="Riff status" value={r.status} onChange={(e) => setRiffStatus(r.id, e.target.value as Status)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

function RiffItem({ r, view }: { r: Riff; view: SongView }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const videos = view.resources.filter((x) => x.provider === "youtube" && x.externalId);
  return (
    <div className="riff-card" style={{ ["--rc" as string]: riffColor(r) }}>
      <div className="riff-row-head">
        <i className="riff-dot" />
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
            <input
              className="input"
              style={{ height: 34 }}
              autoFocus
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </form>
        )}
        <RiffStatusSelect r={r} />
        <button className="icon-btn sm muted" aria-label="Remove riff" onClick={() => deleteRiff(r.id)}>
          <Trash2 />
        </button>
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
                className={`riff-chip ${m ? "" : "unmarked"}`}
                onClick={() => (m ? playRiff(r.id, v.id) : (playRiff(r.id, v.id) || openResource(v)))}
                title={m ? "Play and loop" : "Play this video and mark the riff with the big button"}
              >
                {m?.b != null ? <Repeat /> : m ? <Play /> : <Plus />}
                <span>{v.customLabel || RESOURCE_SHORT[v.type]}</span>
                <span className="meta">{m ? `${riffTime(m.a)}–${m.b != null ? riffTime(m.b) : "?"}` : "mark"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Song page: the riffs of this song, each with its own status, color and a mark per video. */
export function RiffsSection({ view }: { view: SongView }) {
  const data = useData();
  const riffs = data.riffs.filter((r) => r.repertoireEntryId === view.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const firstVideo = view.resources.find((x) => x.provider === "youtube" && x.externalId);
  return (
    <section className="section" id="riffs">
      <div className="section-head">
        <h2 className="section-title">Riffs</h2>
        <button className="link" onClick={() => createRiff(view.id)}>
          <Plus /> Riff
        </button>
      </div>
      <div className="riff-list">
        {riffs.map((r) => (
          <RiffItem key={r.id} r={r} view={view} />
        ))}
        {riffs.length === 0 && (
          <p className="meta" style={{ margin: 0 }}>
            Learn just a part of this song.{" "}
            {firstVideo ? (
              <button className="link" onClick={() => openResource(firstVideo)}>
                Play a video
              </button>
            ) : (
              "Add a video"
            )}{" "}
            and tap <strong>Mark a riff</strong> where it starts and again where it ends.
          </p>
        )}
      </div>
    </section>
  );
}
