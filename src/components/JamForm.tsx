"use client";

import { Hand, Link2, Minus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createJam, deleteJam, deleteJamPlay, updateJam } from "@/lib/client/actions";
import { dateTime, duration } from "@/lib/client/format";
import { fetchMeta, useData } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";
import { MODES, ROOTS, STYLES, TIME_SIGNATURES, formatKey, parseJamTitle, parseKey, type Mode } from "@/lib/shared/music";
import type { JamTrack } from "@/lib/shared/types";
import { extractFirstUrl, youtubeId, ytThumb } from "@/lib/shared/urls";
import { Thumb } from "./Thumb";

interface Meta {
  title: string | null;
  author?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
}

/** Tap along with the beat; the average of the last taps becomes the BPM. */
function TapTempo({ onBpm }: { onBpm: (bpm: number) => void }) {
  const taps = useRef<number[]>([]);
  const [count, setCount] = useState(0);
  return (
    <button
      type="button"
      className="btn btn-surface btn-sm tap-tempo"
      onClick={() => {
        const now = performance.now();
        const last = taps.current[taps.current.length - 1];
        if (last && now - last > 2000) taps.current = [];
        taps.current = [...taps.current, now].slice(-8);
        setCount(taps.current.length);
        if (taps.current.length >= 3) {
          const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
          const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
          onBpm(Math.round(60000 / avg));
        }
      }}
    >
      <Hand /> Tap tempo{count > 0 && count < 3 ? ` (${3 - count} more)` : ""}
    </button>
  );
}

export function JamForm({ track, initialUrl }: { track?: JamTrack; initialUrl?: string | null }) {
  const router = useRouter();
  const data = useData();
  const editing = Boolean(track);

  const [urlText, setUrlText] = useState(track?.url ?? initialUrl ?? "");
  const url = extractFirstUrl(urlText);
  const videoId = url ? youtubeId(url) : null;
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(editing);

  const k = parseKey(track?.musicalKey);
  const [title, setTitle] = useState(track?.title ?? "");
  const [root, setRoot] = useState<string | null>(k?.root ?? null);
  const [mode, setMode] = useState<Mode>(k?.mode ?? "minor");
  const [bpm, setBpm] = useState<number | null>(track?.bpm ?? null);
  const [style, setStyle] = useState<string>(track?.style ?? "");
  const [timeSignature, setTimeSignature] = useState<string | null>(track?.timeSignature ?? "4/4");
  const [notes, setNotes] = useState(track?.notes ?? "");

  // Fetch video details and read key/tempo/style from the title (never blocks saving).
  useEffect(() => {
    if (editing || !url || !videoId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchMeta(url)
      .then((m: Meta | null) => {
        if (cancelled || !m) return;
        setMeta(m);
        if (touched) return;
        const p = parseJamTitle(m.title);
        setTitle(m.title ?? "");
        const pk = parseKey(p.musicalKey);
        if (pk) {
          setRoot(pk.root);
          setMode(pk.mode);
        }
        if (p.bpm) setBpm(p.bpm);
        if (p.style) setStyle(p.style);
        if (p.timeSignature) setTimeSignature(p.timeSignature);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const styles = Array.from(new Set([...STYLES, ...data.jamTracks.map((t) => t.style).filter((s): s is string => !!s)]));
  const canSave = Boolean(url) && (title.trim() || meta?.title);
  const plays = track ? data.jamPlays.filter((p) => p.trackId === track.id).sort((a, b) => b.playedAt.localeCompare(a.playedAt)) : [];

  function save() {
    if (!url) return;
    const fields = {
      title: title.trim() || meta?.title || url,
      musicalKey: root ? formatKey(root, mode) : null,
      bpm,
      style: style.trim() || null,
      timeSignature,
      notes: notes.trim() || null,
    };
    if (track) {
      updateJam(track.id, { ...fields, url });
      toast("Saved");
      router.back();
    } else {
      createJam({
        url,
        ...fields,
        author: meta?.author ?? null,
        thumbnailUrl: meta?.thumbnailUrl ?? null,
        durationSeconds: meta?.durationSeconds ?? null,
      });
      toast("Backing track added");
      router.replace("/jam");
    }
  }

  const touch = () => setTouched(true);

  return (
    <div className="form-grid mt-2" style={{ gap: 20 }}>
      <div className="paste-box">
        <Link2 />
        <input
          placeholder="Paste the YouTube backing track link"
          value={urlText}
          inputMode="url"
          autoFocus={!editing && !initialUrl}
          onChange={(e) => setUrlText(e.target.value)}
        />
      </div>

      {videoId && (
        <div className="preview">
          <Thumb src={meta?.thumbnailUrl ?? track?.thumbnailUrl ?? ytThumb(videoId)} title={title || "Backing track"}>
            {(meta?.durationSeconds ?? track?.durationSeconds) != null && (
              <div className="thumb-overlay" style={{ justifyContent: "flex-end" }}>
                <span className="badge">{duration(meta?.durationSeconds ?? track?.durationSeconds)}</span>
              </div>
            )}
          </Thumb>
          <div className="row-main">
            {loading ? (
              <>
                <span className="skeleton-line" style={{ width: "90%" }} />
                <span className="skeleton-line mt-2" style={{ width: "50%" }} />
              </>
            ) : (
              <>
                <span className="meta">{meta?.author ?? track?.author ?? "YouTube"}</span>
                {!editing && meta?.title && <span className="hint">Key, tempo and style were read from the title — check them below.</span>}
              </>
            )}
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="j-title">Name</label>
        <input
          id="j-title"
          className="input"
          value={title}
          placeholder={loading ? "Reading video…" : "Slow blues in A"}
          onChange={(e) => {
            touch();
            setTitle(e.target.value);
          }}
        />
      </div>

      <div className="field">
        <span className="label">Key</span>
        <div className="key-grid">
          {ROOTS.map((r) => (
            <button
              type="button"
              key={r}
              className={`key-btn ${root === r ? "active" : ""}`}
              onClick={() => {
                touch();
                setRoot(root === r ? null : r);
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {MODES.map((m) => (
            <button
              type="button"
              key={m}
              className={`chip sm ${mode === m ? "active" : ""}`}
              onClick={() => {
                touch();
                setMode(m);
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Tempo</span>
        <div className="row-gap" style={{ flexWrap: "wrap" }}>
          <div className="bpm-input">
            <button type="button" className="icon-btn sm" aria-label="Slower" onClick={() => setBpm((b) => Math.max(30, (b ?? 100) - 1))}>
              <Minus />
            </button>
            <input
              inputMode="numeric"
              value={bpm ?? ""}
              placeholder="—"
              onChange={(e) => {
                touch();
                const n = parseInt(e.target.value, 10);
                setBpm(Number.isFinite(n) ? Math.min(300, n) : null);
              }}
            />
            <span className="meta">BPM</span>
            <button type="button" className="icon-btn sm" aria-label="Faster" onClick={() => setBpm((b) => Math.min(300, (b ?? 100) + 1))}>
              <Plus />
            </button>
          </div>
          <TapTempo
            onBpm={(b) => {
              touch();
              setBpm(b);
            }}
          />
        </div>
      </div>

      <div className="field">
        <span className="label">Style</span>
        <div className="segmented">
          {styles.map((s) => (
            <button
              type="button"
              key={s}
              className={`chip sm ${style === s ? "active" : ""}`}
              onClick={() => {
                touch();
                setStyle(style === s ? "" : s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ height: 40, borderRadius: 999 }}
          placeholder="Or type a style"
          value={styles.includes(style) ? "" : style}
          onChange={(e) => {
            touch();
            setStyle(e.target.value);
          }}
        />
      </div>

      <div className="field">
        <span className="label">Time signature</span>
        <div className="segmented">
          {TIME_SIGNATURES.map((t) => (
            <button type="button" key={t} className={`chip sm ${timeSignature === t ? "active" : ""}`} onClick={() => setTimeSignature(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="j-notes">Notes</label>
        <textarea
          id="j-notes"
          className="textarea"
          placeholder="Chord progression, what to practise over it…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button className="btn btn-primary btn-lg btn-block" disabled={!canSave} onClick={save}>
        {editing ? "Save" : "Add backing track"}
      </button>

      {track && (
        <>
          {plays.length > 0 && (
            <div>
              <p className="step-title">Jammed {plays.length}×</p>
              <div className="history">
                {plays.slice(0, 20).map((p) => (
                  <div key={p.id} className="history-row">
                    <span>{dateTime(p.playedAt)}</span>
                    <button className="icon-btn sm muted" aria-label="Remove" onClick={() => deleteJamPlay(p.id, track.id)}>
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            className="btn btn-danger"
            onClick={() => {
              deleteJam(track.id);
              router.replace("/jam");
            }}
          >
            <Trash2 /> Remove backing track
          </button>
        </>
      )}
      <div style={{ height: 16 }} />
    </div>
  );
}
