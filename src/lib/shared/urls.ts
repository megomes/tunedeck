import type { Provider } from "./types";

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  if (m) return m[0].replace(/[),.;]+$/, "");
  const bare = text.trim();
  if (/^(www\.|m\.|music\.)?(youtube\.com|youtu\.be|songsterr\.com)\//i.test(bare)) return `https://${bare}`;
  return null;
}

export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export function isSongsterr(url: string): boolean {
  try {
    return /(^|\.)songsterr\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function detectProvider(url: string): Provider {
  if (youtubeId(url)) return "youtube";
  if (isSongsterr(url)) return "songsterr";
  return "external";
}

export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const ytWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function normalizeUrl(url: string): string {
  const id = youtubeId(url);
  if (id) {
    // Keep a start time if the user shared one — useful for "solo only" links.
    try {
      const t = new URL(url).searchParams.get("t");
      return t ? `${ytWatchUrl(id)}&t=${t}` : ytWatchUrl(id);
    } catch {
      return ytWatchUrl(id);
    }
  }
  return url.trim();
}

export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const NOISE =
  /\s*[([【][^)\]】]*(official|video|audio|lyric|lyrics|hd|hq|4k|remaster|remastered|visualizer|live|cover|lesson|tutorial|backing|track|tab|guitar|bass|full|version|clip|mv)[^)\]】]*[)\]】]/gi;

/** Best-effort "Artist - Title (Official Video)" parsing for prefilling a new song. */
export function guessSongFromVideo(title: string | null, channel: string | null): { title: string; artist: string } {
  const cleanChannel = (channel ?? "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
  if (!title) return { title: "", artist: cleanChannel };
  let t = title.replace(NOISE, "").replace(/\s*[([][^)\]]*[)\]]\s*$/g, "");
  t = t.replace(/\s*\|.*$/, "").replace(/\s+(ft\.?|feat\.?)\s.*$/i, "").trim();
  const parts = t.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    const left = parts[0].trim();
    const right = parts.slice(1).join(" - ").trim();
    const ch = normalizeKey(cleanChannel);
    // Most videos are "Artist - Title", but official channels often use "Title – Artist".
    const rightIsArtist = ch && normalizeKey(right) === ch && normalizeKey(left) !== ch;
    const [artist, songTitle] = rightIsArtist ? [right, left] : [left, right];
    return { artist, title: songTitle.replace(/["“”]/g, "").trim() };
  }
  return { title: t.replace(/["“”]/g, "").trim(), artist: cleanChannel };
}

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}
