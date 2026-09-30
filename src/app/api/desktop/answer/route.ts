import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { getAnswer, setAnswer } from "@/lib/server/desktop";

/** Phone polls for the desktop app's answer to its offer. */
export const GET = withSession(async (req) => {
  const sid = new URL(req.url).searchParams.get("sid");
  if (!sid) return NextResponse.json({ error: "Missing sid" }, { status: 400 });
  const sdp = await getAnswer(sid);
  return NextResponse.json({ sdp }, { headers: { "Cache-Control": "no-store" } });
});

/** Desktop app posts its answer. */
export const POST = withSession(async (req) => {
  const body = await req.json().catch(() => null);
  if (typeof body?.sid !== "string" || typeof body?.sdp !== "string" || body.sdp.length > 20_000) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  await setAnswer(body.sid, body.sdp);
  return NextResponse.json({ ok: true });
});
