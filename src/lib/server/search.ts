import "server-only";

// Finding things for the Claude connector: YouTube videos (no API key needed) and Songsterr tabs.

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

// ---------- Songsterr (same matching as desktop/songsterr.js) ----------

const key = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bpt\b\.?/g, "part")
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const STANDARD = [64, 59, 55, 50, 45, 40];
const STANDARD_NAMES = ["E Standard", "Eb Standard", "D Standard", "C# Standard", "C Standard", "B Standard"];
const DROP_NAMES = ["Drop D", "Drop C#", "Drop C", "Drop B"];

function tuningName(notes: unknown): string | null {
  if (!Array.isArray(notes) || notes.length !== 6) return null;
  const down = STANDARD[0] - notes[0];
  if (down < 0 || down >= STANDARD_NAMES.length) return null;
  if (!notes.slice(0, 5).every((n, i) => STANDARD[i] - n === down)) return null;
  const low = STANDARD[5] - notes[5];
  if (low === down) return STANDARD_NAMES[down];
  if (low === down + 2 && down < DROP_NAMES.length) return DROP_NAMES[down];
  return null;
}

interface SsTrack {
  instrument?: string;
  views?: number;
  tuning?: number[];
}
interface SsSong {
  songId: number;
  artist: string;
  title: string;
  tracks: SsTrack[];
}

export interface TabHit {
  url: string;
  title: string;
  artist: string;
  tuning: string | null;
}

const views = (s: SsSong) => s.tracks.reduce((n, t) => n + (t.views ?? 0), 0);

function toHit(s: SsSong): TabHit {
  const guitar = s.tracks
    .filter((t) => /guitar/i.test(t.instrument ?? ""))
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
  return {
    url: `https://www.songsterr.com/a/wsa/${slug(s.artist)}-${slug(s.title)}-tab-s${s.songId}`,
    title: s.title,
    artist: s.artist,
    tuning: tuningName(guitar?.tuning),
  };
}

/** The most viewed Songsterr tab whose artist and title match, or null. */
export async function findTab(title: string, artist: string): Promise<TabHit | null> {
  const res = await fetch(
    `https://www.songsterr.com/api/songs?size=20&pattern=${encodeURIComponent(`${artist} ${title}`.trim())}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return null;
  const want = key(title);
  const hits = ((await res.json()) as SsSong[]).filter((s) => {
    const got = key(s.title);
    return key(s.artist) === key(artist) && got && (got === want || got.startsWith(want) || want.startsWith(got));
  });
  const exact = hits.filter((s) => key(s.title) === want);
  const best = (exact.length ? exact : hits).sort((a, b) => views(b) - views(a))[0];
  return best ? toHit(best) : null;
}
