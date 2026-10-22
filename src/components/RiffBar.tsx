"use client";

import { Circle, LogOut, Pause, Pencil, Play, Plus, Repeat, RotateCcw, SkipBack, Square } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createRiff, placeSameRecording, putRiffMark, setRiffMark } from "@/lib/client/actions";
import { useData } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";
import { RESOURCE_SHORT, riffColor, type Resource, type Riff, type RiffMark } from "@/lib/shared/types";
import { contextMenu } from "./ContextMenu";
import type { Engine } from "./NativeVideo";
import { riffMenu } from "./RiffMenu";
import { RiffNamePicker, RiffStatusSelect, riffTime } from "./Riffs";

/** Taps land a bit late: shift marks back by a typical reaction time. */
const REACTION = 0.25;
const NUDGE = 0.5;

const label = (r: Resource) => r.customLabel || RESOURCE_SHORT[r.type];

/**
 * Riffs in the expanded player, built for hands on the guitar: one big button marks
 * (tap at the start, tap at the end, it loops), a colored timeline shows every riff of
 * this video, and a riff marked in one video is placed in the next one with one tap.
 */
export function RiffBar({
  entryId,
  resource,
  riffId,
  setRiffId,
  engine,
  seek,
  reps,
}: {
  entryId: string;
  resource: Resource;
  riffId: string | null;
  setRiffId: (id: string | null) => void;
  engine: RefObject<Engine | null>;
  /** Seek that the loop does not mistake for the user leaving the riff. */
  seek: (t: number) => void;
  reps: number;
}) {
  const data = useData();
  const riffs = data.riffs.filter((r) => r.repertoireEntryId === entryId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const videos = data.resources.filter((r) => r.repertoireEntryId === entryId && r.provider === "youtube" && r.externalId);
  const [clock, setClock] = useState({ t: 0, d: 0, playing: false });
  /** Marking in progress: start is set, waiting for the end. riffId null = a new riff. */
  const [marking, setMarking] = useState<{ riffId: string | null; a: number } | null>(null);
  const drag = useRef<{ x: number; moved: boolean; at: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  /** Ends of the selected riff while a handle is being dragged (saved on release). */
  const [edit, setEdit] = useState<{ a: number; b: number } | null>(null);
  /** Riff whose name picker is open (opens by itself right after a new riff is marked). */
  const [namingId, setNamingId] = useState<string | null>(null);
  /** "Re-mark": the next tap starts marking this riff by hand. */
  const [armed, setArmed] = useState<string | null>(null);

  const selected = riffs.find((r) => r.id === riffId);
  const selMark = selected?.marks[resource.id];
  const looping = !!selected && selMark?.b != null;
  const naming = !!selected && namingId === selected.id;

  useEffect(() => {
    const id = setInterval(() => {
      const e = engine.current;
      if (e) setClock({ t: e.time(), d: e.duration() || resource.durationSeconds || 0, playing: e.playing() });
    }, 200);
    return () => clearInterval(id);
  }, [engine, resource.durationSeconds]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarking(null);
    setArmed(null);
  }, [resource.id]);

  const now = () => engine.current?.time() ?? 0;
  /** Back to the start of the looping riff, playing. */
  const restart = () => {
    if (!selMark) return;
    seek(selMark.a);
    engine.current?.play();
  };

  const togglePlay = () => {
    const e = engine.current;
    if (!e) return;
    if (e.playing()) e.pause();
    else e.play();
    setClock((c) => ({ ...c, playing: !c.playing }));
  };

  /** Another video of the song where this riff is fully marked. */
  const sourceFor = (r: Riff) => videos.find((v) => v.id !== resource.id && r.marks[v.id]?.b != null);

  // Picking a riff that is not marked in this video but is in one of the same length: copy it.
  // (Switching videos does this before loading, so the new video opens on the riff.)
  useEffect(() => {
    if (!selected || selMark) return;
    const m = placeSameRecording(selected.id, resource.id);
    if (m) seek(m.a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const startLoop = (id: string, m: RiffMark) => {
    setRiffId(id);
    seek(m.a);
  };

  /** The one big button. */
  const main = () => {
    const t = Math.max(0, now() - REACTION);
    if (marking) {
      if (t <= marking.a + 0.3) return toast("Tap again when the riff ends");
      const mark = { a: marking.a, b: t };
      const id = marking.riffId ?? createRiff(entryId, undefined, { resourceId: resource.id, mark });
      if (marking.riffId) putRiffMark(id, resource.id, mark);
      else setNamingId(id);
      setMarking(null);
      startLoop(id, mark);
      return;
    }
    if (looping) {
      // Leave the loop first: a new riff's start lies outside it.
      setRiffId(null);
      return;
    }
    if (armed) {
      setMarking({ riffId: armed, a: t });
      setArmed(null);
      return;
    }
    if (selected && !selMark) {
      const any = sourceFor(selected);
      if (any) {
        // One tap: the end comes from how long the riff is in the other video.
        const m = selected.marks[any.id];
        const mark = { a: t, b: t + (m.b! - m.a) };
        putRiffMark(selected.id, resource.id, mark);
        startLoop(selected.id, mark);
        toast(`End set from its length in ${label(any)}. Nudge it if needed`);
        return;
      }
      setMarking({ riffId: selected.id, a: t });
      return;
    }
    // A new riff: stop any loop so playback can run to its end.
    setRiffId(null);
    setMarking({ riffId: null, a: t });
  };

  const mainRef = useRef(main);
  useEffect(() => {
    mainRef.current = main;
  });
  // "M" on a keyboard or a pedal that sends keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        mainRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tapChip = (r: Riff) => {
    setArmed(null);
    if (marking) setMarking(null);
    const m = r.marks[resource.id];
    if (riffId === r.id) return setRiffId(null);
    if (m?.b != null) startLoop(r.id, m);
    else setRiffId(r.id);
  };

  const markingRiff = marking?.riffId ? riffs.find((r) => r.id === marking.riffId) : null;
  const armedRiff = armed ? riffs.find((r) => r.id === armed) : null;
  const pendingSource = selected && !selMark ? sourceFor(selected) : undefined;

  let mainLabel: string;
  let mainHint: string | null = null;
  if (marking) {
    mainLabel = `End ${markingRiff?.name ?? "riff"}`;
    mainHint = `+${Math.max(0, clock.t - marking.a).toFixed(1)}s · tap when the riff ends`;
  } else if (looping && selected) {
    mainLabel = "Leave loop";
    mainHint = "Keeps playing from here, then mark the next riff";
  } else if (armedRiff) {
    mainLabel = `Start ${armedRiff.name}`;
    mainHint = "Tap where it starts, then where it ends";
  } else if (selected && !selMark) {
    mainLabel = `Mark ${selected.name} here`;
    mainHint = pendingSource ? `One tap at its start: the end comes from ${label(pendingSource)}` : "Tap where it starts, then where it ends";
  } else {
    mainLabel = "Mark a riff";
    mainHint = null;
  }

  const d = clock.d || 1;
  const pct = (sec: number) => `${Math.min(100, Math.max(0, (sec / d) * 100))}%`;

  // The selected riff's ends as shown: live while a handle is dragged.
  const range = edit ?? (selMark?.b != null ? { a: selMark.a, b: selMark.b } : null);
  // Zoomed ruler around the selected riff; fixed during a drag (it follows the saved mark).
  const pad = selMark?.b != null ? Math.max(1.5, (selMark.b - selMark.a) * 0.5) : 0;
  const zoom = selMark?.b != null ? { lo: Math.max(0, selMark.a - pad), hi: Math.min(d, selMark.b + pad) } : null;
  const zpct = (sec: number) => (zoom ? `${Math.min(100, Math.max(0, ((sec - zoom.lo) / (zoom.hi - zoom.lo || 1)) * 100))}%` : "0%");

  /** Drag a start/end handle on the timeline or on the zoomed ruler. */
  const startDrag = (e: React.PointerEvent, edge: "a" | "b", ruler: "timeline" | "zoom") => {
    if (!selected || selMark?.b == null) return;
    const box = (ruler === "zoom" ? zoomRef : timelineRef).current?.getBoundingClientRect();
    if (!box) return;
    const lo = ruler === "zoom" && zoom ? zoom.lo : 0;
    const span = ruler === "zoom" && zoom ? zoom.hi - zoom.lo : d;
    const toTime = (x: number) => lo + ((x - box.left) / box.width) * span;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const id = selected.id;
    let cur = { a: selMark.a, b: selMark.b };
    const move = (ev: PointerEvent) => {
      const t = Math.round(toTime(ev.clientX) * 10) / 10;
      cur = edge === "a" ? { a: Math.min(Math.max(0, t), cur.b - 0.3), b: cur.b } : { a: cur.a, b: Math.max(Math.min(d, t), cur.a + 0.3) };
      setEdit(cur);
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      putRiffMark(id, resource.id, cur);
      setEdit(null);
      // Hear the change: from the new start, or the last moments before the new end.
      seek(edge === "a" ? cur.a : Math.max(cur.a, cur.b - 1.5));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };


  return (
    <div className="riffbar">
      <div
        ref={timelineRef}
        className="riff-timeline"
        role="slider"
        aria-label="Riffs in this video"
        aria-valuemin={0}
        aria-valuemax={Math.round(d)}
        aria-valuenow={Math.round(clock.t)}
        onClick={(e) => {
          if (drag.current?.moved) return;
          const rect = e.currentTarget.getBoundingClientRect();
          // Jumping elsewhere means leaving the loop.
          setRiffId(null);
          engine.current?.seek(((e.clientX - rect.left) / rect.width) * d);
        }}
        // Drag to scrub. Pointer capture starts only once it is a drag, so taps still reach the riff segments.
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, moved: false, at: 0 };
        }}
        onPointerMove={(e) => {
          const g = drag.current;
          if (!g) return;
          if (!g.moved) {
            if (Math.abs(e.clientX - g.x) < 6) return;
            g.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          const now = performance.now();
          if (now - g.at < 80) return;
          g.at = now;
          const rect = e.currentTarget.getBoundingClientRect();
          engine.current?.seek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * d);
        }}
        onPointerUp={() => {
          // Let the click that follows a drag see it, then forget it.
          setTimeout(() => (drag.current = null), 0);
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        {riffs.map((r) => {
          const saved = r.marks[resource.id];
          if (!saved) return null;
          const on = r.id === riffId;
          const m = on && range ? range : saved;
          return (
            <button
              key={r.id}
              className={`rt-seg ${on ? "on" : ""}`}
              style={{ left: pct(m.a), width: m.b != null ? `max(10px, ${pct(m.b - m.a)})` : "4px", background: riffColor(r) }}
              aria-label={`${r.name} ${riffTime(m.a)}`}
              onContextMenu={contextMenu(() => riffMenu(r.id, { resourceId: resource.id }))}
              onClick={(e) => {
                e.stopPropagation();
                tapChip(r);
              }}
            >
              <span className="truncate">{r.name}</span>
            </button>
          );
        })}
        {marking && (
          <span
            className="rt-seg marking"
            style={{
              left: pct(marking.a),
              width: pct(Math.max(0, clock.t - marking.a)),
              background: markingRiff ? riffColor(markingRiff) : "var(--accent)",
            }}
          />
        )}
        <span className="rt-head" style={{ left: pct(clock.t) }} />
        {range && selected && (
          <>
            <span className="rt-handle" style={{ left: pct(range.a) }} aria-label="Drag the start" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => startDrag(e, "a", "timeline")} />
            <span className="rt-handle" style={{ left: pct(range.b) }} aria-label="Drag the end" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => startDrag(e, "b", "timeline")} />
          </>
        )}
      </div>

      {riffs.length > 0 && (
        <div className="riff-chips">
          {riffs.map((r) => {
            const m = r.marks[resource.id];
            const on = r.id === riffId;
            return (
              <button
                key={r.id}
                className={`riff-chip ${on ? "on" : ""} ${m ? "" : "unmarked"}`}
                style={{ ["--rc" as string]: riffColor(r) }}
                aria-pressed={on}
                onClick={() => tapChip(r)}
                onContextMenu={contextMenu(() => riffMenu(r.id, { resourceId: resource.id }))}
              >
                <i />
                <span className="truncate">{r.name}</span>
                {on && m?.b != null ? <Repeat /> : !m ? <Plus /> : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="riff-main-row">
        <button className="riff-play" aria-label={clock.playing ? "Pause" : "Play"} onClick={togglePlay}>
          {clock.playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
        <button className="riff-play" aria-label="Back to the start of the riff" disabled={!looping} onClick={restart}>
          <SkipBack fill="currentColor" />
        </button>
        <button className={`riff-main ${marking ? "recording" : ""}`} onClick={main}>
          {marking ? <Square fill="currentColor" /> : looping ? <LogOut /> : <Circle fill="currentColor" />}
          <span className="truncate">{mainLabel}</span>
        </button>
      </div>
      {mainHint ? <p className="meta riff-hint">{mainHint}</p> : <Shortcuts />}

      {selected && (
        <div className="riff-adjust" style={{ ["--rc" as string]: riffColor(selected) }}>
          <div className="riff-adjust-head">
            <button className="riff-adjust-name truncate" title="Rename" onClick={() => setNamingId(naming ? null : selected.id)}>
              <i /> {selected.name}
              <Pencil className="riff-rename" />
            </button>
            <RiffStatusSelect r={selected} />
            {looping && (
              <span className="riff-reps" aria-label={`${reps} loops`}>
                ×{reps}
              </span>
            )}
          </div>
          {naming && <RiffNamePicker r={selected} onDone={() => setNamingId(null)} />}
          {looping && selMark && range && zoom && (
            <>
              {/* Zoomed ruler around the riff: drag its ends precisely, see the playhead inside it. */}
              <div
                ref={zoomRef}
                className="riff-zoom"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  engine.current?.seek(zoom.lo + ((e.clientX - r.left) / r.width) * (zoom.hi - zoom.lo));
                }}
              >
                <span className="rz-range" style={{ left: zpct(range.a), width: `calc(${zpct(range.b)} - ${zpct(range.a)})` }} />
                <span className="rt-head" style={{ left: zpct(clock.t) }} />
                <span className="rz-handle" style={{ left: zpct(range.a) }} aria-label="Drag the start" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => startDrag(e, "a", "zoom")}>
                  <b>{riffTime(range.a)}</b>
                </span>
                <span className="rz-handle end" style={{ left: zpct(range.b) }} aria-label="Drag the end" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => startDrag(e, "b", "zoom")}>
                  <b>{riffTime(range.b)}</b>
                </span>
              </div>
              <div className="riff-adjust-row">
                <span className="meta">Start</span>
                <button className="chip" aria-label="Start earlier" onClick={() => setRiffMark(selected.id, resource.id, "a", selMark.a - NUDGE)}>
                  −
                </button>
                <button className="chip" aria-label="Start later" onClick={() => setRiffMark(selected.id, resource.id, "a", selMark.a + NUDGE)}>
                  +
                </button>
                <span className="meta">End</span>
                <button className="chip" aria-label="End earlier" onClick={() => setRiffMark(selected.id, resource.id, "b", selMark.b! - NUDGE)}>
                  −
                </button>
                <button className="chip" aria-label="End later" onClick={() => setRiffMark(selected.id, resource.id, "b", selMark.b! + NUDGE)}>
                  +
                </button>
                <button
                  className="chip"
                  onClick={() => {
                    setRiffId(null);
                    setArmed(selected.id);
                  }}
                >
                  <RotateCcw /> Re-mark
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["Space", "K"], "play / pause"],
  [["J", "L"], "∓10s"],
  [["←", "→"], "∓5s"],
  [[",", "."], "∓1s"],
  [["<", ">"], "speed"],
  [["0–9"], "jump to 0–90%"],
  [["M"], "mark a riff"],
  [["R"], "riff start"],
  [["Esc"], "minimize"],
];

/** The player's keyboard shortcuts (hidden on touch-only screens). */
function Shortcuts() {
  return (
    <p className="meta riff-keys" aria-label="Keyboard shortcuts">
      {SHORTCUTS.map(([keys, what]) => (
        <span key={what}>
          {keys.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}{" "}
          {what}
        </span>
      ))}
    </p>
  );
}
