import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { disableFeed, getFeedToken, rotateFeedToken } from "@/lib/server/feed";

export const GET = withSession(async () => NextResponse.json({ token: await getFeedToken() }));

/** Enables the feed or replaces its link, so an old link stops working. */
export const POST = withSession(async () => NextResponse.json({ token: await rotateFeedToken() }));

export const DELETE = withSession(async () => {
  await disableFeed();
  return NextResponse.json({ token: null });
});
