"use client";

import { ExternalLink, Flag, Guitar, Pencil, Play, Plus, Star, Trash2, Zap } from "lucide-react";
import {
  deleteEntry,
  deleteJam,
  jamPlayed,
  openLink,
  openResource,
  openSongsterr,
  playJamTrack,
  playedOnce,
  setRiffOnly,
  setStatus,
  toggleFavorite,
  toggleJamFavorite,
} from "@/lib/client/actions";
import { getState } from "@/lib/client/store";
import type { SongView } from "@/lib/client/views";
import { STATUSES, STATUS_LABEL } from "@/lib/shared/types";
import type { MenuEntry } from "./ContextMenu";
import { STATUS_DOT } from "./RiffMenu";

/** Right-click menu for a song card on the Library board. */
export function songMenu(view: SongView, video: { externalId: string | null } | undefined, go: (href: string) => void): MenuEntry[] {
  const { entry, song } = view;
  const playable = view.resources.find((r) => r.externalId === video?.externalId);
  return [
    { label: song.title, disabled: true },
    "separator",
    { label: "Play video", icon: <Play />, disabled: !playable, onSelect: () => playable && openResource(playable) },
    { label: "Open tab", icon: <Guitar />, disabled: !entry.songsterrUrl, onSelect: () => openSongsterr(entry.songsterrUrl!, view.id) },
    { label: "Played +1", icon: <Plus />, onSelect: () => playedOnce(view.id) },
    "separator",
    {
      label: "Status",
      icon: <Flag />,
      children: STATUSES.map((s) => ({ label: STATUS_LABEL[s], dot: STATUS_DOT[s], checked: entry.status === s, onSelect: () => setStatus(view.id, s) })),
    },
    { label: entry.isFavorite ? "Unpin" : "Pin", icon: <Star />, onSelect: () => toggleFavorite(view.id) },
    { label: "Just riffs (move to Riffs)", icon: <Zap />, onSelect: () => setRiffOnly(view.id, true) },
    "separator",
    { label: "Open song", icon: <ExternalLink />, onSelect: () => go(`/song?id=${view.id}`) },
    { label: "Edit details", icon: <Pencil />, onSelect: () => go(`/song/edit?id=${view.id}`) },
    "separator",
    {
      label: "Delete song",
      icon: <Trash2 />,
      danger: true,
      onSelect: () => {
        if (confirm(`Delete "${song.title}"? Its videos, riffs, files and play history go too.`)) deleteEntry(view.id);
      },
    },
  ];
}

/** Right-click menu for a backing track in Jam. */
export function jamMenu(id: string, go: (href: string) => void): MenuEntry[] {
  const t = getState().data.jamTracks.find((x) => x.id === id);
  if (!t) return [];
  return [
    { label: t.title, disabled: true },
    "separator",
    { label: "Play", icon: <Play />, onSelect: () => playJamTrack(id) },
    { label: "Jammed +1", icon: <Plus />, onSelect: () => jamPlayed(id) },
    { label: t.isFavorite ? "Remove from favorites" : "Favorite", icon: <Star />, onSelect: () => toggleJamFavorite(id) },
    "separator",
    { label: "Edit", icon: <Pencil />, onSelect: () => go(`/jam/edit?id=${id}`) },
    { label: "Open on YouTube", icon: <ExternalLink />, onSelect: () => openLink(t.url) },
    "separator",
    {
      label: "Delete backing track",
      icon: <Trash2 />,
      danger: true,
      onSelect: () => confirm(`Delete "${t.title}"? Its jam history goes too.`) && deleteJam(id),
    },
  ];
}
