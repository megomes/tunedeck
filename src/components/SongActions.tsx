"use client";

import { Check, Eye, Pencil, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { setStatus, toggleFavorite } from "@/lib/client/actions";
import type { SongView } from "@/lib/client/views";
import { STATUSES, STATUS_LABEL } from "@/lib/shared/types";
import { Sheet } from "./Sheet";

export function StatusList({ value, onPick }: { value: string; onPick: (s: (typeof STATUSES)[number]) => void }) {
  return (
    <div className="menu-list">
      {STATUSES.map((s) => (
        <button key={s} className="menu-item" onClick={() => onPick(s)}>
          <span className="status-badge" data-status={s} />
          <span className="grow">{STATUS_LABEL[s]}</span>
          {value === s && <Check className="check" />}
        </button>
      ))}
    </div>
  );
}

export function SongActions({ view, open, onClose }: { view: SongView; open: boolean; onClose: () => void }) {
  const router = useRouter();
  return (
    <Sheet open={open} onClose={onClose} title={view.song.title}>
      <p className="step-title">Status</p>
      <StatusList
        value={view.entry.status}
        onPick={(s) => {
          setStatus(view.id, s);
          onClose();
        }}
      />
      <p className="step-title mt-4">Song</p>
      <div className="menu-list">
        <button
          className="menu-item"
          onClick={() => {
            toggleFavorite(view.id);
            onClose();
          }}
        >
          <Star fill={view.entry.isFavorite ? "currentColor" : "none"} />
          <span className="grow">{view.entry.isFavorite ? "Unpin" : "Pin to top"}</span>
        </button>
        <button className="menu-item" onClick={() => router.push(`/song?id=${view.id}`)}>
          <Eye />
          <span className="grow">Open song</span>
        </button>
        <button className="menu-item" onClick={() => router.push(`/song/edit?id=${view.id}`)}>
          <Pencil />
          <span className="grow">Edit</span>
        </button>
      </div>
    </Sheet>
  );
}
