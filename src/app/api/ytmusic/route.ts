import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";

/** Most videos YouTube puts in one temporary playlist. */
const MAX = 50;
const VIDEO_ID = /^[\w-]{11}$/;

/**
 * Turns a list of video ids into a YouTube Music queue link. YouTube's `watch_videos` makes a
 * temporary playlist (id `TLGG…`) and redirects to it; YouTube Music opens that playlist too, so the
 * songs play there (Android Auto, Premium background play) in the same order.
 */
export const POST = withSession(async (req) => {
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string" && VIDEO_ID.test(id)).slice(0, MAX) : [];
  if (!ids.length) return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  try {
    const res = await fetch(`https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        // Skip the cookie consent page (EU servers): it would hide the redirect.
        Cookie: "SOCS=CAI; CONSENT=YES+1",
      },
    });
    void res.body?.cancel();
    // The playlist id is in the redirect, or inside the consent page's `continue` link.
    const list = decodeURIComponent(res.headers.get("location") ?? "").match(/[?&]list=(TL[\w-]+)/)?.[1];
    if (!list) return NextResponse.json({ error: "No playlist" }, { status: 502 });
    return NextResponse.json({ url: `https://music.youtube.com/watch?v=${ids[0]}&list=${list}` });
  } catch (err) {
    console.error("ytmusic failed", err);
    return NextResponse.json({ error: "YouTube unavailable" }, { status: 502 });
  }
});
