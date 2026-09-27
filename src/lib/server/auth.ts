import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";

export const SESSION_COOKIE = "td_session";
const MAX_AGE = 60 * 60 * 24 * 400; // browsers cap cookie lifetime at 400 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
}

function sign(sid: string) {
  return createHmac("sha256", secret()).update(sid).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Compares the submitted code against ACCESS_CODE_HASH (sha256 hex). The raw code is never stored. */
export function checkAccessCode(code: string): boolean {
  const expected = process.env.ACCESS_CODE_HASH?.trim().toLowerCase();
  if (!expected) throw new Error("ACCESS_CODE_HASH is not set");
  // Codes are case-insensitive: ACCESS_CODE_HASH = sha256(UPPERCASE(code)).
  const got = createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
  return safeEqual(got, expected);
}

export async function createSession(userAgent: string | null) {
  const id = randomUUID();
  await db().insert(schema.sessions).values({ id, userAgent: userAgent?.slice(0, 300) ?? null });
  return `${id}.${sign(id)}`;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

function parseToken(token: string | undefined): string | null {
  if (!token) return null;
  const [sid, sig] = token.split(".");
  if (!sid || !sig || !safeEqual(sig, sign(sid))) return null;
  return sid;
}

/** Returns the active session id, or null when missing, forged or revoked. */
export async function currentSessionId(): Promise<string | null> {
  const jar = await cookies();
  const sid = parseToken(jar.get(SESSION_COOKIE)?.value);
  if (!sid) return null;
  const rows = await db()
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, sid), isNull(schema.sessions.revokedAt)))
    .limit(1);
  return rows[0]?.id ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** Wraps a route handler so it only runs for an authenticated device. */
export function withSession<A extends unknown[]>(
  handler: (req: Request, sid: string, ...rest: A) => Promise<Response>,
) {
  return async (req: Request, ...rest: A) => {
    const sid = await currentSessionId();
    if (!sid) return unauthorized();
    return handler(req, sid, ...rest);
  };
}
