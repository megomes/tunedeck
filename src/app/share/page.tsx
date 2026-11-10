import type { Metadata } from "next";
import { connection } from "next/server";
import type { CSSProperties } from "react";
import { loadShareSections, summary } from "./data";
import { FilteredList } from "./filtered";
import { List } from "./list";

const TITLE = "O que estou tocando";

/** WhatsApp and other apps read these for the link preview; the image comes from opengraph-image.tsx. */
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const description = summary(await loadShareSections());
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return {
    metadataBase: new URL(host ? `https://${host}` : "http://localhost:3000"),
    title: TITLE,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: TITLE, description, siteName: "TuneDeck", type: "website", locale: "pt_BR", url: "/share" },
    twitter: { card: "summary_large_image", title: TITLE, description },
  };
}

/** Public, read-only page for a teacher: what is played already, being learned, coming next, and the backlog. */
export default async function SharePage() {
  await connection();
  const sections = await loadShareSections();

  return (
    <main className="share">
      <header className="share-head">
        <p className="share-brand">TuneDeck</p>
        <h1>{TITLE}</h1>
        <p className="share-summary">
          {sections.map((s) => (
            <span key={s.title} style={{ "--tone": s.tone } as CSSProperties}>
              <b>{s.items.length}</b> {s.title.toLowerCase()}
            </span>
          ))}
        </p>
      </header>
      {sections.map((s) => (
        <section key={s.title} className="share-section" style={{ "--tone": s.tone } as CSSProperties}>
          <h2>
            {s.title}
            <span className="share-count">{s.items.length}</span>
          </h2>
          {s.filter ? <FilteredList items={s.items} /> : <List items={s.items} />}
        </section>
      ))}
    </main>
  );
}
