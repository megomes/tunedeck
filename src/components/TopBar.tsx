"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SyncBadge } from "./SyncBadge";

export function TopBar({
  title,
  back,
  actions,
  brand,
}: {
  title?: ReactNode;
  back?: boolean | string;
  actions?: ReactNode;
  brand?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {back && (
          <button
            className="icon-btn"
            aria-label="Back"
            style={{ marginLeft: -10 }}
            onClick={() => {
              if (typeof back === "string") router.push(back);
              else if (window.history.length > 1) router.back();
              else router.push("/");
            }}
          >
            <ChevronLeft />
          </button>
        )}
        {brand && (
          <Link href="/" className="brand mobile-only">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo-96.png" alt="" />
            TuneDeck
          </Link>
        )}
        <div className="grow">
          {title ? (
            <h1 className="page-title truncate">{title}</h1>
          ) : brand ? (
            <h1 className="page-title desktop-only">Home</h1>
          ) : null}
        </div>
        <SyncBadge />
        {actions}
      </div>
    </header>
  );
}
