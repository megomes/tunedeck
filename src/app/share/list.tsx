import { Music, Play } from "lucide-react";

export interface Row {
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

export function List({ items }: { items: Row[] }) {
  return (
    <ul className="share-grid">
      {items.map((r) => {
        const meta = [r.riffs.length ? `Só ${r.riffs.join(", ")}` : null, r.tuning, r.capo ? `Capo ${r.capo}` : null].filter(Boolean);
        const first = r.original ?? r.cover;
        const thumb = r.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnails, already small
          <img src={r.thumb} alt="" loading="lazy" decoding="async" />
        ) : (
          <Music className="share-thumb-empty" />
        );
        return (
          <li key={r.id} className="share-card">
            {first ? (
              <a className="share-thumb" href={first} target="_blank" rel="noreferrer" aria-label={`Ver ${r.title}`}>
                {thumb}
                <span className="share-play">
                  <Play />
                </span>
              </a>
            ) : (
              <span className="share-thumb">{thumb}</span>
            )}
            <div className="share-body">
              <span className="share-title">{r.title}</span>
              {r.artist && <span className="share-artist">{r.artist}</span>}
              {meta.length > 0 && <span className="share-meta">{meta.join(" · ")}</span>}
              {(r.original || r.cover) && (
                <span className="share-links">
                  {r.original && (
                    <a className="is-main" href={r.original} target="_blank" rel="noreferrer">
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}
