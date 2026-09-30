// Pure helpers, also imported by scripts/media.ts (run by Node directly), so no path aliases here.

const NOTES: Record<string, number> = {
  c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11,
};

export interface Transpose {
  /** Semitones to shift the recording up so it matches the target tuning. */
  semitones: number;
  /** The tuning the shifted audio matches, e.g. "E Standard". */
  target: string;
}

/**
 * How far a recording in `tuning` must be pitched up to be played in standard
 * (or Drop D, for drop tunings). Null when it already is, or the tuning is unknown.
 */
export function transposeFor(tuning: string | null | undefined): Transpose | null {
  if (!tuning) return null;
  const t = tuning.trim().toLowerCase().replace(/♭/g, "b").replace(/♯/g, "#");
  if (/half[\s-]*step\s*down/.test(t)) return { semitones: 1, target: "E Standard" };
  if (/(whole|full)[\s-]*step\s*down/.test(t)) return { semitones: 2, target: "E Standard" };
  const m = t.match(/^(drop\s+)?([a-g](?:#|b)?)\s*(standard|std)?$/);
  if (!m || (!m[1] && !m[3])) return null;
  const note = NOTES[m[2]];
  if (note == null) return null;
  const drop = Boolean(m[1]);
  const home = drop ? NOTES.d : NOTES.e;
  // Tunings go down from standard, so B–D# are below E; anything above is a (rare) up-tuning.
  let diff = home - note;
  if (diff < -6) diff += 12;
  if (diff > 6) diff -= 12;
  if (diff === 0) return null;
  return { semitones: diff, target: drop ? "Drop D" : "E Standard" };
}

export function semitoneLabel(n: number) {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}
