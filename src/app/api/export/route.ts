import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { loadSnapshot } from "@/lib/server/data";
import { STATUS_LABEL } from "@/lib/shared/types";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = withSession(async (req) => {
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const snap = await loadSnapshot();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const songs = new Map(snap.songs.map((s) => [s.id, s]));
    const tagNames = new Map(snap.tags.map((t) => [t.id, t.name]));
    const header = ["Title", "Artist", "Instrument", "Status", "Tuning", "Capo", "Tags", "Play count", "Last played", "Songsterr", "Added"];
    const rows = snap.entries.map((e) => {
      const song = songs.get(e.songId);
      const tags = snap.entryTags.filter((t) => t.repertoireEntryId === e.id).map((t) => tagNames.get(t.tagId)).join("; ");
      return [song?.title, song?.artist, e.instrument, STATUS_LABEL[e.status], e.tuning, e.capo, tags, e.playCount, e.lastPlayedAt, e.songsterrUrl, e.createdAt];
    });
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tunedeck-songs-${stamp}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify({ app: "tunedeck", version: 1, exportedAt: new Date().toISOString(), data: snap }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tunedeck-backup-${stamp}.json"`,
    },
  });
});
