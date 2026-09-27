import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { applyOps } from "@/lib/server/data";
import type { Op } from "@/lib/shared/types";

const KNOWN = new Set<Op["t"]>([
  "song.upsert", "entry.upsert", "entry.delete", "resource.upsert", "resource.delete",
  "resource.reorder", "resource.setPrimary", "tag.upsert", "tag.delete", "entry.setTags",
  "play.add", "play.delete", "attachment.upsert", "attachment.delete", "setting.set",
]);

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
