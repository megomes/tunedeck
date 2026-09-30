import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { desktopStatus, markOnline, pushOffer, takeOffers } from "@/lib/server/desktop";

const noStore = { headers: { "Cache-Control": "no-store" } };

/** Phone: is the desktop app running right now? */
export const GET = withSession(async () => {
  const pc = await desktopStatus();
  return NextResponse.json(pc ? { online: true, name: pc.name } : { online: false }, noStore);
});

/**
 * Desktop app poll: `{ poll: { id, name } }` marks it online and returns pending offers.
 * Phone: `{ offer: { sid, sdp, device } }` queues a WebRTC offer for the desktop app.
 */
export const POST = withSession(async (req) => {
  const body = await req.json().catch(() => null);
  if (body?.poll && typeof body.poll.id === "string") {
    await markOnline({ id: body.poll.id, name: String(body.poll.name ?? "Computer").slice(0, 60), at: Date.now() });
    return NextResponse.json({ offers: await takeOffers() }, noStore);
  }
  const o = body?.offer;
  if (o && typeof o.sid === "string" && typeof o.sdp === "string" && o.sdp.length < 20_000) {
    await pushOffer({ sid: o.sid, sdp: o.sdp, device: String(o.device ?? "Device").slice(0, 60), at: Date.now() });
    return NextResponse.json({ ok: true }, noStore);
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
});
