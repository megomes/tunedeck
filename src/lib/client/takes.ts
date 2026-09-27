/**
 * Auto "+1" from the embedded player.
 *
 * A *take* is one run through the song. Only real playback counts: the playhead
 * must advance in small, natural steps (seeking forward adds nothing). Jumping
 * back — rewinding, or replaying after the end — starts a new take. A take
 * counts as a play once enough of it was actually played, so practising just
 * a part of the song still counts without reaching the end.
 */

export interface Take {
  /** Seconds of video actually played in this take. */
  watched: number;
  counted: boolean;
  /** Last sampled playhead position. */
  lastT: number | null;
}

export const newTake = (): Take => ({ watched: 0, counted: false, lastT: null });

/** Largest playhead step (s) still treated as normal playback between samples. */
const MAX_STEP = 2.5;
/** A backward jump bigger than this (s) starts a new take. */
const REWIND = 3;

/** Seconds of playing needed for a take to count: 40% of the song, between 30s and 90s. */
export function thresholdFor(duration: number | null | undefined): number {
  if (!duration || duration <= 0) return 60;
  const t = Math.min(90, Math.max(30, duration * 0.4));
  return Math.min(t, duration * 0.8); // very short clips still count
}

/** Feeds one playhead sample taken while the video is playing. */
export function sample(take: Take, t: number): { take: Take; restarted: boolean } {
  if (take.lastT == null) return { take: { ...take, lastT: t }, restarted: false };
  const d = t - take.lastT;
  if (d < -REWIND) return { take: { ...newTake(), lastT: t }, restarted: true };
  const watched = d > 0 && d <= MAX_STEP ? take.watched + d : take.watched;
  return { take: { ...take, watched, lastT: t }, restarted: false };
}
