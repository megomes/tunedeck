import "server-only";
import { loadSnapshot } from "@/lib/server/data";
import type { Entry, Resource, Snapshot } from "@/lib/shared/types";
import { youtubeId } from "@/lib/shared/urls";
import type { Row } from "./list";

export interface ShareSection {
  title: string;
  tone: string;
  items: Row[];
  /** Tuning chips above the grid. */
  filter?: boolean;
}

function rows(snap: Snapshot, entries: Entry[], riffsOf?: (e: Entry) => string[]): Row[] {
  const songs = new Map(snap.songs.map((s) => [s.id, s]));
  return entries.map((e) => {
    const res = snap.resources.filter((r) => r.repertoireEntryId === e.id);
    const yt = res.filter((r) => r.provider === "youtube");
    const find = (type: Resource["type"]) => yt.find((r) => r.type === type);
    const video = (type: Resource["type"]) => find(type)?.url ?? null;
    // Official video first, then the cover, then any other video of the song.
    const pic = find("original") ?? find("guitar_cover") ?? yt[0];
    const picId = pic ? youtubeId(pic.url) : null;
    const song = songs.get(e.songId);
    return {
      id: e.id,
      title: song?.title ?? "",
      artist: song?.artist ?? "",
      tuning: e.tuning,
      capo: e.capo,
      riffs: riffsOf?.(e) ?? [],
      original: video("original"),
      cover: video("guitar_cover"),
      // mqdefault is 16:9 with no black bars, unlike hqdefault.
      thumb: picId ? `https://i.ytimg.com/vi/${picId}/mqdefault.jpg` : (pic?.thumbnailUrl ?? null),
    };
  });
}

/** Já toco, Aprendendo, Próximas and Backlog, skipping empty ones. */
export async function loadShareSections(): Promise<ShareSection[]> {
  const snap = await loadSnapshot();
  const byPos = (a: Entry, b: Entry) => a.position - b.position;
  const whole = snap.entries.filter((e) => !e.riffOnly);
  const learningRiffs = (e: Entry) =>
    snap.riffs.filter((r) => r.repertoireEntryId === e.id && r.status === "LEARNING").map((r) => r.name);

  const sections: ShareSection[] = [
    {
      title: "Já toco",
      tone: "#4cc38a",
      // Mastered first, then Can Play, each in board order.
      items: rows(snap, [
        ...whole.filter((e) => e.status === "MASTERED").sort(byPos),
        ...whole.filter((e) => e.status === "CAN_PLAY").sort(byPos),
      ]),
    },
    {
      title: "Aprendendo agora",
      tone: "#ff4d4d",
      items: rows(
        snap,
        snap.entries.filter((e) => (e.riffOnly ? learningRiffs(e).length > 0 : e.status === "LEARNING")).sort(byPos),
        (e) => (e.riffOnly ? learningRiffs(e) : []),
      ),
    },
    { title: "Próximas", tone: "#fbbf24", items: rows(snap, whole.filter((e) => e.status === "WANT_TO_PLAY").sort(byPos)) },
    {
      title: "Backlog",
      tone: "#9a9a9a",
      filter: true,
      items: rows(snap, whole.filter((e) => e.status === "BACKLOG").sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    },
  ];
  return sections.filter((s) => s.items.length);
}

/** "9 já toco · 5 aprendendo agora · …", used in the page header and the link preview. */
export const summary = (sections: ShareSection[]) =>
  sections.map((s) => `${s.items.length} ${s.title.toLowerCase()}`).join(" · ");
