import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { withSession } from "@/lib/server/auth";
import { loadSnapshot } from "@/lib/server/data";

export const GET = withSession(async (_req, sid) => {
  const [snapshot] = await Promise.all([
    loadSnapshot(),
    db().update(schema.sessions).set({ lastSeenAt: new Date().toISOString() }).where(eq(schema.sessions.id, sid)),
  ]);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
});
