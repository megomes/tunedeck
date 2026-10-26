"use client";

import { Guitar, Heart } from "lucide-react";
import Link from "next/link";
import { openSongsterr } from "@/lib/client/actions";
import { plays, timeAgo } from "@/lib/client/format";
import type { SongView } from "@/lib/client/views";
import { INSTRUMENT_LABEL, STATUS_LABEL } from "@/lib/shared/types";
import { PlusOne } from "./PlusOne";
import { TagPills } from "./TagPills";
import { Thumb } from "./Thumb";

export function SongRow({
  view,
  showTags = false,
  showInstrument = false,
  meta,
}: {
  view: SongView;
  showTags?: boolean;
  showInstrument?: boolean;
  meta?: string;
}) {
  const { entry, song } = view;
  const href = `/song?id=${view.id}`;
  return (
    <div className="row">
      <Link href={href} tabIndex={-1} aria-hidden>
        <Thumb src={view.thumb} title={song.title} />
      </Link>
      <Link href={href} className="row-main">
        <span className="row-title truncate">
          {entry.isFavorite && <Heart size={12} fill="currentColor" style={{ display: "inline", marginRight: 5, verticalAlign: -1 }} />}
          {song.title}
        </span>
        <span className="secondary truncate">{song.artist || "Unknown artist"}</span>
        <span className="card-meta">
          {meta ? (
            <span>{meta}</span>
          ) : (
            <>
              <span className="status-badge" data-status={entry.status}>
                {STATUS_LABEL[entry.status]}
              </span>
              {entry.tuning && <span className="dot-sep">{entry.tuning}</span>}
              {showInstrument && <span className="dot-sep">{INSTRUMENT_LABEL[entry.instrument]}</span>}
              <span className="dot-sep">{plays(entry.playCount)}</span>
              <span className="dot-sep">{timeAgo(entry.lastPlayedAt)}</span>
            </>
          )}
        </span>
        {showTags && view.tags.length > 0 && (
          <span className="mt-2" style={{ display: "block" }}>
            <TagPills tags={view.tags} max={3} />
          </span>
        )}
      </Link>
      <div className="row-side">
        {entry.songsterrUrl ? (
          <button
            className="icon-btn sm"
            style={{ color: "#ff8080" }}
            aria-label="Open in Songsterr"
            onClick={() => openSongsterr(entry.songsterrUrl!, view.id)}
          >
            <Guitar />
          </button>
        ) : null}
        <PlusOne entryId={view.id} />
      </div>
    </div>
  );
}
