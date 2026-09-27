import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { clearSessionCookie, currentSessionId } from "@/lib/server/auth";

export async function POST() {
  const sid = await currentSessionId();
  if (sid) {
    await db().update(schema.sessions).set({ revokedAt: new Date().toISOString() }).where(eq(schema.sessions.id, sid));
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
