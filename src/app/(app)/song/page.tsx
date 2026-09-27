"use client";

import { ChevronLeft, Guitar, Play, Plus, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AttachmentsSection } from "@/components/Attachments";
import { DifficultyInput } from "@/components/Difficulty";
import { playableOf } from "@/components/BoardCard";
import { LoadingList } from "@/components/Loading";
import { ResourcesSection } from "@/components/Resources";
import { Thumb } from "@/components/Thumb";
import { TopBar } from "@/components/TopBar";
import {
  createTag,
  deletePlay,
  openResource,
  openSongsterr,
  playedOnce,
  setEntryTags,
  setStatus,
  toggleFavorite,
  updateEntry,
} from "@/lib/client/actions";
import { dateTime, timeAgo } from "@/lib/client/format";
import { useData, useLoaded } from "@/lib/client/store";
import { useTunings, useView, useViews, type SongView } from "@/lib/client/views";
import { INSTRUMENT_LABEL, STATUSES, STATUS_LABEL } from "@/lib/shared/types";

function StatusBar({ view }: { view: SongView }) {
  return (
    <div className="seg-scroll" role="radiogroup" aria-label="Status">
      {STATUSES.map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={view.entry.status === s}
          className={`seg ${view.entry.status === s ? "active" : ""}`}
          onClick={() => setStatus(view.id, s)}
        >
          <span className="status-badge" data-status={s} />
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

function TuningRow({ view }: { view: SongView }) {
  const tunings = useTunings();
  const [custom, setCustom] = useState<string | null>(null);
  const current = view.entry.tuning;
  const list = current && !tunings.includes(current) ? [current, ...tunings] : tunings;
  return (
    <div className="chip-row">
      {list.map((t) => (
        <button
          key={t}
          className={`chip sm ${current === t ? "active" : ""}`}
          onClick={() => updateEntry(view.id, { tuning: current === t ? null : t })}
        >
          {t}
        </button>
      ))}
      {custom == null ? (
        <button className="chip sm" onClick={() => setCustom("")}>
          <Plus /> Custom
        </button>
      ) : (
        <form
          className="chip-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) updateEntry(view.id, { tuning: custom.trim() });
            setCustom(null);
          }}
        >
          <input autoFocus placeholder="Open G…" value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => !custom && setCustom(null)} />
        </form>
      )}
    </div>
  );
}

function TagRow({ view }: { view: SongView }) {
  const data = useData();
  const [draft, setDraft] = useState<string | null>(null);
  const selected = new Set(view.tags.map((t) => t.id));
  const all = data.tags
    .slice()
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || a.name.localeCompare(b.name));
  const toggle = (id: string) =>
    setEntryTags(view.id, selected.has(id) ? [...selected].filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="chip-row">
      {all.map((t) => (
        <button key={t.id} className={`chip sm ${selected.has(t.id) ? "active" : "dim"}`} onClick={() => toggle(t.id)}>
          <span className="tag-dot" style={t.color ? { background: t.color } : undefined} />
          {t.name}
        </button>
      ))}
      {draft == null ? (
        <button className="chip sm" onClick={() => setDraft("")}>
          <Plus /> Tag
        </button>
      ) : (
        <form
          className="chip-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) {
              const id = createTag(draft);
              setEntryTags(view.id, [...selected, id]);
            }
            setDraft(null);
          }}
        >
          <input autoFocus placeholder="New tag" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => !draft && setDraft(null)} />
        </form>
      )}
    </div>
  );
}

function SongsterrInline({ view }: { view: SongView }) {
  const [url, setUrl] = useState("");
  const valid = /^https?:\/\/\S+$/.test(url.trim());
  return (
    <form
      className="paste-box"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) updateEntry(view.id, { songsterrUrl: url.trim() });
      }}
    >
      <Guitar />
      <input placeholder="Paste the Songsterr link" value={url} inputMode="url" onChange={(e) => setUrl(e.target.value)} />
      {valid && (
        <button className="btn btn-primary btn-sm" type="submit">
          Save
        </button>
      )}
    </form>
  );
}

function History({ view }: { view: SongView }) {
  const data = useData();
  const [all, setAll] = useState(false);
  const plays = data.playEvents
    .filter((p) => p.repertoireEntryId === view.id)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  if (!plays.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Played</h2>
        {plays.length > 5 && (
          <button className="link" onClick={() => setAll((a) => !a)}>
            {all ? "Show less" : `Show all ${plays.length}`}
          </button>
        )}
      </div>
      <div className="history">
        {(all ? plays : plays.slice(0, 5)).map((p) => (
          <div key={p.id} className="history-row">
            <span>{dateTime(p.playedAt)}</span>
            <button className="icon-btn sm muted" aria-label="Remove play" onClick={() => deletePlay(p.id, view.id)}>
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SongDetail() {
  const params = useSearchParams();
  const router = useRouter();
  const view = useView(params.get("id"));
  const views = useViews();
  const loaded = useLoaded();

  if (!view) {
    return (
      <>
        <TopBar back />
        {loaded ? (
          <div className="empty">
            <X />
            <h3>Song not found</h3>
            <p>It may have been deleted on another device.</p>
            <Link href="/" className="btn btn-surface mt-3">
              Back to Library
            </Link>
          </div>
        ) : (
          <LoadingList rows={2} />
        )}
      </>
    );
  }

  const { entry, song } = view;
  const video = playableOf(view);
  const otherInstruments = views.filter((v) => v.song.id === song.id && v.id !== view.id);
  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const pin = (
    <button className="icon-btn" aria-label={entry.isFavorite ? "Unpin" : "Pin"} onClick={() => toggleFavorite(view.id)}>
      <Star fill={entry.isFavorite ? "currentColor" : "none"} />
    </button>
  );
  const details = (
    <Link href={`/song/edit?id=${view.id}`} className="icon-btn" aria-label="Song details">
      <SlidersHorizontal />
    </Link>
  );

  return (
    <>
      <div className="desktop-only">
        <TopBar
          back
          actions={
            <>
              {pin}
              {details}
            </>
          }
        />
      </div>
      <div className="container detail-layout" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="detail-main">
        <div className="hero">
          <div className="hero-bar">
            <button className="icon-btn" aria-label="Back" onClick={back}>
              <ChevronLeft />
            </button>
            <div className="row-gap">
              {pin}
              {details}
            </div>
          </div>
          <div className="hero-media">
            <button className="hero-play" onClick={() => video && openResource(video)} disabled={!video} aria-label="Play video">
              <Thumb src={view.thumb} title={song.title}>
                {video && (
                  <span className="hero-play-btn" aria-hidden>
                    <Play fill="currentColor" />
                  </span>
                )}
              </Thumb>
            </button>
          </div>
        </div>
        <div className="detail-res">
          <ResourcesSection view={view} />
        </div>
        </div>

        <div className="detail-side">
          <div className="song-head">
            <div>
              <h1 className="song-title">{song.title}</h1>
              <div className="song-artist">
                {song.artist || "Unknown artist"}
                <span className="meta">
                  {" · "}
                  {INSTRUMENT_LABEL[entry.instrument]}
                  {entry.capo ? ` · Capo ${entry.capo}` : ""}
                  {song.bpm ? ` · ${song.bpm} BPM` : ""}
                </span>
              </div>
              {otherInstruments.map((o) => (
                <Link key={o.id} href={`/song?id=${o.id}`} className="meta" style={{ display: "block", marginTop: 4 }}>
                  Also on {INSTRUMENT_LABEL[o.entry.instrument]} →
                </Link>
              ))}
            </div>

            <div className="play-row">
              <button className="btn btn-primary btn-lg big-plus" onClick={() => playedOnce(view.id)}>
                <Plus /> Played
              </button>
              <div className="stat">
                <div className="v">{entry.playCount}×</div>
                <div className="k">{timeAgo(entry.lastPlayedAt)}</div>
              </div>
            </div>

            {entry.songsterrUrl ? (
              <div className="action-row">
                <button className="btn btn-surface btn-lg" style={{ flex: 1 }} onClick={() => openSongsterr(entry.songsterrUrl!, view.id)}>
                  <Guitar /> Open tab
                </button>
                {video && (
                  <button className="btn btn-surface btn-lg" style={{ flex: 1 }} onClick={() => openResource(video)}>
                    <Play /> Play video
                  </button>
                )}
              </div>
            ) : (
              <SongsterrInline view={view} />
            )}

            <div className="inline-field">
              <span className="label">Status</span>
              <StatusBar view={view} />
            </div>
            {entry.instrument !== "piano" && (
              <div className="inline-field">
                <span className="label">Tuning</span>
                <TuningRow view={view} />
              </div>
            )}
            <div className="inline-field">
              <span className="label">Difficulty</span>
              <DifficultyInput value={entry.difficulty} onChange={(difficulty) => updateEntry(view.id, { difficulty })} />
            </div>
            <div className="inline-field">
              <span className="label">Tags</span>
              <TagRow view={view} />
            </div>
          </div>

          <div className="detail-extra">
            <AttachmentsSection view={view} />
            <History view={view} />
            <div style={{ height: 24 }} />
          </div>
        </div>
      </div>
    </>
  );
}

export default function SongPage() {
  return (
    <Suspense>
      <SongDetail />
    </Suspense>
  );
}
