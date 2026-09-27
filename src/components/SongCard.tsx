"use client";

import { EllipsisVertical, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { plays, timeAgo } from "@/lib/client/format";
import type { SongView } from "@/lib/client/views";
import { INSTRUMENT_LABEL, STATUS_LABEL } from "@/lib/shared/types";
import { Launcher } from "./Launcher";
import { PlusOne } from "./PlusOne";
import { SongActions } from "./SongActions";
import { TagPills } from "./TagPills";
import { Thumb } from "./Thumb";

export function SongCard({
  view,
  showTags = true,
  showInstrument = false,
  launcherMax = 3,
}: {
  view: SongView;
  showTags?: boolean;
  showInstrument?: boolean;
  launcherMax?: number;
}) {
  const [menu, setMenu] = useState(false);
  const href = `/song?id=${view.id}`;
  const { entry, song } = view;
  return (
    <article className="card">
      <Link href={href} aria-label={song.title}>
        <Thumb src={view.thumb} title={song.title}>
          {entry.isFavorite && (
            <span className="fav-mark" aria-label="Pinned">
              <Star fill="currentColor" />
            </span>
          )}
          <div className="thumb-overlay">
            {entry.tuning ? <span className="badge">{entry.tuning}</span> : <span />}
            {entry.capo ? <span className="badge">Capo {entry.capo}</span> : null}
          </div>
        </Thumb>
      </Link>
      <div className="card-body">
        <Link href={href} className="card-text">
          <span className="card-title truncate">{song.title}</span>
          <span className="secondary truncate">{song.artist || "Unknown artist"}</span>
          <span className="card-meta">
            <span className="status-badge" data-status={entry.status}>
              {STATUS_LABEL[entry.status]}
            </span>
            {showInstrument && <span className="dot-sep">{INSTRUMENT_LABEL[entry.instrument]}</span>}
            <span className="dot-sep">{plays(entry.playCount)}</span>
            <span className="dot-sep">{timeAgo(entry.lastPlayedAt)}</span>
          </span>
        </Link>
        <button className="icon-btn sm muted" aria-label="More" onClick={() => setMenu(true)}>
          <EllipsisVertical />
        </button>
      </div>
      <div className="card-actions">
        <PlusOne entryId={view.id} />
        <Launcher view={view} max={launcherMax} />
      </div>
      {showTags && view.tags.length > 0 && <TagPills tags={view.tags} max={4} />}
      <SongActions view={view} open={menu} onClose={() => setMenu(false)} />
    </article>
  );
}
