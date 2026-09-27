"use client";

import { ChevronRight, ClipboardPaste, Library, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LoadingList } from "@/components/Loading";
import { SongCard } from "@/components/SongCard";
import { SongRow } from "@/components/SongRow";
import { TopBar } from "@/components/TopBar";
import { daysSince, plays, timeAgo } from "@/lib/client/format";
import { useLoaded } from "@/lib/client/store";
import { byLastPlayedAsc, byLastPlayedDesc, byRecentlyAdded, byTitle, useViews, type SongView } from "@/lib/client/views";

const favFirst = (sort: (a: SongView, b: SongView) => number) => (a: SongView, b: SongView) =>
  Number(b.entry.isFavorite) - Number(a.entry.isFavorite) || sort(a, b);

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {href && (
          <Link href={href}>
            See all <ChevronRight />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Welcome() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  return (
    <div className="container">
      <div className="empty" style={{ paddingTop: 72 }}>
        <Library />
        <h3>Build your repertoire</h3>
        <p>Paste a YouTube or Songsterr link, or add a song by name. It takes seconds.</p>
      </div>
      <form
        className="paste-box"
        style={{ maxWidth: 560, margin: "0 auto" }}
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/add?url=${encodeURIComponent(url)}`);
        }}
      >
        <ClipboardPaste />
        <input placeholder="Paste a link…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={!url.trim()}>
          Add
        </button>
      </form>
      <div style={{ textAlign: "center", marginTop: 18 }}>
        <Link href="/add?manual=1" className="btn btn-ghost">
          <Plus /> Add a song manually
        </Link>
      </div>
    </div>
  );
}

export default function HomePage() {
  const loaded = useLoaded();
  const views = useViews();

  const s = useMemo(() => {
    const active = views.filter((v) => v.entry.status !== "ARCHIVED");
    const ready = active.filter((v) => v.entry.status === "CAN_PLAY" || v.entry.status === "MASTERED");
    const tunings = new Map<string, number>();
    for (const v of active) if (v.entry.tuning) tunings.set(v.entry.tuning, (tunings.get(v.entry.tuning) ?? 0) + 1);
    return {
      learning: active.filter((v) => v.entry.status === "LEARNING").sort(favFirst(byLastPlayedDesc)),
      want: active.filter((v) => v.entry.status === "WANT_TO_PLAY").sort(favFirst(byRecentlyAdded)),
      ready: ready.slice().sort(favFirst(byTitle)),
      recent: active.filter((v) => v.entry.lastPlayedAt).sort(byLastPlayedDesc).slice(0, 5),
      stale: ready.filter((v) => daysSince(v.entry.lastPlayedAt) > 14).sort(byLastPlayedAsc).slice(0, 6),
      tunings: [...tunings.entries()].sort((a, b) => b[1] - a[1]),
      total: active.length,
    };
  }, [views]);

  const searchAction = (
    <Link href="/library?search=1" className="icon-btn" aria-label="Search library">
      <Search />
    </Link>
  );

  if (!loaded) {
    return (
      <>
        <TopBar brand actions={searchAction} />
        <LoadingList />
      </>
    );
  }
  if (!views.length) {
    return (
      <>
        <TopBar brand />
        <Welcome />
      </>
    );
  }

  return (
    <>
      <TopBar brand actions={searchAction} />
      <div className="container">
        {s.tunings.length > 1 && (
          <div className="chip-row" style={{ marginTop: 4 }}>
            <Link href="/library" className="chip active">
              All · {s.total}
            </Link>
            {s.tunings.map(([t, n]) => (
              <Link key={t} href={`/library?tuning=${encodeURIComponent(t)}`} className="chip">
                {t} <span style={{ opacity: 0.55 }}>{n}</span>
              </Link>
            ))}
          </div>
        )}

        <Section title="Currently Learning" href="/library?status=LEARNING">
          {s.learning.length ? (
            <div className="carousel">
              {s.learning.map((v) => (
                <SongCard key={v.id} view={v} launcherMax={4} />
              ))}
            </div>
          ) : (
            <p className="meta">Nothing in progress. Move a song to Learning from its menu.</p>
          )}
        </Section>

        {s.want.length > 0 && (
          <Section title="Want to Play" href="/library?status=WANT_TO_PLAY">
            <div className="carousel compact">
              {s.want.slice(0, 20).map((v) => (
                <SongCard key={v.id} view={v} showTags={false} launcherMax={2} />
              ))}
            </div>
          </Section>
        )}

        {s.ready.length > 0 && (
          <Section title="Ready to Play" href="/library?status=READY">
            <div className="carousel compact">
              {s.ready.slice(0, 24).map((v) => (
                <SongCard key={v.id} view={v} showTags={false} launcherMax={2} />
              ))}
            </div>
          </Section>
        )}

        {s.recent.length > 0 && (
          <Section title="Recently Played">
            <div className="list">
              {s.recent.map((v) => (
                <SongRow
                  key={v.id}
                  view={v}
                  meta={`${timeAgo(v.entry.lastPlayedAt)} · ${plays(v.entry.playCount)}${v.entry.tuning ? ` · ${v.entry.tuning}` : ""}`}
                />
              ))}
            </div>
          </Section>
        )}

        {s.stale.length > 0 && (
          <Section title="Haven't Played in a While" href="/library?status=READY&sort=stale">
            <div className="list">
              {s.stale.map((v) => (
                <SongRow
                  key={v.id}
                  view={v}
                  meta={v.entry.lastPlayedAt ? `Last played ${timeAgo(v.entry.lastPlayedAt).toLowerCase()}` : "Never played"}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
