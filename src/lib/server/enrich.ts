import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isSongsterr, youtubeId, ytThumb, ytWatchUrl } from "@/lib/shared/urls";

export interface YoutubeMeta {
  provider: "youtube";
  externalId: string;
  url: string;
  title: string | null;
  author: string | null;
  thumbnailUrl: string;
  durationSeconds: number | null;
}

export interface SongsterrMeta {
  provider: "songsterr";
  url: string;
  title: string | null;
  artist: string | null;
}

export type Meta = YoutubeMeta | SongsterrMeta;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

async function fetchWithTimeout(url: string, ms = 6000, init?: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, ...init?.headers } });
  } finally {
    clearTimeout(timer);
  }
}

async function cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  const d = db();
  const [hit] = await d.select().from(schema.mediaCache).where(eq(schema.mediaCache.key, key)).limit(1);
  if (hit) return hit.data as T;
  const data = await load();
  if (data) {
    await d
      .insert(schema.mediaCache)
      .values({ key, data })
      .onConflictDoUpdate({ target: schema.mediaCache.key, set: { data, fetchedAt: new Date().toISOString() } });
  }
  return data;
}

function parseIsoDuration(iso: string | undefined): number | null {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

async function youtubeViaApi(id: string, key: string): Promise<YoutubeMeta | null> {
  const res = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${id}&key=${key}`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  const item = json.items?.[0];
  if (!item) return null;
  const th = item.snippet?.thumbnails ?? {};
  return {
    provider: "youtube",
    externalId: id,
    url: ytWatchUrl(id),
    title: item.snippet?.title ?? null,
    author: item.snippet?.channelTitle ?? null,
    thumbnailUrl: (th.high ?? th.medium ?? th.default)?.url ?? ytThumb(id),
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
  };
}

async function youtubeViaOembed(id: string): Promise<YoutubeMeta | null> {
  const res = await fetchWithTimeout(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(ytWatchUrl(id))}`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  let durationSeconds: number | null = null;
  // Without an API key, the watch page still exposes the length; best-effort only.
  try {
    const page = await fetchWithTimeout(ytWatchUrl(id), 5000, { headers: { "Accept-Language": "en" } });
    const m = (await page.text()).match(/"lengthSeconds":"(\d+)"/);
    if (m) durationSeconds = Number(m[1]);
  } catch {
    /* duration is optional */
  }
  return {
    provider: "youtube",
    externalId: id,
    url: ytWatchUrl(id),
    title: json.title ?? null,
    author: json.author_name ?? null,
    thumbnailUrl: ytThumb(id),
    durationSeconds,
  };
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Songsterr page titles look like "Numb Tab by Linkin Park | Songsterr Tabs with Rhythm". */
export function parseSongsterrTitle(raw: string): { title: string; artist: string } | null {
  const t = decodeEntities(raw).replace(/\s*\|.*$/, "").trim();
  let m = t.match(/^(.*?)\s+(?:Guitar\s+|Bass\s+|Drum\s+)?(?:Tabs?|Chords)\s+by\s+(.+)$/i);
  if (m) return { title: m[1].trim(), artist: m[2].trim() };
  m = t.match(/^(.+?)\s+[-–]\s+(.+?)\s+(?:Guitar\s+|Bass\s+|Drum\s+)?(?:Tabs?|Chords)$/i);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return null;
}

async function songsterr(url: string): Promise<SongsterrMeta | null> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const html = await res.text();
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const parsed = (og && parseSongsterrTitle(og)) || (title && parseSongsterrTitle(title)) || null;
  return { provider: "songsterr", url, title: parsed?.title ?? null, artist: parsed?.artist ?? null };
}

export async function enrichUrl(url: string): Promise<Meta | null> {
  const id = youtubeId(url);
  if (id) {
    return cached<YoutubeMeta>(`yt:${id}`, async () => {
      const key = process.env.YOUTUBE_API_KEY;
      return (key ? await youtubeViaApi(id, key) : null) ?? (await youtubeViaOembed(id));
    });
  }
  if (isSongsterr(url)) {
    const clean = url.split("#")[0];
    return cached<SongsterrMeta>(`ss:${clean}`, () => songsterr(clean));
  }
  return null;
}
