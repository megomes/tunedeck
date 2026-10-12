"use client";

import { Check, Guitar, ListPlus, ListVideo, SkipForward, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type MouseEvent } from "react";
import { addToUpNext, openResource, openSongsterr, setStar } from "@/lib/client/actions";
import type { BacklogItem } from "@/lib/client/backlog";
import { duration as clock } from "@/lib/client/format";
import { toast } from "@/lib/client/ui";
import type { Resource } from "@/lib/shared/types";
import { songMenu } from "./CardMenus";
import { Clip, type ClipCtl, type ClipState } from "./Clip";
import { contextMenu } from "./ContextMenu";
import { DifficultyMeter } from "./Difficulty";
import { Thumb } from "./Thumb";

/** Sets the ⭐ a moment before now: by the time you tap, the part you liked has already started. */
export function starHere(entryId: string, resource: Resource, time: number, prev: number | null) {
  const at = Math.max(0, time - 2);
  setStar(entryId, resource.id, at);
  toast(`⭐ at ${clock(at)}: previews start here`, { label: "Undo", run: () => setStar(entryId, resource.id, prev) });
}

/** Removes the ⭐ (undoable). */
export function clearStar(entryId: string, resource: Resource, prev: number) {
  setStar(entryId, resource.id, null);
  toast("⭐ removed", { label: "Undo", run: () => setStar(entryId, resource.id, prev) });
}

const HOLD_MS = 550;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let swallowing = false;

/**
 * After a hold, the click that comes with lifting the finger must do nothing, even though the
 * button under it has already re-rendered (the ⭐ is gone). Disarmed by the next press.
 */
function swallowNextClick() {
  if (swallowing) return;
  swallowing = true;
  const onClick = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    done();
  };
  const done = () => {
    swallowing = false;
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("pointerdown", done, true);
  };
  document.addEventListener("click", onClick, true);
  // A new press starts a new interaction: let its click through.
  setTimeout(() => document.addEventListener("pointerdown", done, true), 0);
}

/**
 * Press and hold (or right-click) to run `onHold`, used to remove a ⭐ from any star button or badge.
 * The tap that ends a hold does nothing else. Empty when there's nothing to hold for.
 */
export function holdFor(onHold: (() => void) | null) {
  if (!onHold) return {};
  const fire = () => {
    clearTimeout(holdTimer);
    swallowNextClick();
    navigator.vibrate?.(15);
    onHold();
  };
  const cancel = () => clearTimeout(holdTimer);
  return {
    title: "Hold to remove the ⭐",
    onPointerDown: () => {
      cancel();
      holdTimer = setTimeout(fire, HOLD_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // Long-press on touch screens and right-click with a mouse both land here.
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!swallowing) fire();
    },
  };
}

/** Thin bars on top of a preview, one per clip, like stories. */
export function ClipBars({ state, star }: { state: ClipState | null; star: boolean }) {
  if (!state || state.count < 1) return null;
  return (
    <div className="clip-bars" aria-hidden>
      {Array.from({ length: state.count }, (_, i) => (
        <span key={i} className={i === 0 && star ? "star" : ""}>
          <i style={{ width: `${i < state.part ? 100 : i === state.part ? state.progress * 100 : 0}%` }} />
        </span>
      ))}
    </div>
  );
}

/**
 * A Backlog video. On phones/tablets, tapping the picture of a video saved on the device plays
 * short clips right in the card (from the ⭐, or a few spots in the middle); anywhere else it
 * plays the video in the player.
 */
export function BacklogCard({
  item,
  previewing,
  onPreview,
  clipLen,
  selecting,
  selected,
  onSelect,
}: {
  item: BacklogItem;
  previewing: boolean;
  onPreview: (on: boolean) => void;
  clipLen: number;
  selecting: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const { view, cover, preview, star } = item;
  const { entry, song } = view;
  const ctl = useRef<ClipCtl | null>(null);
  const [clip, setClip] = useState<ClipState | null>(null);
  const covers = view.resources.filter((r) => r.type === "guitar_cover").length;
  const shown = preview ?? cover;
  const length = clock(item.duration);

  const tapPicture = () => {
    if (selecting) return onSelect();
    if (preview) return onPreview(!previewing);
    if (shown) openResource(shown);
    else router.push(`/song?id=${view.id}`);
  };

  return (
    <article
      className={`blcard ${previewing ? "previewing" : ""} ${selected ? "selected" : ""}`}
      onContextMenu={contextMenu(() => songMenu(view, shown, router.push))}
    >
      <div className="blcard-media">
        {previewing && preview?.externalId ? (
          <div className="blcard-clip" onClick={() => ctl.current?.toggle()}>
            <Clip
              videoId={preview.externalId}
              star={star}
              len={clipLen}
              ctlRef={ctl}
              onState={setClip}
              onUnavailable={() => {
                onPreview(false);
                toast("That video is no longer saved on this device");
              }}
            />
            <ClipBars state={clip} star={star != null} />
            <div className="blcard-clip-tools" onClick={(e) => e.stopPropagation()}>
              <button
                {...holdFor(star != null ? () => clearStar(view.id, preview, star) : null)}
                className={`clip-tool star-hold ${star != null ? "on" : ""}`}
                aria-label={star != null ? "Move the star here (hold to remove)" : "Star this moment"}
                onClick={() => starHere(view.id, preview, ctl.current?.time() ?? 0, star)}
              >
                <Star fill={star != null ? "currentColor" : "none"} />
              </button>
              <button className="clip-tool" aria-label="Next clip" onClick={() => ctl.current?.next()}>
                <SkipForward />
              </button>
              <span className="grow" />
              <button className="clip-tool" aria-label="Stop preview" onClick={() => onPreview(false)}>
                <X />
              </button>
            </div>
          </div>
        ) : (
          <button className="blcard-thumb" onClick={tapPicture} aria-label={preview ? `Preview ${song.title}` : `Play ${song.title}`}>
            <Thumb src={shown?.thumbnailUrl ?? view.thumb} title={song.title}>
              {star != null && (
                <span {...holdFor(shown ? () => clearStar(view.id, shown, star) : null)} className="badge badge-tl blcard-star star-hold">
                  <Star fill="currentColor" /> {clock(star)}
                </span>
              )}
              {preview && <span className="blcard-local" title="Saved on this device: tap to preview" />}
              <div className="thumb-overlay">
                <span className="row-gap" style={{ gap: 4 }}>
                  {entry.tuning && <span className="badge">{entry.tuning}</span>}
                  {covers > 1 && (
                    <span className="badge" title={`${covers} covers`}>
                      <ListVideo /> {covers}
                    </span>
                  )}
                </span>
                {length && <span className="badge">{length}</span>}
              </div>
            </Thumb>
            {selecting && (
              <span className={`blcard-check ${selected ? "on" : ""}`} aria-hidden>
                <Check />
              </span>
            )}
          </button>
        )}
      </div>

      <div className="blcard-body" onClick={() => (selecting ? onSelect() : router.push(`/song?id=${view.id}`))}>
        <div className="blcard-text">
          <span className="blcard-title truncate">{song.title}</span>
          <span className="secondary truncate">
            {song.artist || "Unknown artist"}
            {cover?.author && <span className="dot-sep">{cover.author}</span>}
          </span>
          <span className="card-meta">
            <DifficultyMeter value={entry.difficulty} />
            {(entry.pickScore ?? 0) > 0 && <span className="blcard-picked">Picked</span>}
          </span>
        </div>
        {!selecting && (
          <div className="blcard-actions" onClick={(e) => e.stopPropagation()}>
            {entry.songsterrUrl && (
              <button className="icon-btn sm muted" aria-label="Open tab in Songsterr" onClick={() => openSongsterr(entry.songsterrUrl!, view.id)}>
                <Guitar />
              </button>
            )}
            <button className="icon-btn sm" aria-label="Add to Up Next" title="Add to Up Next" onClick={() => addToUpNext(view.id)}>
              <ListPlus />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
