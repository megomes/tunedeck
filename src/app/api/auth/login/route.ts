import { NextResponse } from "next/server";
import { checkAccessCode, createSession, setSessionCookie } from "@/lib/server/auth";

const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code || !checkAccessCode(code)) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? now + 60_000 : 0 });
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Invalid access code" }, { status: 401 });
  }
  attempts.delete(ip);

  const token = await createSession(req.headers.get("user-agent"));
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token);
  return res;
}
