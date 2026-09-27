import { and, desc, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { withSession } from "@/lib/server/auth";

export const GET = withSession(async (_req, sid) => {
  const rows = await db()
    .select()
    .from(schema.sessions)
    .where(isNull(schema.sessions.revokedAt))
    .orderBy(desc(schema.sessions.lastSeenAt));
  return NextResponse.json({
    sessions: rows.map((r) => ({
      id: r.id,
      userAgent: r.userAgent,
      createdAt: new Date(r.createdAt).toISOString(),
      lastSeenAt: new Date(r.lastSeenAt).toISOString(),
      current: r.id === sid,
    })),
  });
});

/** Revokes every other device session. */
export const DELETE = withSession(async (_req, sid) => {
  await db()
    .update(schema.sessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(isNull(schema.sessions.revokedAt), ne(schema.sessions.id, sid)));
  return NextResponse.json({ ok: true });
});
