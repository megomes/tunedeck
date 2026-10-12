"use client";

import { ArrowRightLeft, Play, Square } from "lucide-react";
import { useMemo, useState } from "react";
import { swapIntoUpNext } from "@/lib/client/actions";
import { clipSeconds, toItem, type BacklogItem } from "@/lib/client/backlog";
import { useOffline } from "@/lib/client/offline";
import { useData } from "@/lib/client/store";
import { askUpNextSwap, useUpNextSwap } from "@/lib/client/ui";
import { useViews } from "@/lib/client/views";
import { UP_NEXT_MAX } from "@/lib/shared/types";
import { Clip } from "./Clip";
import { Sheet } from "./Sheet";
import { Thumb } from "./Thumb";

/** Picture of a song that plays its clip in place (videos saved on this device only). */
function Media({ item, playing, onToggle, clipLen }: { item: BacklogItem; playing: boolean; onToggle: () => void; clipLen: number }) {
  const { preview, view } = item;
  const canPlay = !!preview?.externalId;
  return (
    <button className="swap-media" onClick={canPlay ? onToggle : undefined} disabled={!canPlay} aria-label={canPlay ? `Preview ${view.song.title}` : view.song.title}>
      {playing && preview?.externalId ? (
        <Clip videoId={preview.externalId} star={item.star} len={clipLen} onUnavailable={onToggle} />
      ) : (
        <Thumb src={preview?.thumbnailUrl ?? view.thumb} title={view.song.title} />
      )}
      {canPlay && <span className="swap-play">{playing ? <Square fill="currentColor" /> : <Play fill="currentColor" />}</span>}
    </button>
  );
}

/**
 * Up Next holds 5 songs. Adding a sixth asks which one goes back to the Backlog to make room,
 * with previews of all of them to help decide; or cancel.
 */
export function UpNextSwap() {
  const incomingId = useUpNextSwap();
  const data = useData();
  const views = useViews();
  const videos = useOffline((s) => (s.handheld ? s.videos : null));
  const clipLen = clipSeconds(data.settings);
  const [playing, setPlaying] = useState<string | null>(null);

  const incoming = useMemo(() => {
    const v = views.find((x) => x.id === incomingId);
    return v ? toItem(v, videos) : null;
  }, [views, incomingId, videos]);
  const queue = useMemo(
    () =>
      views
        .filter((v) => v.entry.status === "WANT_TO_PLAY" && !v.entry.riffOnly)
        .sort((a, b) => (a.entry.position ?? 0) - (b.entry.position ?? 0) || b.entry.createdAt.localeCompare(a.entry.createdAt))
        .map((v) => toItem(v, videos)),
    [views, videos],
  );

  const close = () => {
    setPlaying(null);
    askUpNextSwap(null);
  };
  const toggle = (id: string) => setPlaying((p) => (p === id ? null : id));

  return (
    <Sheet
      open={!!incoming}
      onClose={close}
      title={`Up Next is full (${UP_NEXT_MAX})`}
      footer={
        <button className="btn btn-surface btn-block" onClick={close}>
          Cancel
        </button>
      }
    >
      {incoming && (
        <div className="swap">
          <p className="hint" style={{ margin: 0 }}>Adding</p>
          <div className="swap-row incoming">
            <Media item={incoming} playing={playing === incoming.view.id} onToggle={() => toggle(incoming.view.id)} clipLen={clipLen} />
            <div className="swap-text">
              <span className="swap-title truncate">{incoming.view.song.title}</span>
              <span className="meta truncate">
                {incoming.view.song.artist}
                {incoming.view.entry.tuning && <span className="dot-sep">{incoming.view.entry.tuning}</span>}
              </span>
            </div>
          </div>

          <p className="hint" style={{ margin: "8px 0 0" }}>Which one goes back to the Backlog?</p>
          {queue.map((x, i) => (
            <div key={x.view.id} className="swap-row">
              <Media item={x} playing={playing === x.view.id} onToggle={() => toggle(x.view.id)} clipLen={clipLen} />
              <div className="swap-text">
                <span className="swap-title truncate">
                  <span className="swap-n">{i + 1}</span>
                  {x.view.song.title}
                </span>
                <span className="meta truncate">
                  {x.view.song.artist}
                  {x.view.entry.tuning && <span className="dot-sep">{x.view.entry.tuning}</span>}
                </span>
              </div>
              <button
                className="btn btn-surface btn-sm"
                onClick={() => {
                  swapIntoUpNext(incoming.view.id, x.view.id);
                  close();
                }}
              >
                <ArrowRightLeft /> Swap
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
