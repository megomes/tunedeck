import "server-only";

// Finding YouTube videos for the Claude connector (no API key needed).

export interface VideoHit {
  id: string;
  url: string;
  title: string;
  channel: string | null;
  duration: string | null;
  views: number | null;
}

type Text = { simpleText?: string; runs?: { text: string }[] };
type Renderer = { videoId?: string; title?: Text; ownerText?: Text; lengthText?: Text; viewCountText?: Text };

const text = (t: Text | undefined) =>
  t?.simpleText ?? t?.runs?.map((r) => r.text).join("") ?? null;

/** YouTube search through the endpoint youtube.com itself uses; videos only. */
export async function searchYoutube(query: string, limit = 8): Promise<VideoHit[]> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: { "content-type": "application/json", "accept-language": "en" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20251101.00.00", hl: "en", gl: "US" } },
      query,
      params: "EgIQAQ%3D%3D", // type: video
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`YouTube search failed (HTTP ${res.status})`);
  const hits: VideoHit[] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object" || hits.length >= limit) return;
    const v = (o as { videoRenderer?: Renderer }).videoRenderer;
    if (v?.videoId) {
      const views = text(v.viewCountText)?.replace(/[^\d]/g, "");
      hits.push({
        id: v.videoId,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        title: text(v.title) ?? "",
        channel: text(v.ownerText),
        duration: text(v.lengthText),
        views: views ? Number(views) : null,
      });
      return;
    }
    for (const k in o) walk((o as Record<string, unknown>)[k]);
  };
  walk(await res.json());
  return hits;
}
