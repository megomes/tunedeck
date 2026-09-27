import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { applyOps } from "@/lib/server/data";
import type { Op, Snapshot } from "@/lib/shared/types";

/** Restores a JSON backup by replaying it as idempotent upserts (merges with existing data). */
export const POST = withSession(async (req) => {
  const body = await req.json().catch(() => null);
  const data: Snapshot | undefined = body?.data ?? body;
  if (!data || !Array.isArray(data.songs) || !Array.isArray(data.entries)) {
    return NextResponse.json({ error: "Not a TuneDeck backup" }, { status: 400 });
  }
  const ops: Op[] = [
    ...data.songs.map((song) => ({ t: "song.upsert", song }) as Op),
    ...data.entries.map((entry) => ({ t: "entry.upsert", entry }) as Op),
    ...(data.tags ?? []).map((tag) => ({ t: "tag.upsert", tag }) as Op),
    ...(data.resources ?? []).map((resource) => ({ t: "resource.upsert", resource }) as Op),
    ...(data.attachments ?? []).map((attachment) => ({ t: "attachment.upsert", attachment }) as Op),
    ...data.entries.map((e) => ({
      t: "entry.setTags",
      entryId: e.id,
      tagIds: (data.entryTags ?? []).filter((t) => t.repertoireEntryId === e.id).map((t) => t.tagId),
    }) as Op),
    ...(data.playEvents ?? []).map((event) => ({ t: "play.add", event }) as Op),
    ...Object.entries(data.settings ?? {}).map(([key, value]) => ({ t: "setting.set", key, value }) as Op),
  ];
  let applied = 0;
  const failed: unknown[] = [];
  for (let i = 0; i < ops.length; i += 200) {
    const r = await applyOps(ops.slice(i, i + 200));
    applied += r.applied;
    failed.push(...r.failed);
  }
  return NextResponse.json({ applied, failed: failed.length });
});
