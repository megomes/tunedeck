"use client";

import { Archive, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { InstrumentChips, StatusChips, TagPicker, TuningPicker } from "@/components/Pickers";
import { TopBar } from "@/components/TopBar";
import { LoadingList } from "@/components/Loading";
import { deleteEntry, setEntryTags, updateEntry, updateSong } from "@/lib/client/actions";
import { toast } from "@/lib/client/ui";
import { useView, type SongView } from "@/lib/client/views";
import type { Instrument, Status } from "@/lib/shared/types";
import { isSongsterr } from "@/lib/shared/urls";

const num = (v: string) => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

function EditForm({ view }: { view: SongView }) {
  const router = useRouter();
  const { song, entry } = view;
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [album, setAlbum] = useState(song.album ?? "");
  const [genre, setGenre] = useState(song.genre ?? "");
  const [bpm, setBpm] = useState(song.bpm?.toString() ?? "");
  const [instrument, setInstrument] = useState<Instrument>(entry.instrument);
  const [status, setStatus] = useState<Status>(entry.status);
  const [tuning, setTuning] = useState<string | null>(entry.tuning);
  const [capo, setCapo] = useState(entry.capo?.toString() ?? "");
  const [difficulty, setDifficulty] = useState<number | null>(entry.difficulty);
  const [songsterrUrl, setSongsterrUrl] = useState(entry.songsterrUrl ?? "");
  const [tagIds, setTagIds] = useState(view.tags.map((t) => t.id));

  const songsterrInvalid = songsterrUrl.trim() !== "" && !/^https?:\/\//.test(songsterrUrl.trim());

  function save() {
    if (!title.trim()) return;
    updateSong(song.id, {
      title: title.trim(),
      artist: artist.trim(),
      album: album.trim() || null,
      genre: genre.trim() || null,
      bpm: num(bpm),
    });
    updateEntry(entry.id, {
      instrument,
      status,
      tuning: instrument === "piano" ? null : tuning,
      capo: num(capo),
      difficulty,
      songsterrUrl: songsterrUrl.trim() || null,
    });
    const before = view.tags.map((t) => t.id).sort().join();
    if (before !== tagIds.slice().sort().join()) setEntryTags(entry.id, tagIds);
    toast("Saved");
    router.back();
  }

  return (
    <>
      <TopBar
        back
        title="Edit song"
        actions={
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!title.trim() || songsterrInvalid}>
            Save
          </button>
        }
      />
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="form-grid mt-3">
          <div className="field">
            <label htmlFor="e-title">Song name</label>
            <input id="e-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="e-artist">Artist</label>
            <input id="e-artist" className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div className="field">
            <span className="label">Status</span>
            <StatusChips value={status} onChange={setStatus} />
          </div>
          <div className="field">
            <span className="label">Instrument</span>
            <InstrumentChips value={instrument} onChange={setInstrument} />
          </div>
          {instrument !== "piano" && (
            <div className="field">
              <span className="label">Tuning</span>
              <TuningPicker value={tuning} onChange={setTuning} />
            </div>
          )}
          <div className="field" id="songsterr">
            <label htmlFor="e-ss">Songsterr link</label>
            <input
              id="e-ss"
              className="input"
              inputMode="url"
              placeholder="https://www.songsterr.com/a/wsa/…"
              value={songsterrUrl}
              onChange={(e) => setSongsterrUrl(e.target.value)}
            />
            {songsterrUrl && !songsterrInvalid && !isSongsterr(songsterrUrl) && (
              <span className="hint">Not a songsterr.com link — it will still open as a tab link.</span>
            )}
            {songsterrInvalid && <span className="error-text">Enter a full https:// link.</span>}
          </div>
          <div className="field">
            <span className="label">Tags</span>
            <TagPicker value={tagIds} onChange={setTagIds} />
          </div>

          <p className="step-title mt-4" style={{ marginBottom: 0 }}>
            Details
          </p>
          <div className="form-2">
            <div className="field">
              <label htmlFor="e-capo">Capo</label>
              <input id="e-capo" className="input" inputMode="numeric" placeholder="—" value={capo} onChange={(e) => setCapo(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="e-bpm">BPM</label>
              <input id="e-bpm" className="input" inputMode="numeric" placeholder="—" value={bpm} onChange={(e) => setBpm(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="e-album">Album</label>
              <input id="e-album" className="input" value={album} onChange={(e) => setAlbum(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="e-genre">Genre</label>
              <input id="e-genre" className="input" value={genre} onChange={(e) => setGenre(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <span className="label">Difficulty</span>
            <div className="segmented">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  type="button"
                  key={d}
                  className={`chip sm ${difficulty === d ? "active" : ""}`}
                  onClick={() => setDifficulty(difficulty === d ? null : d)}
                >
                  {d} · {["Easy", "Moderate", "Intermediate", "Hard", "Expert"][d - 1]}
                </button>
              ))}
            </div>
          </div>

          <div className="action-row mt-6">
            {status !== "ARCHIVED" && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  updateEntry(entry.id, { status: "ARCHIVED" });
                  toast("Archived", { label: "Undo", run: () => updateEntry(entry.id, { status: entry.status }) });
                  router.push("/");
                }}
              >
                <Archive /> Archive
              </button>
            )}
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirm(`Delete “${song.title}” with all its resources, files and play history?`)) return;
                deleteEntry(entry.id);
                toast("Song deleted");
                router.replace("/");
              }}
            >
              <Trash2 /> Delete
            </button>
          </div>
          <div style={{ height: 24 }} />
        </div>
      </div>
    </>
  );
}

function Edit() {
  const params = useSearchParams();
  const view = useView(params.get("id"));
  if (!view) {
    return (
      <>
        <TopBar back title="Edit song" />
        <LoadingList rows={2} />
      </>
    );
  }
  return <EditForm key={view.id} view={view} />;
}

export default function EditPage() {
  return (
    <Suspense>
      <Edit />
    </Suspense>
  );
}
