"use client";

import { Circle, LogOut, Plus, Repeat, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { clearRiffMark, createRiff, putRiffMark, setRiffMark } from "@/lib/client/actions";
import { useData } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";
import { RESOURCE_SHORT, riffColor, type Resource, type Riff, type RiffMark } from "@/lib/shared/types";
import type { Engine } from "./NativeVideo";
import { riffTime } from "./Riffs";

/** Taps land a bit late: shift marks back by a typical reaction time. */
const REACTION = 0.25;
const NUDGE = 0.5;
/** Two videos this close in length are taken as the same recording (e.g. original vs. standard tuning). */
const SAME_RECORDING = 1.5;

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
  reps,
}: {
  entryId: string;
  resource: Resource;
  riffId: string | null;
  setRiffId: (id: string | null) => void;
  engine: RefObject<Engine | null>;
  reps: number;
}) {
  const data = useData();
  const riffs = data.riffs.filter((r) => r.repertoireEntryId === entryId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const videos = data.resources.filter((r) => r.repertoireEntryId === entryId && r.provider === "youtube" && r.externalId);
  const [clock, setClock] = useState({ t: 0, d: 0 });
  /** Marking in progress: start is set, waiting for the end. riffId null = a new riff. */
  const [marking, setMarking] = useState<{ riffId: string | null; a: number } | null>(null);
  /** "Re-mark": the next tap starts marking this riff by hand. */
  const [armed, setArmed] = useState<string | null>(null);

  const selected = riffs.find((r) => r.id === riffId);
  const selMark = selected?.marks[resource.id];
  const looping = !!selected && selMark?.b != null;

  useEffect(() => {
    const id = setInterval(() => {
      const e = engine.current;
      if (e) setClock({ t: e.time(), d: e.duration() || resource.durationSeconds || 0 });
    }, 200);
    return () => clearInterval(id);
  }, [engine, resource.durationSeconds]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarking(null);
    setArmed(null);
  }, [resource.id]);

  const now = () => engine.current?.time() ?? 0;
  const seek = (t: number) => engine.current?.seek(t);

  /** Another video of the song where this riff is fully marked, preferring one of the same length. */
  const sourceFor = (r: Riff) => {
    const marked = videos.filter((v) => v.id !== resource.id && r.marks[v.id]?.b != null);
    const same = marked.find(
      (v) => v.durationSeconds && resource.durationSeconds && Math.abs(v.durationSeconds - resource.durationSeconds) <= SAME_RECORDING,
    );
    return { same, any: marked[0] };
  };

  // Switching to the same recording (e.g. the standard-tuning version): the riff is placed right away.
  const autoCopied = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || selMark) return;
    const key = `${selected.id}:${resource.id}`;
    if (autoCopied.current === key) return;
    const { same } = sourceFor(selected);
    if (!same) return;
    autoCopied.current = key;
    const m = selected.marks[same.id];
    putRiffMark(selected.id, resource.id, m);
    seek(m.a);
    toast(`Same length as ${label(same)}: copied its timing`, {
      label: "Mark by hand",
      run: () => {
        clearRiffMark(selected.id, resource.id);
        setArmed(selected.id);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, resource.id, !!selMark]);

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
      const { any } = sourceFor(selected);
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
  const pendingSource = selected && !selMark ? sourceFor(selected).any : undefined;

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
    mainHint = riffs.length ? null : "Tap where the riff starts, then where it ends. It loops right away";
  }

  const d = clock.d || 1;
  const pct = (sec: number) => `${Math.min(100, Math.max(0, (sec / d) * 100))}%`;

  return (
    <div className="riffbar">
      <div
        className="riff-timeline"
        role="slider"
        aria-label="Riffs in this video"
        aria-valuemin={0}
        aria-valuemax={Math.round(d)}
        aria-valuenow={Math.round(clock.t)}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          // Jumping elsewhere means leaving the loop.
          setRiffId(null);
          seek(((e.clientX - rect.left) / rect.width) * d);
        }}
      >
        {riffs.map((r) => {
          const m = r.marks[resource.id];
          if (!m) return null;
          const on = r.id === riffId;
          return (
            <button
              key={r.id}
              className={`rt-seg ${on ? "on" : ""}`}
              style={{ left: pct(m.a), width: m.b != null ? `max(10px, ${pct(m.b - m.a)})` : "4px", background: riffColor(r) }}
              aria-label={`${r.name} ${riffTime(m.a)}`}
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
        <button className={`riff-main ${marking ? "recording" : ""}`} onClick={main}>
          {marking ? <Square fill="currentColor" /> : looping ? <LogOut /> : <Circle fill="currentColor" />}
          <span className="truncate">{mainLabel}</span>
        </button>
        {looping && (
          <div className="riff-reps" aria-label={`${reps} loops`}>
            <strong>×{reps}</strong>
            <span>loops</span>
          </div>
        )}
      </div>
      {mainHint && <p className="meta riff-hint">{mainHint}</p>}

      {looping && selected && selMark && (
        <div className="riff-adjust" style={{ ["--rc" as string]: riffColor(selected) }}>
          <span className="riff-adjust-name truncate">
            <i /> {selected.name} · {riffTime(selMark.a)}–{riffTime(selMark.b!)}
          </span>
          {/* Zoomed in on the loop: where the playhead is inside the riff. */}
          <span className="riff-progress" aria-hidden>
            <i style={{ width: `${Math.min(100, Math.max(0, ((clock.t - selMark.a) / Math.max(0.1, selMark.b! - selMark.a)) * 100))}%` }} />
          </span>
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
        </div>
      )}
    </div>
  );
}
