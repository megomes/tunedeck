"use client";

import { AlertTriangle, AudioLines, ClipboardPaste, ExternalLink, Guitar, Link2, LoaderCircle, Play, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { InstrumentChips, LearnChips, StatusChips, TagPicker, TuningPicker } from "@/components/Pickers";
import { Thumb } from "@/components/Thumb";
import { TopBar } from "@/components/TopBar";
import { addResource, createSong, updateEntry } from "@/lib/client/actions";
import { duration } from "@/lib/client/format";
import { fetchMeta, useData } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";
import { findDuplicates, useViews, type SongView } from "@/lib/client/views";
import {
  INSTRUMENT_LABEL,
  RESOURCE_SHORT,
  RESOURCE_TYPES,
  STATUSES,
  STATUS_LABEL,
  type Instrument,
  type Provider,
  type ResourceType,
  type Status,
} from "@/lib/shared/types";
import { detectProvider, extractUrls, guessSongFromVideo, hostLabel, normalizeKey, normalizeUrl, youtubeId, ytThumb } from "@/lib/shared/urls";

interface Meta {
  title: string | null;
  author?: string | null;
  artist?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
}

interface LinkItem {
  key: string;
  url: string;
  provider: Provider;
  type: ResourceType;
  label: string;
  meta: Meta | null;
  state: "loading" | "ok" | "failed";
}

interface NewSongState {
  title: string;
  artist: string;
  instrument: Instrument;
  status: Status;
  tuning: string | null;
  tagIds: string[];
  riffOnly: boolean;
}

// ---------------------------------------------------------------------------

function LinkCard({
  item,
  onChange,
  onRemove,
}: {
  item: LinkItem;
  onChange: (patch: Partial<LinkItem>) => void;
  onRemove: () => void;
}) {
  const ytId = youtubeId(item.url);
  const title =
    item.provider === "songsterr"
      ? item.meta?.title
        ? `${item.meta.title}${item.meta.artist ? ` — ${item.meta.artist}` : ""}`
        : hostLabel(item.url)
      : item.meta?.title || hostLabel(item.url);
  const kind = item.provider === "songsterr" ? "Songsterr · tab" : item.provider === "youtube" ? "YouTube" : hostLabel(item.url);

  return (
    <div className={`link-card ${item.provider}`}>
      <div className="link-card-top">
        {ytId ? (
          <Thumb src={item.meta?.thumbnailUrl ?? ytThumb(ytId)} title={title}>
            {item.meta?.durationSeconds != null && (
              <div className="thumb-overlay" style={{ justifyContent: "flex-end" }}>
                <span className="badge">{duration(item.meta.durationSeconds)}</span>
              </div>
            )}
          </Thumb>
        ) : (
          <div className="res-icon link-icon">{item.provider === "songsterr" ? <Guitar /> : <ExternalLink />}</div>
        )}
        <div className="row-main">
          <span className={`link-kind ${item.provider}`}>
            {item.provider === "youtube" && <Play size={10} fill="currentColor" />}
            {item.provider === "songsterr" && <Guitar size={11} />}
            {kind}
          </span>
          {item.state === "loading" ? (
            <>
              <span className="skeleton-line mt-2" style={{ width: "85%" }} />
              <span className="skeleton-line mt-2" style={{ width: "45%" }} />
            </>
          ) : (
            <>
              <span className="row-title clamp-2" style={{ fontSize: 14, fontWeight: 500 }}>
                {title}
              </span>
              {item.meta?.author && <span className="meta truncate">{item.meta.author}</span>}
            </>
          )}
        </div>
        <button type="button" className="icon-btn sm muted" aria-label="Remove link" onClick={onRemove}>
          <X />
        </button>
      </div>

      {item.provider !== "songsterr" && (
        <>
          <div className="chip-row">
            {RESOURCE_TYPES.map((t) => (
              <button
                type="button"
                key={t}
                className={`chip sm ${item.type === t ? "active" : ""}`}
                onClick={() => onChange({ type: t })}
              >
                {RESOURCE_SHORT[t]}
              </button>
            ))}
          </div>
          <input
            className="input link-label"
            placeholder="Label (optional) — Solo only, Best version…"
            value={item.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </>
      )}
    </div>
  );
}

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
                {v.song.artist} · {v.entry.riffOnly ? "Just riffs" : STATUS_LABEL[v.entry.status]}
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

function DuplicateWarning({ dup, onUse, onDismiss }: { dup: SongView; onUse: () => void; onDismiss: () => void }) {
  return (
    <div className="warn-box">
      <div className="row-gap">
        <AlertTriangle size={17} />
        <strong style={{ fontWeight: 600 }}>This song may already exist.</strong>
      </div>
      <span className="secondary">
        {dup.song.title} — {dup.song.artist || "Unknown artist"} ({INSTRUMENT_LABEL[dup.entry.instrument]}, {STATUS_LABEL[dup.entry.status]})
      </span>
      <div className="row-gap" style={{ flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={onUse}>
          Add links to existing song
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDismiss}>
          Create another entry anyway
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function defaultType(provider: Provider, existing: LinkItem[]): ResourceType {
  if (provider !== "youtube") return "custom";
  return existing.some((l) => l.provider === "youtube" && l.type === "original") ? "guitar_cover" : "original";
}

function Add() {
  const router = useRouter();
  const params = useSearchParams();
  const data = useData();
  const views = useViews();

  const [links, setLinks] = useState<LinkItem[]>([]);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dismissedDup, setDismissedDup] = useState<string | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const requested = useRef(new Set<string>());

  const fromColumn = params.get("status") as Status | null;
  const [song, setSong] = useState<NewSongState>(() => ({
    title: "",
    artist: "",
    instrument: (data.settings.defaultInstrument as Instrument) ?? "guitar",
    status: fromColumn && STATUSES.includes(fromColumn) ? fromColumn : ((data.settings.defaultStatus as Status) ?? "WANT_TO_PLAY"),
    tuning: "E Standard",
    tagIds: [],
    riffOnly: params.get("riffs") === "1",
  }));

  function addUrls(urls: string[]) {
    if (!urls.length) return;
    setLinks((prev) => {
      let next = prev.slice();
      for (const raw of urls) {
        const url = normalizeUrl(raw);
        if (next.some((l) => l.url === url)) continue;
        const provider = detectProvider(url);
        // A song has one Songsterr tab: a new one replaces the previous.
        if (provider === "songsterr") next = next.filter((l) => l.provider !== "songsterr");
        next.push({
          key: crypto.randomUUID(),
          url,
          provider,
          type: defaultType(provider, next),
          label: "",
          meta: null,
          state: provider === "external" ? "failed" : "loading",
        });
      }
      return next;
    });
  }

  // Share Target / deep link: YouTube shares in `text`, browsers in `url`.
  useEffect(() => {
    const shared = [params.get("url"), params.get("text"), params.get("title")].flatMap((v) => extractUrls(v));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    addUrls(shared);
    setCanPaste(!!navigator.clipboard?.readText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch metadata for new links (never blocks saving).
  useEffect(() => {
    for (const l of links) {
      if (l.state !== "loading" || requested.current.has(l.key)) continue;
      requested.current.add(l.key);
      fetchMeta(l.url)
        .then((m: Meta | null) =>
          setLinks((ls) => ls.map((x) => (x.key === l.key ? { ...x, meta: m, state: m ? "ok" : "failed" } : x))),
        )
        .catch(() => setLinks((ls) => ls.map((x) => (x.key === l.key ? { ...x, state: "failed" } : x))));
    }
  }, [links]);

  // Prefill name/artist from the best link (Songsterr is the most precise) until the user types.
  const guess = useMemo(() => {
    const ss = links.find((l) => l.provider === "songsterr" && l.meta?.title);
    if (ss) return { title: ss.meta!.title ?? "", artist: ss.meta!.artist ?? "" };
    const yt = links.find((l) => l.provider === "youtube" && l.meta?.title && l.type === "original") ??
      links.find((l) => l.provider === "youtube" && l.meta?.title);
    return yt ? guessSongFromVideo(yt.meta!.title, yt.meta!.author ?? null) : null;
  }, [links]);

  useEffect(() => {
    if (!guess || touched) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSong((s) => ({ ...s, title: guess.title, artist: guess.artist }));
  }, [guess, touched]);

  const duplicates = useMemo(
    () => (saved || target !== "new" ? [] : findDuplicates(views, song.title, song.artist)),
    [views, song.title, song.artist, saved, target],
  );
  const dup = duplicates[0] && dismissedDup !== duplicates[0].id ? duplicates[0] : null;
  const existing = views.find((v) => v.id === existingId);
  const songsterr = links.find((l) => l.provider === "songsterr");
  const canSave = target === "new" ? song.title.trim().length > 0 : Boolean(existingId) && links.length > 0;

  function save() {
    if (!canSave) return;
    setSaved(true);
    let entryId: string;
    if (target === "new") {
      entryId = createSong({ ...song, songsterrUrl: songsterr?.url ?? null });
    } else {
      entryId = existingId!;
      if (songsterr) updateEntry(entryId, { songsterrUrl: songsterr.url });
    }
    for (const l of links) {
      if (l.provider === "songsterr") continue;
      addResource(entryId, {
        url: l.url,
        type: l.type,
        customLabel: l.label,
        title: l.meta?.title ?? null,
        author: l.meta?.author ?? null,
        thumbnailUrl: l.meta?.thumbnailUrl ?? null,
        durationSeconds: l.meta?.durationSeconds ?? null,
      });
    }
    toast(target === "new" ? "Song added" : `${links.length} link${links.length > 1 ? "s" : ""} added`);
    router.replace(`/song?id=${entryId}${target === "new" && song.riffOnly ? "#riffs" : ""}`);
  }

  const set = (patch: Partial<NewSongState>) => setSong((s) => ({ ...s, ...patch }));

  return (
    <>
      <TopBar
        back
        title="Add"
        actions={
          <button className="btn btn-primary btn-sm" disabled={!canSave} onClick={save}>
            Save
          </button>
        }
      />
      <div className="container" style={{ maxWidth: 720 }}>
        {/* Links: paste one or many, each is detected and typed inline */}
        <section className="add-block">
          <form
            className="paste-box"
            onSubmit={(e) => {
              e.preventDefault();
              addUrls(extractUrls(text));
              setText("");
            }}
          >
            <Link2 />
            <input
              placeholder="Paste YouTube, Songsterr or any link"
              value={text}
              inputMode="url"
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const urls = extractUrls(e.clipboardData.getData("text"));
                if (urls.length) {
                  e.preventDefault();
                  addUrls(urls);
                }
              }}
            />
            {extractUrls(text).length > 0 && (
              <button type="submit" className="btn btn-primary btn-sm">
                Add
              </button>
            )}
            {canPaste && !text && (
              <button
                type="button"
                className="btn btn-surface btn-sm"
                onClick={async () => {
                  try {
                    addUrls(extractUrls(await navigator.clipboard.readText()));
                  } catch {
                    /* permission denied */
                  }
                }}
              >
                <ClipboardPaste /> Paste
              </button>
            )}
          </form>
          {links.length > 0 && (
            <div className="link-list">
              {links.map((l) => (
                <LinkCard
                  key={l.key}
                  item={l}
                  onChange={(patch) => setLinks((ls) => ls.map((x) => (x.key === l.key ? { ...x, ...patch } : x)))}
                  onRemove={() => setLinks((ls) => ls.filter((x) => x.key !== l.key))}
                />
              ))}
            </div>
          )}
          {links.some((l) => l.provider === "youtube") && (
            <Link href={`/jam/add?url=${encodeURIComponent(links.find((l) => l.provider === "youtube")!.url)}`} className="jam-hint">
              <AudioLines size={16} /> Is this a backing track to jam over? <strong>Save it in Jam →</strong>
            </Link>
          )}
          {!links.length && (
            <p className="hint mt-2">Add as many links as you want: the Songsterr link becomes the tab, YouTube videos get a type.</p>
          )}
        </section>

        {/* Where the links go */}
        <section className="add-block">
          <div className="tabs" style={{ marginBottom: 8 }}>
            <button type="button" className={`tab ${target === "new" ? "active" : ""}`} onClick={() => setTarget("new")}>
              New song
            </button>
            <button type="button" className={`tab ${target === "existing" ? "active" : ""}`} onClick={() => setTarget("existing")} disabled={!views.length}>
              Existing song
            </button>
          </div>

          {target === "existing" ? (
            <>
              <SongPicker value={existingId} onChange={setExistingId} />
              {songsterr && existing?.entry.songsterrUrl && existing.entry.songsterrUrl !== songsterr.url && (
                <span className="hint">This replaces the Songsterr link already saved for {existing.song.title}.</span>
              )}
              {!links.length && <span className="hint">Paste at least one link to add to an existing song.</span>}
            </>
          ) : (
            <div className="form-grid">
              <div className="form-2">
                <div className="field">
                  <label htmlFor="n-title">Song name</label>
                  <input
                    id="n-title"
                    className="input"
                    value={song.title}
                    placeholder={links.some((l) => l.state === "loading") ? "Reading links…" : "Numb"}
                    onChange={(e) => {
                      setTouched(true);
                      set({ title: e.target.value });
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="n-artist">Artist</label>
                  <input
                    id="n-artist"
                    className="input"
                    value={song.artist}
                    placeholder="Linkin Park"
                    onChange={(e) => {
                      setTouched(true);
                      set({ artist: e.target.value });
                    }}
                  />
                </div>
              </div>

              {dup && (
                <DuplicateWarning
                  dup={dup}
                  onUse={() => {
                    setTarget("existing");
                    setExistingId(dup.id);
                  }}
                  onDismiss={() => setDismissedDup(dup.id)}
                />
              )}

              <div className="field">
                <span className="label">Learn</span>
                <LearnChips riffOnly={song.riffOnly} onChange={(riffOnly) => set({ riffOnly })} />
              </div>
              {!song.riffOnly && (
                <div className="field">
                  <span className="label">Status</span>
                  <StatusChips value={song.status} onChange={(status) => set({ status })} />
                </div>
              )}
              {song.instrument !== "piano" && (
                <div className="field">
                  <span className="label">Tuning</span>
                  <TuningPicker value={song.tuning} onChange={(tuning) => set({ tuning })} />
                </div>
              )}
              <div className="field">
                <span className="label">Tags</span>
                <TagPicker value={song.tagIds} onChange={(tagIds) => set({ tagIds })} />
              </div>
              <div className="field">
                <span className="label">Instrument</span>
                <InstrumentChips value={song.instrument} onChange={(instrument) => set({ instrument })} />
              </div>
            </div>
          )}
        </section>

        <button className="btn btn-primary btn-lg btn-block mt-6" disabled={!canSave} onClick={save}>
          {target === "new" ? "Save song" : "Add to song"}
        </button>
        <p className="hint mt-3" style={{ textAlign: "center" }}>
          PDF and MIDI files can be attached on the song page. On Android, <strong>Share → TuneDeck</strong> lands here.
        </p>
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
