"use client";

import { House, Library, Plus, Settings, Tags, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { initStore, useStore } from "@/lib/client/store";
import { dismissToast, setActiveSong, useActiveSong, useToasts } from "@/lib/client/ui";
import { useView } from "@/lib/client/views";
import { PlusOne } from "./PlusOne";
import { SyncBadge } from "./SyncBadge";
import { Thumb } from "./Thumb";

const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/library", label: "Library", icon: Library },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/tags") return pathname === "/tags" || pathname === "/tag";
  return pathname.startsWith(href);
}

function Dock() {
  const activeId = useActiveSong();
  const view = useView(activeId);
  const pathname = usePathname();
  const params = useSearchParams();
  if (!view || (pathname === "/song" && params.get("id") === view.id)) return null;
  return (
    <div className="dock" role="region" aria-label="Now playing">
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
  const hasDock = Boolean(activeId);

  useEffect(() => {
    void initStore();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
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
        <Link href="/add" className="btn btn-primary">
          <Plus /> Add
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

      <main className={`main ${hasDock ? "has-dock" : ""}`}>{ready ? children : null}</main>

      <Suspense>
        <Dock />
      </Suspense>
      <Toaster raised={hasDock} />

      <nav className="bottom-nav" aria-label="Main">
        {NAV.slice(0, 2).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}>
            <Icon />
            {label}
          </Link>
        ))}
        <div className="nav-add">
          <Link href="/add" aria-label="Add">
            <Plus />
          </Link>
        </div>
        {NAV.slice(2).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}>
            <Icon />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
