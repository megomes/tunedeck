"use client";

import { ChevronLeft, Guitar, Hash, Pencil, Play, Plus, Star, Tag as TagIcon, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AttachmentsSection } from "@/components/Attachments";
import { Launcher } from "@/components/Launcher";
import { LoadingList } from "@/components/Loading";
import { TagPicker, TuningPicker } from "@/components/Pickers";
import { ResourcesSection } from "@/components/Resources";
import { Sheet } from "@/components/Sheet";
import { StatusList } from "@/components/SongActions";
import { TagPills } from "@/components/TagPills";
import { Thumb } from "@/components/Thumb";
import { TopBar } from "@/components/TopBar";
import { deletePlay, openExternal, playedOnce, setEntryTags, setStatus, toggleFavorite, updateEntry } from "@/lib/client/actions";
import { dateTime, timeAgo } from "@/lib/client/format";
import { useData, useLoaded } from "@/lib/client/store";
import { primaryOf, useView, useViews } from "@/lib/client/views";
import { INSTRUMENT_LABEL, STATUS_LABEL } from "@/lib/shared/types";

type SheetKind = "status" | "tuning" | "tags" | "history" | null;

function SongDetail() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const view = useView(id);
  const views = useViews();
  const loaded = useLoaded();
  const data = useData();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);

  if (!view) {
    return (
      <>
        <TopBar back />
        {loaded ? (
          <div className="empty">
            <X />
            <h3>Song not found</h3>
            <p>It may have been deleted on another device.</p>
            <Link href="/library" className="btn btn-surface mt-3">
              Go to Library
            </Link>
          </div>
        ) : (
          <LoadingList rows={2} />
        )}
      </>
    );
  }

  const { entry, song } = view;
  const original = primaryOf(view.byType.original);
  const history = data.playEvents
    .filter((p) => p.repertoireEntryId === view.id)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  const otherInstruments = views.filter((v) => v.song.id === song.id && v.id !== view.id);

  const back = () => (window.history.length > 1 ? router.back() : router.push("/library"));

  return (
    <>
      <div className="detail-top desktop-only">
        <TopBar back actions={<FavButton id={view.id} on={entry.isFavorite} />} />
      </div>
      <div className="container detail-layout" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="hero">
          <div className="hero-bar">
            <button className="icon-btn" aria-label="Back" onClick={back}>
              <ChevronLeft />
            </button>
            <div className="row-gap">
              <FavButton id={view.id} on={entry.isFavorite} />
              <Link href={`/song/edit?id=${view.id}`} className="icon-btn" aria-label="Edit">
                <Pencil />
              </Link>
            </div>
          </div>
          <div className="hero-media">
            <Thumb src={view.thumb} title={song.title} />
          </div>
        </div>

        <div className="detail-side">
          <div className="song-head">
            <div>
              <h1 className="song-title">{song.title}</h1>
              <div className="song-artist">{song.artist || "Unknown artist"}</div>
            </div>

            <div className="facts">
              <button className="fact" onClick={() => setSheet("status")}>
                <span className="status-badge" data-status={entry.status} />
                {STATUS_LABEL[entry.status]}
              </button>
              {entry.instrument !== "piano" && (
                <button className="fact" onClick={() => setSheet("tuning")}>
                  <Guitar />
                  {entry.tuning ?? "Set tuning"}
                </button>
              )}
              {entry.capo ? (
                <span className="fact">
                  <Hash />
                  Capo {entry.capo}
                </span>
              ) : null}
              <span className="fact">{INSTRUMENT_LABEL[entry.instrument]}</span>
              {otherInstruments.map((o) => (
                <Link key={o.id} href={`/song?id=${o.id}`} className="fact" style={{ color: "var(--text-tertiary)" }}>
                  Also on {INSTRUMENT_LABEL[o.entry.instrument]}
                </Link>
              ))}
            </div>

            <button
              className="row-gap"
              style={{ flexWrap: "wrap", textAlign: "left" }}
              onClick={() => {
                setTagDraft(view.tags.map((t) => t.id));
                setSheet("tags");
              }}
            >
              {view.tags.length ? <TagPills tags={view.tags} /> : null}
              <span className="tag-pill" style={{ color: "var(--text-tertiary)" }}>
                <TagIcon size={11} /> {view.tags.length ? "Edit" : "Add tags"}
              </span>
            </button>

            <button className="stats" style={{ textAlign: "left" }} onClick={() => setSheet("history")}>
              <div className="stat">
                <div className="v">{entry.playCount}</div>
                <div className="k">Times played</div>
              </div>
              <div className="stat">
                <div className="v">{timeAgo(entry.lastPlayedAt)}</div>
                <div className="k">Last played</div>
              </div>
              {song.bpm ? (
                <div className="stat">
                  <div className="v">{song.bpm}</div>
                  <div className="k">BPM</div>
                </div>
              ) : null}
            </button>

            <div className="action-row">
              <button className="btn btn-primary btn-lg big-plus" onClick={() => playedOnce(view.id)}>
                <Plus /> Played
              </button>
              <Link href={`/song/edit?id=${view.id}`} className="btn btn-secondary btn-lg desktop-only">
                <Pencil /> Edit
              </Link>
            </div>
            <div className="action-row">
              {entry.songsterrUrl ? (
                <button className="btn btn-surface" style={{ flex: 1 }} onClick={() => openExternal(entry.songsterrUrl!, view.id)}>
                  <Guitar /> Open in Songsterr
                </button>
              ) : (
                <Link href={`/song/edit?id=${view.id}#songsterr`} className="btn btn-secondary" style={{ flex: 1 }}>
                  <Guitar /> Add Songsterr link
                </Link>
              )}
              {original && (
                <button className="btn btn-surface" style={{ flex: 1 }} onClick={() => openExternal(original.url, view.id)}>
                  <Play /> Open Original
                </button>
              )}
            </div>
            <Launcher view={{ ...view, entry: { ...entry, songsterrUrl: null } }} exclude={["original"]} />
          </div>

          <ResourcesSection view={view} />
          <AttachmentsSection view={view} />
          <div style={{ height: 24 }} />
        </div>
      </div>

      <Sheet open={sheet === "status"} onClose={() => setSheet(null)} title="Status">
        <StatusList
          value={entry.status}
          onPick={(s) => {
            setStatus(view.id, s);
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet open={sheet === "tuning"} onClose={() => setSheet(null)} title="Tuning">
        <TuningPicker
          value={entry.tuning}
          onChange={(t) => {
            updateEntry(view.id, { tuning: t });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet
        open={sheet === "tags"}
        onClose={() => setSheet(null)}
        title="Tags"
        footer={
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              setEntryTags(view.id, tagDraft);
              setSheet(null);
            }}
          >
            Save
          </button>
        }
      >
        <TagPicker value={tagDraft} onChange={setTagDraft} />
      </Sheet>
      <Sheet open={sheet === "history"} onClose={() => setSheet(null)} title="Play history">
        {history.length === 0 ? (
          <p className="meta">Not played yet. Tap “+ Played” after you play it.</p>
        ) : (
          <div className="history">
            {history.slice(0, 100).map((p) => (
              <div key={p.id} className="history-row">
                <span>{dateTime(p.playedAt)}</span>
                <button className="icon-btn sm muted" aria-label="Remove play" onClick={() => deletePlay(p.id, view.id)}>
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

function FavButton({ id, on }: { id: string; on: boolean }) {
  return (
    <button className="icon-btn" aria-label={on ? "Unpin" : "Pin"} onClick={() => toggleFavorite(id)}>
      <Star fill={on ? "currentColor" : "none"} />
    </button>
  );
}

export default function SongPage() {
  return (
    <Suspense>
      <SongDetail />
    </Suspense>
  );
}
