import type { Entry, JamPlay, JamTrack, Op, PlayEvent, Snapshot } from "./types";

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

function recomputePlays(entries: Entry[], events: PlayEvent[], entryId: string): Entry[] {
  const own = events.filter((e) => e.repertoireEntryId === entryId);
  const last = own.reduce<string | null>((m, e) => (!m || e.playedAt > m ? e.playedAt : m), null);
  return entries.map((e) => (e.id === entryId ? { ...e, playCount: own.length, lastPlayedAt: last } : e));
}

function recomputeJam(tracks: JamTrack[], plays: JamPlay[], trackId: string): JamTrack[] {
  const own = plays.filter((p) => p.trackId === trackId);
  const last = own.reduce<string | null>((m, p) => (!m || p.playedAt > m ? p.playedAt : m), null);
  return tracks.map((t) => (t.id === trackId ? { ...t, playCount: own.length, lastPlayedAt: last } : t));
}

/** Pure reducer used for optimistic updates and for rebasing queued ops on top of server state. */
export function applyOp(s: Snapshot, op: Op): Snapshot {
  switch (op.t) {
    case "song.upsert":
      return { ...s, songs: upsert(s.songs, op.song) };

    case "entry.upsert": {
      // Play stats are derived from play events and never overwritten by an edit.
      const prev = s.entries.find((e) => e.id === op.entry.id);
      const entry = prev ? { ...op.entry, playCount: prev.playCount, lastPlayedAt: prev.lastPlayedAt } : op.entry;
      return { ...s, entries: upsert(s.entries, entry) };
    }

    case "entry.delete": {
      const entry = s.entries.find((e) => e.id === op.id);
      const entries = s.entries.filter((e) => e.id !== op.id);
      const songs = entry && !entries.some((e) => e.songId === entry.songId)
        ? s.songs.filter((x) => x.id !== entry.songId)
        : s.songs;
      return {
        ...s,
        songs,
        entries,
        resources: s.resources.filter((r) => r.repertoireEntryId !== op.id),
        entryTags: s.entryTags.filter((t) => t.repertoireEntryId !== op.id),
        playEvents: s.playEvents.filter((p) => p.repertoireEntryId !== op.id),
        attachments: s.attachments.filter((a) => a.repertoireEntryId !== op.id),
        riffs: (s.riffs ?? []).filter((r) => r.repertoireEntryId !== op.id),
      };
    }

    case "resource.upsert":
      return { ...s, resources: upsert(s.resources, op.resource) };

    case "resource.delete":
      return { ...s, resources: s.resources.filter((r) => r.id !== op.id) };

    case "resource.reorder": {
      const order = new Map(op.ids.map((id, i) => [id, i]));
      return {
        ...s,
        resources: s.resources.map((r) =>
          r.repertoireEntryId === op.entryId && order.has(r.id) ? { ...r, sortOrder: order.get(r.id)! } : r,
        ),
      };
    }

    case "resource.setPrimary": {
      const target = s.resources.find((r) => r.id === op.id);
      if (!target) return s;
      return {
        ...s,
        resources: s.resources.map((r) =>
          r.repertoireEntryId === target.repertoireEntryId && r.type === target.type
            ? { ...r, isPrimary: r.id === op.id }
            : r,
        ),
      };
    }

    case "tag.upsert":
      return { ...s, tags: upsert(s.tags, op.tag) };

    case "tag.delete":
      return {
        ...s,
        tags: s.tags.filter((t) => t.id !== op.id),
        entryTags: s.entryTags.filter((t) => t.tagId !== op.id),
      };

    case "entry.setTags":
      return {
        ...s,
        entryTags: [
          ...s.entryTags.filter((t) => t.repertoireEntryId !== op.entryId),
          ...op.tagIds
            .filter((id) => s.tags.some((t) => t.id === id))
            .map((tagId) => ({ repertoireEntryId: op.entryId, tagId })),
        ],
      };

    case "play.add": {
      if (!s.entries.some((e) => e.id === op.event.repertoireEntryId)) return s;
      const playEvents = upsert(s.playEvents, op.event);
      return { ...s, playEvents, entries: recomputePlays(s.entries, playEvents, op.event.repertoireEntryId) };
    }

    case "play.delete": {
      const playEvents = s.playEvents.filter((p) => p.id !== op.id);
      return { ...s, playEvents, entries: recomputePlays(s.entries, playEvents, op.entryId) };
    }

    case "attachment.upsert":
      return { ...s, attachments: upsert(s.attachments, op.attachment) };

    case "attachment.delete":
      return { ...s, attachments: s.attachments.filter((a) => a.id !== op.id) };

    case "setting.set":
      return { ...s, settings: { ...s.settings, [op.key]: op.value } };

    case "jam.upsert": {
      const tracks = s.jamTracks ?? [];
      const prev = tracks.find((t) => t.id === op.track.id);
      const track = prev ? { ...op.track, playCount: prev.playCount, lastPlayedAt: prev.lastPlayedAt } : op.track;
      return { ...s, jamTracks: upsert(tracks, track) };
    }

    case "jam.delete":
      return {
        ...s,
        jamTracks: (s.jamTracks ?? []).filter((t) => t.id !== op.id),
        jamPlays: (s.jamPlays ?? []).filter((p) => p.trackId !== op.id),
      };

    case "jamPlay.add": {
      if (!(s.jamTracks ?? []).some((t) => t.id === op.play.trackId)) return s;
      const jamPlays = upsert(s.jamPlays ?? [], op.play);
      return { ...s, jamPlays, jamTracks: recomputeJam(s.jamTracks, jamPlays, op.play.trackId) };
    }

    case "jamPlay.delete": {
      const jamPlays = (s.jamPlays ?? []).filter((p) => p.id !== op.id);
      return { ...s, jamPlays, jamTracks: recomputeJam(s.jamTracks ?? [], jamPlays, op.trackId) };
    }

    case "riff.upsert":
      if (!s.entries.some((e) => e.id === op.riff.repertoireEntryId)) return s;
      return { ...s, riffs: upsert(s.riffs ?? [], op.riff) };

    case "riff.delete":
      return { ...s, riffs: (s.riffs ?? []).filter((r) => r.id !== op.id) };
  }
}
