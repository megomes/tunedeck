"use client";

import { Guitar, Play, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { openResource, openSongsterr } from "@/lib/client/actions";
import { timeAgo } from "@/lib/client/format";
import { primaryOf, type SongView } from "@/lib/client/views";
import { DifficultyMeter } from "./Difficulty";
import { PlusOne } from "./PlusOne";
import { Thumb } from "./Thumb";

/** The video the thumbnail plays: primary original, else the first YouTube resource. */
export function playableOf(view: SongView) {
  return (
    primaryOf(view.byType.original?.filter((r) => r.provider === "youtube")) ??
    view.resources.find((r) => r.provider === "youtube")
  );
}

export function BoardCard({
  view,
  dragRef,
  dragProps,
  style,
  overlay = false,
  ghost = false,
  wasDragging,
}: {
  view: SongView;
  dragRef?: Ref<HTMLDivElement>;
  dragProps?: HTMLAttributes<HTMLDivElement>;
  style?: CSSProperties;
  overlay?: boolean;
  ghost?: boolean;
  /** Suppresses the click that follows a drop. */
  wasDragging?: () => boolean;
}) {
  const router = useRouter();
  const { entry, song } = view;
  const video = playableOf(view);
  const open = () => {
    if (wasDragging?.()) return;
    router.push(`/song?id=${view.id}`);
  };

  return (
    <div
      ref={dragRef}
      style={style}
      className={`bcard ${overlay ? "overlay" : ""} ${ghost ? "ghost" : ""}`}
      onClick={open}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && open()}
      {...dragProps}
    >
      <div className="bcard-thumb">
        <button
          className="bcard-thumb-hit"
          aria-label={video ? `Play ${song.title}` : song.title}
          onClick={(e) => {
            e.stopPropagation();
            if (wasDragging?.()) return;
            if (video) openResource(video);
            else open();
          }}
        >
          <Thumb src={view.thumb} title={song.title}>
            {video && (
              <span className="bcard-play" aria-hidden>
                <Play fill="currentColor" />
              </span>
            )}
            {entry.tuning && (
              <div className="thumb-overlay">
                <span className="badge">{entry.tuning}</span>
              </div>
            )}
          </Thumb>
        </button>
        {entry.songsterrUrl && (
          // One tap straight into the tab, without opening the song.
          <button
            className="bcard-tab"
            aria-label="Open tab in Songsterr"
            onClick={(e) => {
              e.stopPropagation();
              if (!wasDragging?.()) openSongsterr(entry.songsterrUrl!, view.id);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Guitar />
          </button>
        )}
      </div>
      <div className="bcard-main">
        <span className="bcard-title truncate">
          {entry.isFavorite && <Star size={11} fill="currentColor" className="bcard-star" />}
          {song.title}
        </span>
        <span className="secondary truncate">{song.artist || "Unknown artist"}</span>
        <span className="card-meta">
          <DifficultyMeter value={entry.difficulty} />
          {entry.playCount ? `${entry.playCount}× · ${timeAgo(entry.lastPlayedAt)}` : "Not played yet"}
        </span>
      </div>
      <div
        className="bcard-actions"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <PlusOne entryId={view.id} />
      </div>
    </div>
  );
}
