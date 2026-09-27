/** Small music-theory helpers for jam backing tracks. */

export const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export const MODES = ["major", "minor", "blues", "dorian", "mixolydian", "phrygian", "lydian"] as const;
export type Mode = (typeof MODES)[number];

export const STYLES = [
  "Blues",
  "Rock",
  "Hard Rock",
  "Metal",
  "Funk",
  "Jazz",
  "Fusion",
  "Pop",
  "Ballad",
  "Soul",
  "Neo Soul",
  "R&B",
  "Reggae",
  "Country",
  "Latin",
  "Bossa Nova",
  "Lo-fi",
  "Punk",
  "Grunge",
  "Indie",
];

export const TIME_SIGNATURES = ["4/4", "3/4", "6/8", "12/8", "5/4", "7/8"];

const ENHARMONIC: Record<string, string> = { Db: "C#", "D#": "Eb", Gb: "F#", "G#": "Ab", "A#": "Bb", Cb: "B", "E#": "F", Fb: "E", "B#": "C" };

export function normalizeRoot(raw: string): string | null {
  const r = raw.trim().replace("♯", "#").replace("♭", "b");
  const m = r.match(/^([A-Ga-g])([#b]?)$/);
  if (!m) return null;
  const n = m[1].toUpperCase() + m[2];
  return ENHARMONIC[n] ?? n;
}

const MODE_ALIASES: [RegExp, Mode][] = [
  [/^(minor|min|m|moll)$/i, "minor"],
  [/^(major|maj|dur)$/i, "major"],
  [/^blues$/i, "blues"],
  [/^dorian$/i, "dorian"],
  [/^mixolydian$/i, "mixolydian"],
  [/^phrygian$/i, "phrygian"],
  [/^lydian$/i, "lydian"],
];

function normalizeMode(raw: string | undefined): Mode {
  if (!raw) return "major";
  return MODE_ALIASES.find(([re]) => re.test(raw.trim()))?.[1] ?? "major";
}

export function formatKey(root: string, mode: Mode) {
  return `${root} ${mode}`;
}

export function parseKey(key: string | null | undefined): { root: string; mode: Mode } | null {
  if (!key) return null;
  const m = key.match(/^([A-G][#b]?)\s*(\w+)?$/);
  if (!m) return null;
  const root = normalizeRoot(m[1]);
  return root ? { root, mode: normalizeMode(m[2]) } : null;
}

/** Short display: "Am", "E", "D dor". */
export function shortKey(key: string | null | undefined) {
  const k = parseKey(key);
  if (!k) return key ?? "";
  if (k.mode === "major") return k.root;
  if (k.mode === "minor") return `${k.root}m`;
  return `${k.root} ${k.mode.slice(0, 3)}`;
}

// Modes may be capitalised ("D Dorian", "A Blues"); a lone "m" must stay lowercase ("Am").
const MODE_WORDS = ["minor", "major", "min", "maj", "blues", "dorian", "mixolydian", "phrygian", "lydian"]
  .map((w) => `[${w[0]}${w[0].toUpperCase()}]${w.slice(1)}`)
  .concat("m")
  .join("|");

/**
 * Reads key, tempo, style and meter from typical backing-track titles, e.g.
 * "Slow Blues Backing Track in A minor | 70 BPM" or "Funky Groove Jam (Em) 100bpm".
 */
export function parseJamTitle(title: string | null | undefined): {
  musicalKey: string | null;
  bpm: number | null;
  style: string | null;
  timeSignature: string | null;
} {
  const t = (title ?? "").replace(/[♯]/g, "#").replace(/[♭]/g, "b");
  let musicalKey: string | null = null;

  const patterns = [
    // "in A minor", "key of E", "in F# Dorian"
    new RegExp(`\\b(?:in|key(?:\\s+of)?|key:)\\s+([A-G][#b]?)\\s*(${MODE_WORDS})?(?![a-z])`, "i"),
    // "(Am)", "[E minor]", "- D Dorian -"
    new RegExp(`(?:^|[\\s([|\\-–])([A-G][#b]?)\\s*(${MODE_WORDS})(?![a-z])`),
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const root = normalizeRoot(m[1]);
    if (!root) continue;
    // A bare capital letter needs "in"/"key" in front to count as a key.
    if (re === patterns[1] && !m[2]) continue;
    musicalKey = formatKey(root, normalizeMode(m[2]));
    break;
  }

  const bpmMatch = t.match(/(\d{2,3})\s*-?\s*bpm\b/i) ?? t.match(/\bbpm\s*:?\s*(\d{2,3})\b/i);
  const bpm = bpmMatch ? Number(bpmMatch[1]) : null;

  // The style named first in the title wins ("Smooth Jazz Ballad" → Jazz); longer names break ties ("Hard Rock").
  const lower = t.toLowerCase();
  const style =
    STYLES.map((s) => ({ s, i: lower.indexOf(s.toLowerCase()) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i || b.s.length - a.s.length)[0]?.s ??
    (/\bshuffle\b/i.test(t) ? "Blues" : /\bfunky\b/i.test(t) ? "Funk" : /\bjazzy\b/i.test(t) ? "Jazz" : null);

  const timeSignature = t.match(/\b(4\/4|3\/4|6\/8|12\/8|5\/4|7\/8)\b/)?.[1] ?? null;

  return { musicalKey, bpm: bpm && bpm >= 30 && bpm <= 300 ? bpm : null, style, timeSignature };
}

function transpose(root: string, semitones: number) {
  const i = ROOTS.indexOf(root as (typeof ROOTS)[number]);
  return i < 0 ? root : ROOTS[(i + semitones + 120) % 12];
}

/** What to play over a key: the first idea is the safest one. */
export function scaleSuggestions(key: string | null | undefined): string[] {
  const k = parseKey(key);
  if (!k) return [];
  const r = k.root;
  switch (k.mode) {
    case "minor":
      return [`${r} minor pentatonic`, `${r} blues`, `${r} natural minor`, `${r} dorian`];
    case "major":
      return [`${r} major pentatonic`, `${transpose(r, -3)} minor pentatonic`, `${r} major (ionian)`, `${r} mixolydian`];
    case "blues":
      return [`${r} blues`, `${r} minor pentatonic`, `${r} major pentatonic`, `${r} mixolydian`];
    case "dorian":
      return [`${r} dorian`, `${r} minor pentatonic`, `${r} blues`];
    case "mixolydian":
      return [`${r} mixolydian`, `${r} major pentatonic`, `${r} blues`];
    case "phrygian":
      return [`${r} phrygian`, `${r} minor pentatonic`, `${r} phrygian dominant`];
    case "lydian":
      return [`${r} lydian`, `${r} major pentatonic`, `${transpose(r, 7)} major`];
  }
}

export type Tempo = "slow" | "medium" | "fast";
export const TEMPO_LABEL: Record<Tempo, string> = { slow: "Slow < 90", medium: "Medium 90–130", fast: "Fast > 130" };

export function tempoOf(bpm: number | null | undefined): Tempo | null {
  if (!bpm) return null;
  return bpm < 90 ? "slow" : bpm <= 130 ? "medium" : "fast";
}
