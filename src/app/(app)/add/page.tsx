"use client";

import { AlertTriangle, ChevronDown, ChevronUp, ClipboardPaste, ExternalLink, Guitar, Link2, LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CategoryChips, InstrumentChips, LabelInput, StatusChips, TagPicker, TuningPicker } from "@/components/Pickers";
import { Thumb } from "@/components/Thumb";
import { TopBar } from "@/components/TopBar";
import { addResource, createSong, updateEntry } from "@/lib/client/actions";
import { duration } from "@/lib/client/format";
import { fetchMeta, useData } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";
import { findDuplicates, useViews, type SongView } from "@/lib/client/views";
import { INSTRUMENT_LABEL, RESOURCE_LABEL, STATUS_LABEL, type Instrument, type ResourceType, type Status } from "@/lib/shared/types";
import { detectProvider, extractFirstUrl, guessSongFromVideo, hostLabel, normalizeKey, youtubeId, ytThumb } from "@/lib/shared/urls";

interface Meta {
  title: string | null;
  author?: string | null;
  artist?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
}

// ---------------------------------------------------------------------------

function SongPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const views = useViews();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const k = normalizeKey(q);
    return views
      .filter((v) => !k || normalizeKey(`${v.song.title} ${v.song.artist}`).includes(k))
      .sort((a, b) => (a.id === value ? -1 : b.id === value ? 1 : a.song.title.localeCompare(b.song.title)))
      .slice(0, 50);
  }, [views, q, value]);
  return (
    <div className="form-grid" style={{ gap: 10 }}>
      <div className="input-icon">
        <Search />
        <input className="input search" placeholder="Find a song in your library" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pick-list">
        {list.map((v) => (
          <button type="button" key={v.id} className={`pick ${value === v.id ? "active" : ""}`} onClick={() => onChange(v.id)}>
            <Thumb src={v.thumb} title={v.song.title} />
            <span className="row-main">
              <span className="row-title truncate">{v.song.title}</span>
              <span className="meta truncate">
                {v.song.artist} · {STATUS_LABEL[v.entry.status]}
                {v.entry.instrument !== "guitar" ? ` · ${INSTRUMENT_LABEL[v.entry.instrument]}` : ""}
              </span>
            </span>
          </button>
        ))}
        {!list.length && <p className="meta" style={{ padding: 8 }}>No songs found.</p>}
      </div>
    </div>
  );
}

interface NewSongState {
  title: string;
  artist: string;
  instrument: Instrument;
  status: Status;
  tuning: string | null;
  tagIds: string[];
}

function NewSongFields({
  value,
  onChange,
  duplicates,
  onUseExisting,
  compact = false,
}: {
  value: NewSongState;
  onChange: (v: NewSongState) => void;
  duplicates: SongView[];
  onUseExisting?: (id: string) => void;
  compact?: boolean;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [showTags, setShowTags] = useState(false);
  const dupKey = duplicates.map((d) => d.id).join();
  const set = (patch: Partial<NewSongState>) => onChange({ ...value, ...patch });
  return (
    <div className="form-grid">
      <div className="form-2" style={{ gridTemplateColumns: compact ? "1fr" : undefined }}>
        <div className="field">
          <label htmlFor="n-title">Song name</label>
          <input id="n-title" className="input" value={value.title} onChange={(e) => set({ title: e.target.value })} placeholder="Numb" />
        </div>
        <div className="field">
          <label htmlFor="n-artist">Artist</label>
          <input id="n-artist" className="input" value={value.artist} onChange={(e) => set({ artist: e.target.value })} placeholder="Linkin Park" />
        </div>
      </div>

      {duplicates.length > 0 && dismissed !== dupKey && (
        <div className="warn-box">
          <div className="row-gap">
            <AlertTriangle size={17} />
            <strong style={{ fontWeight: 600 }}>This song may already exist.</strong>
          </div>
          <span className="secondary">
            {duplicates[0].song.title} — {duplicates[0].song.artist || "Unknown artist"} ({INSTRUMENT_LABEL[duplicates[0].entry.instrument]},{" "}
            {STATUS_LABEL[duplicates[0].entry.status]})
          </span>
          <div className="row-gap" style={{ flexWrap: "wrap" }}>
            {onUseExisting && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onUseExisting(duplicates[0].id)}>
                Add to existing song
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDismissed(dupKey)}>
              Create another entry anyway
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <span className="label">Status</span>
        <StatusChips value={value.status} onChange={(status) => set({ status })} />
      </div>
      {value.instrument !== "piano" && (
        <div className="field">
          <span className="label">Tuning</span>
          <TuningPicker value={value.tuning} onChange={(tuning) => set({ tuning })} />
        </div>
      )}
      <div className="field">
        <span className="label">Instrument</span>
        <InstrumentChips value={value.instrument} onChange={(instrument) => set({ instrument })} />
      </div>
      <button type="button" className="disclosure" onClick={() => setShowTags((s) => !s)}>
        {showTags ? <ChevronUp /> : <ChevronDown />}
        Tags {value.tagIds.length ? `(${value.tagIds.length})` : ""}
      </button>
      {showTags && <TagPicker value={value.tagIds} onChange={(tagIds) => set({ tagIds })} />}
    </div>
  );
}

function useNewSongDefaults(): NewSongState {
  const data = useData();
  return {
    title: "",
    artist: "",
    instrument: (data.settings.defaultInstrument as Instrument) ?? "guitar",
    status: (data.settings.defaultStatus as Status) ?? "WANT_TO_PLAY",
    tuning: "E Standard",
    tagIds: [],
  };
}

// ---------------------------------------------------------------------------

function LinkFlow({ url, onReset }: { url: string; onReset: () => void }) {
  const router = useRouter();
  const views = useViews();
  const defaults = useNewSongDefaults();
  const provider = detectProvider(url);
  const ytId = youtubeId(url);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaState, setMetaState] = useState<"loading" | "ok" | "failed">("loading");
  const [type, setType] = useState<ResourceType>(provider === "youtube" ? "original" : "custom");
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [song, setSong] = useState<NewSongState>(defaults);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (provider === "external") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMetaState("failed");
      return;
    }
    fetchMeta(url)
      .then((m: Meta | null) => {
        if (cancelled) return;
        setMeta(m);
        setMetaState(m ? "ok" : "failed");
      })
      .catch(() => !cancelled && setMetaState("failed"));
    return () => {
      cancelled = true;
    };
  }, [url, provider]);

  // Prefill the new-song form from metadata once it arrives (unless the user already typed).
  useEffect(() => {
    if (!meta || touched) return;
    const guess =
      provider === "songsterr"
        ? { title: meta.title ?? "", artist: meta.artist ?? "" }
        : guessSongFromVideo(meta.title, meta.author ?? null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSong((s) => ({ ...s, title: guess.title, artist: guess.artist }));
    const dup = findDuplicates(views, guess.title, guess.artist)[0];
    if (dup) {
      setTarget("existing");
      setExistingId(dup.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const duplicates = useMemo(
    () => (saved ? [] : findDuplicates(views, song.title, song.artist)),
    [views, song.title, song.artist, saved],
  );
  const existing = views.find((v) => v.id === existingId);
  const canSave = target === "new" ? song.title.trim().length > 0 : Boolean(existingId);

  function save() {
    setSaved(true);
    let entryId: string;
    if (target === "new") {
      entryId = createSong({
        ...song,
        songsterrUrl: provider === "songsterr" ? url : null,
      });
    } else {
      entryId = existingId!;
      if (provider === "songsterr") updateEntry(entryId, { songsterrUrl: url });
    }
    if (provider !== "songsterr") {
      addResource(entryId, {
        url,
        type,
        customLabel: label,
        title: meta?.title ?? null,
        author: meta?.author ?? null,
        thumbnailUrl: meta?.thumbnailUrl ?? null,
        durationSeconds: meta?.durationSeconds ?? null,
      });
    }
    toast(target === "new" ? "Song added" : provider === "songsterr" ? "Songsterr link saved" : `${RESOURCE_LABEL[type]} added`);
    router.replace(`/song?id=${entryId}`);
  }

  return (
    <div className="form-grid mt-4" style={{ gap: 24 }}>
      <div className="preview">
        {ytId ? (
          <Thumb src={meta?.thumbnailUrl ?? ytThumb(ytId)} title={meta?.title ?? "Video"}>
            {meta?.durationSeconds != null && (
              <div className="thumb-overlay" style={{ justifyContent: "flex-end" }}>
                <span className="badge">{duration(meta.durationSeconds)}</span>
              </div>
            )}
          </Thumb>
        ) : (
          <div className="res-icon" style={{ width: 150 }}>
            {provider === "songsterr" ? <Guitar /> : <ExternalLink />}
          </div>
        )}
        <div className="row-main">
          {metaState === "loading" ? (
            <>
              <div className="skeleton-line" style={{ width: "90%" }} />
              <div className="skeleton-line mt-2" style={{ width: "50%" }} />
            </>
          ) : (
            <>
              <span className="row-title clamp-2">
                {provider === "songsterr" && meta?.title ? `${meta.title} — ${meta.artist}` : meta?.title || hostLabel(url)}
              </span>
              <span className="meta truncate">
                {provider === "songsterr" ? "Songsterr tab" : meta?.author ?? (metaState === "failed" ? "Details will load later — you can save now" : "")}
              </span>
            </>
          )}
          <button type="button" className="meta" style={{ textAlign: "left", marginTop: 6, textDecoration: "underline" }} onClick={onReset}>
            Use a different link
          </button>
        </div>
      </div>

      {provider !== "songsterr" && (
        <>
          <div className="field">
            <span className="label">What is it?</span>
            <CategoryChips value={type} onChange={setType} />
          </div>
          <div className="field">
            <span className="label">Label</span>
            <LabelInput value={label} onChange={setLabel} />
          </div>
        </>
      )}

      <div className="field">
        <span className="label">Add to</span>
        <div className="tabs" style={{ marginBottom: 4 }}>
          <button type="button" className={`tab ${target === "new" ? "active" : ""}`} onClick={() => setTarget("new")}>
            New song
          </button>
          <button type="button" className={`tab ${target === "existing" ? "active" : ""}`} onClick={() => setTarget("existing")} disabled={!views.length}>
            Existing song
          </button>
        </div>
        {target === "new" ? (
          <NewSongFields
            value={song}
            onChange={(v) => {
              setTouched(true);
              setSong(v);
            }}
            duplicates={duplicates}
            onUseExisting={(id) => {
              setTarget("existing");
              setExistingId(id);
            }}
          />
        ) : (
          <>
            <SongPicker value={existingId} onChange={setExistingId} />
            {provider === "songsterr" && existing?.entry.songsterrUrl && existing.entry.songsterrUrl !== url && (
              <span className="hint">This replaces the Songsterr link already saved for {existing.song.title}.</span>
            )}
          </>
        )}
      </div>

      <button className="btn btn-primary btn-lg btn-block" disabled={!canSave} onClick={save}>
        Save
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ManualFlow() {
  const router = useRouter();
  const views = useViews();
  const defaults = useNewSongDefaults();
  const [song, setSong] = useState<NewSongState>(defaults);
  const [songsterr, setSongsterr] = useState("");
  const [links, setLinks] = useState<{ url: string; type: ResourceType }[]>([]);
  const [more, setMore] = useState(false);
  const [saved, setSaved] = useState(false);
  const duplicates = useMemo(
    () => (saved ? [] : findDuplicates(views, song.title, song.artist)),
    [views, song.title, song.artist, saved],
  );

  function save() {
    setSaved(true);
    const entryId = createSong({ ...song, songsterrUrl: extractFirstUrl(songsterr) });
    for (const l of links) {
      const u = extractFirstUrl(l.url);
      if (u) addResource(entryId, { url: u, type: l.type });
    }
    toast("Song added");
    router.replace(`/song?id=${entryId}`);
  }

  return (
    <div className="form-grid mt-4" style={{ gap: 20 }}>
      <NewSongFields value={song} onChange={setSong} duplicates={duplicates} onUseExisting={(id) => router.push(`/song?id=${id}`)} />

      <button type="button" className="disclosure" onClick={() => setMore((m) => !m)}>
        {more ? <ChevronUp /> : <ChevronDown />}
        Songsterr & YouTube links
      </button>
      {more && (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="m-ss">Songsterr link</label>
            <input
              id="m-ss"
              className="input"
              inputMode="url"
              placeholder="https://www.songsterr.com/a/wsa/…"
              value={songsterr}
              onChange={(e) => setSongsterr(e.target.value)}
            />
          </div>
          {links.map((l, i) => (
            <div key={i} className="panel" style={{ padding: 14 }}>
              <div className="row-gap">
                <input
                  className="input"
                  inputMode="url"
                  placeholder="YouTube link"
                  value={l.url}
                  onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                />
                <button type="button" className="icon-btn sm muted" aria-label="Remove link" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                  <Trash2 />
                </button>
              </div>
              <div className="mt-3">
                <CategoryChips value={l.type} onChange={(type) => setLinks(links.map((x, j) => (j === i ? { ...x, type } : x)))} />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setLinks([...links, { url: "", type: links.length ? "guitar_cover" : "original" }])}
          >
            <Plus /> Add a YouTube link
          </button>
          <p className="hint">PDF and MIDI files can be attached from the song page after saving.</p>
        </div>
      )}

      <button className="btn btn-primary btn-lg btn-block" disabled={!song.title.trim()} onClick={save}>
        Save song
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Add() {
  const params = useSearchParams();
  // Share Target: YouTube shares the link in `text`, browsers in `url`.
  const shared = extractFirstUrl(params.get("url")) ?? extractFirstUrl(params.get("text")) ?? extractFirstUrl(params.get("title"));
  const [input, setInput] = useState(shared ?? "");
  const [url, setUrl] = useState<string | null>(shared);
  const [manual, setManual] = useState(params.get("manual") === "1" && !shared);
  const [canPaste, setCanPaste] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanPaste(typeof navigator !== "undefined" && !!navigator.clipboard?.readText);
  }, []);

  const submit = (value: string) => {
    const u = extractFirstUrl(value);
    if (u) {
      setUrl(u);
      setManual(false);
    }
  };

  return (
    <>
      <TopBar back title="Add" />
      <div className="container" style={{ maxWidth: 720 }}>
        <form
          className="paste-box mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <Link2 />
          <input
            placeholder="Paste a YouTube or Songsterr link"
            value={input}
            inputMode="url"
            autoFocus={!shared && !manual}
            onChange={(e) => {
              setInput(e.target.value);
              const u = extractFirstUrl(e.target.value);
              if (u && u !== url) {
                setUrl(u);
                setManual(false);
              }
            }}
          />
          {canPaste && !input && (
            <button
              type="button"
              className="btn btn-surface btn-sm"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setInput(text);
                  submit(text);
                } catch {
                  /* permission denied */
                }
              }}
            >
              <ClipboardPaste /> Paste
            </button>
          )}
        </form>

        {url ? (
          <LinkFlow
            key={url}
            url={url}
            onReset={() => {
              setUrl(null);
              setInput("");
            }}
          />
        ) : manual ? (
          <ManualFlow />
        ) : (
          <div className="mt-6">
            <button className="panel" style={{ width: "100%", textAlign: "left" }} onClick={() => setManual(true)}>
              <div className="row-gap" style={{ gap: 14 }}>
                <span className="tag-icon">
                  <Plus />
                </span>
                <span className="row-main">
                  <span className="row-title">Add a song manually</span>
                  <span className="meta">Name, artist, status and tuning. Everything else is optional.</span>
                </span>
              </div>
            </button>
            <p className="hint mt-4" style={{ textAlign: "center" }}>
              Tip: on Android, install TuneDeck and use <strong>Share → TuneDeck</strong> from YouTube or Songsterr.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export default function AddPage() {
  return (
    <Suspense
      fallback={
        <div className="container mt-6">
          <LoaderCircle className="spin" />
        </div>
      }
    >
      <Add />
    </Suspense>
  );
}
