// Finds a song's Songsterr tab: the most viewed version whose artist and title match,
// plus the tuning of its most viewed guitar track. Used by the playlist sync (main.js)
// and by scripts/playlist-sync.mjs.

const key = (s) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bpt\b\.?/g, "part")
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

/** Songsterr's own URL shape: /a/wsa/<artist>-<title>-tab-s<id>, without a leading "The". */
const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// MIDI notes, high string first, as Songsterr lists them.
const STANDARD = [64, 59, 55, 50, 45, 40];
const STANDARD_NAMES = ["E Standard", "Eb Standard", "D Standard", "C# Standard", "C Standard", "B Standard"];
const DROP_NAMES = ["Drop D", "Drop C#", "Drop C", "Drop B"];

/** "E Standard", "Drop D"… for standard and drop tunings; null for anything else. */
function tuningName(notes) {
  if (!Array.isArray(notes) || notes.length !== 6) return null;
  const down = STANDARD[0] - notes[0];
  if (down < 0 || down >= STANDARD_NAMES.length) return null;
  if (!notes.slice(0, 5).every((n, i) => STANDARD[i] - n === down)) return null;
  const low = STANDARD[5] - notes[5];
  if (low === down) return STANDARD_NAMES[down];
  if (low === down + 2 && down < DROP_NAMES.length) return DROP_NAMES[down];
  return null;
}

const views = (song) => song.tracks.reduce((n, t) => n + (t.views ?? 0), 0);

/** { url, tuning } of the best matching tab, or null when Songsterr has no such song. */
async function findTab(title, artist) {
  const pattern = `${artist} ${title}`.trim();
  const res = await fetch(`https://www.songsterr.com/api/songs?size=20&pattern=${encodeURIComponent(pattern)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const want = key(title);
  const hits = (await res.json()).filter((s) => {
    const got = key(s.title);
    return key(s.artist) === key(artist) && got && (got === want || got.startsWith(want) || want.startsWith(got));
  });
  // An exact title beats variants like "Free Bird (Acoustic Ver 2)", whatever their views.
  const exact = hits.filter((s) => key(s.title) === want);
  const best = (exact.length ? exact : hits).sort((a, b) => views(b) - views(a))[0];
  if (!best) return null;
  const guitar = best.tracks.filter((t) => /guitar/i.test(t.instrument ?? "")).sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
  return {
    url: `https://www.songsterr.com/a/wsa/${slug(best.artist)}-${slug(best.title)}-tab-s${best.songId}`,
    tuning: tuningName(guitar?.tuning),
  };
}

/**
 * Looks up tabs for many songs, a few at a time. Failures just mean no tab.
 * Returns a Map from each item to its tab (only the ones found).
 */
async function findTabs(items, concurrency = 4) {
  const found = new Map();
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        const tab = await findTab(item.title, item.artist);
        if (tab) found.set(item, tab);
      } catch {
        /* Songsterr unreachable: no tab this time */
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return found;
}

module.exports = { findTab, findTabs, tuningName };
