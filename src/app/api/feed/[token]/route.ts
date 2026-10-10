import { NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/server/data";
import { buildFeed, checkFeedToken, feedToMarkdown } from "@/lib/server/feed";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/** Public, read-only repertoire for AI agents. The secret token in the path is the only credential. */
export async function GET(req: Request, ctx: RouteContext<"/api/feed/[token]">) {
  const { token } = await ctx.params;
  if (!(await checkFeedToken(token))) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }
  const feed = buildFeed(await loadSnapshot());
  const format = new URL(req.url).searchParams.get("format");
  if (format === "md" || format === "markdown") {
    return new NextResponse(feedToMarkdown(feed), {
      headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8" },
    });
  }
  return NextResponse.json(feed, { headers });
}
