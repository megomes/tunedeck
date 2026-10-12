"use client";

import { AudioLines, Headphones, Inbox, Kanban, Plus, Settings, Tags, X, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { initOffline } from "@/lib/client/offline";
import { initStore, useStore } from "@/lib/client/store";
import { dismissToast, setActiveSong, useActiveSong, usePlayer, useToasts } from "@/lib/client/ui";
import { useView } from "@/lib/client/views";
import { ContextMenuHost } from "./ContextMenu";
import { OfflineBanner } from "./OfflineVideos";
import { Player } from "./Player";
import { PlusOne } from "./PlusOne";
import { SyncBadge } from "./SyncBadge";
import { Thumb } from "./Thumb";
import { UpNextSwap } from "./UpNextSwap";

const NAV = [
  { href: "/backlog", label: "Backlog", icon: Inbox },
  { href: "/", label: "Library", icon: Kanban },
  { href: "/riffs", label: "Riffs", icon: Zap },
  { href: "/jam", label: "Jam", icon: AudioLines },
  { href: "/listen", label: "Listen", icon: Headphones },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
];
/** The phone bar has room for five; Tags stays reachable from Settings, Listen from the Library's top bar. */
const PHONE_NAV = NAV.filter((n) => n.href !== "/tags" && n.href !== "/listen");

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/tags") return pathname === "/tags" || pathname === "/tag";
  return pathname.startsWith(href);
}

/** After coming back from Songsterr or an external link: "Played it? +1". */
function Dock() {
  const activeId = useActiveSong();
  const view = useView(activeId);
  const pathname = usePathname();
  const params = useSearchParams();
  if (!view || (pathname === "/song" && params.get("id") === view.id)) return null;
  return (
    <div className="dock" role="region" aria-label="Last opened song">
      <Link href={`/song?id=${view.id}`} style={{ display: "contents" }}>
        <Thumb src={view.thumb} title={view.song.title} />
        <div className="dock-text">
          <div className="dock-title truncate">{view.song.title}</div>
          <div className="meta truncate">Played it? Tap +1</div>
        </div>
      </Link>
      <PlusOne entryId={view.id} />
      <button className="icon-btn sm muted" aria-label="Dismiss" onClick={() => setActiveSong(null)}>
        <X />
      </button>
    </div>
  );
}

function Toaster({ raised }: { raised: boolean }) {
  const toasts = useToasts();
  return (
    <div className={`toasts ${raised ? "has-dock-toasts" : ""}`} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.action ? "" : "plain"}`}>
          <span>{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const ready = useStore((s) => s.ready);
  const authRequired = useStore((s) => s.authRequired);
  const activeId = useActiveSong();
  const player = usePlayer();
  const hasDock = Boolean(player) || Boolean(activeId);
  const inJam = pathname.startsWith("/jam");
  const inRiffs = pathname.startsWith("/riffs");
  const inBacklog = pathname.startsWith("/backlog");
  const addHref = inJam ? "/jam/add" : inRiffs ? "/add?riffs=1" : inBacklog ? "/add?status=BACKLOG" : "/add";

  useEffect(() => {
    void initStore();
    void initOffline();
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
      // In dev a leftover worker from a local prod build would serve stale pages.
      else void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    }
  }, []);

  useEffect(() => {
    if (authRequired) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [authRequired, pathname, router]);

  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo-96.png" alt="" />
          TuneDeck
        </Link>
        <Link href={addHref} className="btn btn-primary">
          <Plus /> {inJam ? "Add backing track" : inRiffs ? "Add for riffs" : inBacklog ? "Add to Backlog" : "Add"}
        </Link>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`side-item ${isActive(pathname, href) ? "active" : ""}`}>
            <Icon />
            {label}
          </Link>
        ))}
        <div className="sidebar-foot">
          <SyncBadge always />
        </div>
      </aside>

      <main className={`main ${hasDock ? "has-dock" : ""}`}>
        {ready && <OfflineBanner />}
        {ready ? children : null}
      </main>

      <Player />
      {!player && (
        <Suspense>
          <Dock />
        </Suspense>
      )}
      <Toaster raised={hasDock} />
      <ContextMenuHost />
      <UpNextSwap />

      <nav className="bottom-nav" aria-label="Main">
        {PHONE_NAV.slice(0, 3).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}>
            <Icon />
            {label}
          </Link>
        ))}
        <div className="nav-add">
          <Link href={addHref} aria-label={inJam ? "Add backing track" : "Add song"}>
            <Plus />
          </Link>
        </div>
        {PHONE_NAV.slice(3).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}>
            <Icon />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
