import type { Metadata } from "next";
import { connection } from "next/server";
import { loadSnapshot } from "@/lib/server/data";
import type { Entry, Resource, Snapshot } from "@/lib/shared/types";

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
  tab: string | null;
  video: string | null;
}

/** The song itself first (what the teacher wants to hear), then a guitar cover. */
const VIDEO_ORDER: Resource["type"][] = ["original", "guitar_cover", "lesson"];

function rows(snap: Snapshot, entries: Entry[], riffsOf?: (e: Entry) => string[]): Row[] {
  const songs = new Map(snap.songs.map((s) => [s.id, s]));
  return entries.map((e) => {
    const res = snap.resources.filter((r) => r.repertoireEntryId === e.id);
    const video = VIDEO_ORDER.map((t) => res.find((r) => r.type === t && r.provider === "youtube")).find(Boolean);
    const song = songs.get(e.songId);
    return {
      id: e.id,
      title: song?.title ?? "",
      artist: song?.artist ?? "",
      tuning: e.tuning,
      capo: e.capo,
      riffs: riffsOf?.(e) ?? [],
      tab: e.songsterrUrl ?? res.find((r) => r.provider === "songsterr")?.url ?? null,
      video: video?.url ?? null,
    };
  });
}

function List({ items }: { items: Row[] }) {
  return (
    <ul className="share-list">
      {items.map((r) => {
        const meta = [r.riffs.length ? `Só ${r.riffs.join(", ")}` : null, r.tuning, r.capo ? `Capo ${r.capo}` : null].filter(Boolean);
        return (
          <li key={r.id} className="share-row">
            <div className="share-song">
              <span className="share-title">{r.title}</span>
              {r.artist && <span className="share-artist">{r.artist}</span>}
              {meta.length > 0 && <span className="share-meta">{meta.join(" · ")}</span>}
            </div>
            <div className="share-links">
              {r.video && (
                <a href={r.video} target="_blank" rel="noreferrer">
                  Vídeo
                </a>
              )}
              {r.tab && (
                <a href={r.tab} target="_blank" rel="noreferrer">
                  Tab
                </a>
              )}
            </div>
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
