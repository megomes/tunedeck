import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { applyOps } from "@/lib/server/data";
import type { Op } from "@/lib/shared/types";

// A record (not a list) so adding an Op type without allowing it here fails to compile.
const ALLOWED: Record<Op["t"], true> = {
  "song.upsert": true, "entry.upsert": true, "entry.delete": true, "resource.upsert": true, "resource.delete": true,
  "resource.reorder": true, "resource.setPrimary": true, "tag.upsert": true, "tag.delete": true, "entry.setTags": true,
  "play.add": true, "play.delete": true, "attachment.upsert": true, "attachment.delete": true, "setting.set": true,
  "jam.upsert": true, "jam.delete": true, "jamPlay.add": true, "jamPlay.delete": true,
  "riff.upsert": true, "riff.delete": true,
};
const KNOWN = new Set(Object.keys(ALLOWED));

export const POST = withSession(async (req) => {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  const body = await req.json().catch(() => null);
  const ops: unknown = body?.ops;
  if (!Array.isArray(ops) || ops.length > 500 || !ops.every((o) => o && KNOWN.has(o.t))) {
    return NextResponse.json({ error: "Invalid ops" }, { status: 400 });
  }
  const result = await applyOps(ops as Op[]);
  return NextResponse.json(result);
});
