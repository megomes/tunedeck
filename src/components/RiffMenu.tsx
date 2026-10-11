"use client";

import { Eraser, ExternalLink, Flag, Pencil, Play, Repeat, Tag, Trash2 } from "lucide-react";
import { clearRiffMark, deleteRiff, playRiff, renameRiff, setRiffStatus } from "@/lib/client/actions";
import { getState } from "@/lib/client/store";
import { playVideo } from "@/lib/client/ui";
import { RESOURCE_SHORT, RIFF_PARTS, STATUSES, STATUS_LABEL, riffColor } from "@/lib/shared/types";
import type { MenuEntry } from "./ContextMenu";
import { riffTime } from "./Riffs";

/** Same dots as the status badges. */
export const STATUS_DOT: Record<string, string> = {
  WANT_TO_PLAY: "var(--text-tertiary)",
  LEARNING: "var(--accent)",
  CAN_PLAY: "var(--text-secondary)",
  MASTERED: "var(--text-primary)",
  ARCHIVED: "var(--text-disabled)",
  BACKLOG: "transparent",
};

/**
 * Right-click menu for a riff. `resourceId` is the video it was opened from (player), which
 * adds options for that video; `go` navigates (router.push).
 */
export function riffMenu(id: string, opts: { resourceId?: string; go?: (href: string) => void } = {}): MenuEntry[] {
  const { riffs, resources } = getState().data;
  const r = riffs.find((x) => x.id === id);
  if (!r) return [];
  const videos = resources.filter((v) => v.repertoireEntryId === r.repertoireEntryId && v.provider === "youtube" && v.externalId);
  const looped = videos.some((v) => r.marks[v.id]?.b != null);
  const here = opts.resourceId ? r.marks[opts.resourceId] : undefined;

  return [
    { label: r.name, dot: riffColor(r), disabled: true },
    "separator",
    { label: "Play and loop", icon: <Repeat />, disabled: !looped, onSelect: () => playRiff(id, opts.resourceId) },
    {
      label: "Play in",
      icon: <Play />,
      disabled: !videos.length,
      children: videos.map((v) => {
        const m = r.marks[v.id];
        return {
          label: `${v.customLabel || RESOURCE_SHORT[v.type]} · ${m ? `${riffTime(m.a)}${m.b != null ? `–${riffTime(m.b)}` : ""}` : "mark it there"}`,
          checked: v.id === opts.resourceId,
          // Unmarked: the video opens with the riff selected, ready for "Mark … here".
          onSelect: () => (m ? playRiff(id, v.id) : playVideo(v.id, r.repertoireEntryId, id)),
        };
      }),
    },
    "separator",
    {
      label: "Name",
      icon: <Pencil />,
      children: [
        ...RIFF_PARTS.map((p) => ({ label: p.name, dot: p.color, checked: r.name === p.name, onSelect: () => renameRiff(id, p.name) })),
        "separator" as const,
        {
          label: "Custom name…",
          icon: <Tag />,
          onSelect: () => {
            const name = window.prompt("Riff name", r.name);
            if (name) renameRiff(id, name);
          },
        },
      ],
    },
    {
      label: "Status",
      icon: <Flag />,
      children: STATUSES.map((s) => ({ label: STATUS_LABEL[s], dot: STATUS_DOT[s], checked: r.status === s, onSelect: () => setRiffStatus(id, s) })),
    },
    ...(opts.go ? [{ label: "Open song", icon: <ExternalLink />, onSelect: () => opts.go!(`/song?id=${r.repertoireEntryId}#riffs`) }] : []),
    ...(opts.resourceId && here
      ? [{ label: "Clear mark in this video", icon: <Eraser />, onSelect: () => clearRiffMark(id, opts.resourceId!) }]
      : []),
    "separator",
    { label: `Delete ${r.name}`, icon: <Trash2 />, danger: true, onSelect: () => deleteRiff(id) },
  ];
}
