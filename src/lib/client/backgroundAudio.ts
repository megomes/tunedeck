"use client";

// Phones pause a <video> when the screen locks, but let an <audio> keep playing. The radio plays
// saved songs through this one shared <audio> (the video only follows it on screen), so the music
// goes on in the pocket or with the screen off. One element for every song: the browser lets an
// element that already played start the next song on its own, even with the screen locked.

let audio: HTMLAudioElement | null = null;
let owner: symbol | null = null;

export function sharedAudio() {
  audio ??= Object.assign(new Audio(), { preload: "auto" });
  return audio;
}

/** A tiny silent WAV, to unlock the element inside a tap. */
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let unlocked = false;

/** Call from a tap (starting the radio): later songs can then start without one. */
export function unlockAudio() {
  if (unlocked || typeof window === "undefined") return;
  const a = sharedAudio();
  if (a.src) return;
  unlocked = true;
  a.src = SILENCE;
  a.play()
    .then(() => {
      if (a.src === SILENCE) a.pause();
    })
    .catch(() => (unlocked = false));
}

/** A player takes the element over. */
export function claimAudio(token: symbol) {
  owner = token;
}

/** A player lets go: stop, and empty the element unless the next song's player claimed it. */
export function releaseAudio(token: symbol) {
  if (owner !== token || !audio) return;
  audio.pause();
  queueMicrotask(() => {
    if (owner !== token || !audio) return;
    owner = null;
    audio.removeAttribute("src");
    audio.load();
  });
}
