"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { sync, useStore } from "@/lib/client/store";
import { timeAgo } from "@/lib/client/format";

/** Quiet by default: only surfaces when offline or when changes are waiting to sync. */
export function SyncBadge({ always = false }: { always?: boolean }) {
  const status = useStore((s) => s.sync);
  const pending = useStore((s) => s.outbox.length);
  const last = useStore((s) => s.lastSyncAt);

  if (!always && status !== "offline" && !(pending && status === "error")) return null;

  if (status === "offline") {
    return (
      <span className="offline-pill">
        <CloudOff /> Offline{pending ? ` · ${pending} pending` : ""}
      </span>
    );
  }
  return (
    <button className="row-gap meta" onClick={() => void sync()} title="Sync now">
      <span className={`sync-dot ${status}`} />
      {status === "syncing"
        ? "Syncing…"
        : status === "error"
          ? `Sync error${pending ? ` · ${pending} pending` : ""}`
          : `Synced ${last ? timeAgo(last).toLowerCase() : ""}`}
      {status === "error" && <RefreshCw size={12} />}
    </button>
  );
}
