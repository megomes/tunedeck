import type { Metadata } from "next";
import { connection } from "next/server";
import { loadSnapshot } from "@/lib/server/data";
import type { Entry, Resource, Snapshot } from "@/lib/shared/types";
import { youtubeId, ytThumb } from "@/lib/shared/urls";

export const metadata: Metadata = {
  title: "O que estou tocando",
  robots: { index: false, follow: false },
};

interface Row {
  id: string;
  title: string;
  artist: string;
  tuning: string | null;
  capo: number | null;
  /** Riffs learned on their own, when not the whole song. */
  riffs: string[];
  original: string | null;
  cover: string | null;
  thumb: string | null;
}

function rows(snap: Snapshot, entries: Entry[], riffsOf?: (e: Entry) => string[]): Row[] {
  const songs = new Map(snap.songs.map((s) => [s.id, s]));
  return entries.map((e) => {
    const res = snap.resources.filter((r) => r.repertoireEntryId === e.id);
    const yt = res.filter((r) => r.provider === "youtube");
    const find = (type: Resource["type"]) => yt.find((r) => r.type === type);
    const video = (type: Resource["type"]) => find(type)?.url ?? null;
    // Official video first, then the cover, then any other video of the song.
    const pic = find("original") ?? find("guitar_cover") ?? yt[0];
    const picId = pic ? youtubeId(pic.url) : null;
    const song = songs.get(e.songId);
    return {
      id: e.id,
      title: song?.title ?? "",
      artist: song?.artist ?? "",
      tuning: e.tuning,
      capo: e.capo,
      riffs: riffsOf?.(e) ?? [],
      original: video("original"),
      cover: video("guitar_cover"),
      thumb: picId ? ytThumb(picId) : (pic?.thumbnailUrl ?? null),
    };
  });
}

function List({ items }: { items: Row[] }) {
  return (
    <ul className="share-grid">
      {items.map((r) => {
        const meta = [r.riffs.length ? `Só ${r.riffs.join(", ")}` : null, r.tuning, r.capo ? `Capo ${r.capo}` : null].filter(Boolean);
        return (
          <li key={r.id} className="share-card">
            <span className="share-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnails, already small */}
              {r.thumb && <img src={r.thumb} alt="" loading="lazy" decoding="async" />}
            </span>
            <span className="share-title">{r.title}</span>
            {r.artist && <span className="share-artist">{r.artist}</span>}
            {meta.length > 0 && <span className="share-meta">{meta.join(" · ")}</span>}
            {(r.original || r.cover) && (
              <span className="share-links">
                {r.original && (
                  <a href={r.original} target="_blank" rel="noreferrer">
                    Original
                  </a>
                )}
                {r.cover && (
                  <a href={r.cover} target="_blank" rel="noreferrer">
                    Cover
                  </a>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Public, read-only page for a teacher: what is being learned now, what comes next, and the backlog. */
export default async function SharePage() {
  await connection();

  const snap = await loadSnapshot();
  const byPos = (a: Entry, b: Entry) => a.position - b.position;
  const learningRiffs = (e: Entry) =>
    snap.riffs.filter((r) => r.repertoireEntryId === e.id && r.status === "LEARNING").map((r) => r.name);

  const learning = rows(
    snap,
    snap.entries.filter((e) => (e.riffOnly ? learningRiffs(e).length > 0 : e.status === "LEARNING")).sort(byPos),
    (e) => (e.riffOnly ? learningRiffs(e) : []),
  );
  const next = rows(snap, snap.entries.filter((e) => !e.riffOnly && e.status === "WANT_TO_PLAY").sort(byPos));
  const backlog = rows(
    snap,
    snap.entries.filter((e) => !e.riffOnly && e.status === "BACKLOG").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  return (
    <main className="share">
      <header className="share-head">
        <p className="share-brand">TuneDeck</p>
        <h1>O que estou tocando</h1>
      </header>

      <section className="share-section">
        <h2>
          Aprendendo agora <span>{learning.length}</span>
        </h2>
        {learning.length ? <List items={learning} /> : <p className="share-empty">Nada no momento.</p>}
      </section>

      {next.length > 0 && (
        <section className="share-section">
          <h2>
            Próximas <span>{next.length}</span>
          </h2>
          <List items={next} />
        </section>
      )}

      {backlog.length > 0 && (
        <details className="share-section share-backlog" open={backlog.length <= 12}>
          <summary>
            <h2>
              Backlog <span>{backlog.length}</span>
            </h2>
          </summary>
          <List items={backlog} />
        </details>
      )}
    </main>
  );
}
