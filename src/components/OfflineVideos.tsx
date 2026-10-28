"use client";

import { Check, HardDriveDownload, ListMusic, LoaderCircle, Monitor, RefreshCw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { setSetting } from "@/lib/client/actions";
import { fileSize } from "@/lib/client/format";
import {
  clearFinishedTransfers,
  clearVideos,
  downloadMissing,
  findDesktop,
  missingVideos,
  updatePlaylist,
  useOffline,
  type TransferItem,
} from "@/lib/client/offline";
import { useData } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";

const STATE_LABEL: Record<TransferItem["state"], string> = {
  queued: "Waiting",
  downloading: "Computer downloading",
  processing: "Computer tuning",
  ready: "Ready on computer",
  sending: "Copying to this device",
  saved: "Saved",
  error: "Failed",
};

function useMissing() {
  const data = useData();
  const videos = useOffline((s) => s.videos);
  return useMemo(() => missingVideos(data, videos), [data, videos]);
}

/** The YouTube playlist of covers to pull into the Backlog (set in Settings). */
function usePlaylistUrl() {
  const data = useData();
  return (data.settings.playlistUrl as string | undefined)?.trim() || null;
}

function PlaylistButton({ url, disabled }: { url: string; disabled?: boolean }) {
  const playlist = useOffline((s) => s.playlist);
  const running = playlist.state === "running";
  return (
    <button className="btn btn-surface btn-sm" disabled={disabled || running} onClick={() => void updatePlaylist(url)}>
      {running ? <LoaderCircle className="spin" /> : <ListMusic />} Playlist
    </button>
  );
}

function summary(transfers: TransferItem[]) {
  const done = transfers.filter((t) => t.state === "saved").length;
  const failed = transfers.filter((t) => t.state === "error").length;
  const current =
    transfers.find((t) => t.state === "sending") ??
    transfers.find((t) => t.state === "processing" || t.state === "downloading") ??
    null;
  const active = transfers.length - done - failed;
  return { done, failed, current, active, total: transfers.length };
}

const SHOW_WAITING = 6;
const ORDER: Record<TransferItem["state"], number> = { sending: 0, processing: 1, downloading: 1, ready: 2, error: 3, queued: 4, saved: 5 };

/** Long lists stay short: in-flight and failed items, then the next few waiting. Saved ones are only counted. */
function visibleTransfers(transfers: TransferItem[]) {
  const waiting = transfers.filter((t) => t.state === "queued").slice(0, SHOW_WAITING);
  return [...transfers.filter((t) => t.state !== "queued" && t.state !== "saved"), ...waiting].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
}

function hiddenWaiting(transfers: TransferItem[]) {
  return Math.max(0, transfers.filter((t) => t.state === "queued").length - SHOW_WAITING);
}

/** Phone/tablet banner: the desktop app is on this Wi-Fi and can fill in missing videos. */
export function OfflineBanner() {
  const handheld = useOffline((s) => s.handheld);
  const pcStatus = useOffline((s) => s.pcStatus);
  const pcName = useOffline((s) => s.pcName);
  const transfers = useOffline((s) => s.transfers);
  const missing = useMissing();
  const playlistUrl = usePlaylistUrl();
  const playlist = useOffline((s) => s.playlist);
  const [dismissed, setDismissed] = useState(false);

  if (!handheld) return null;
  if (playlist.state === "running") {
    return (
      <Link href="/settings#videos" className="offline-banner">
        <LoaderCircle className="spin" />
        <span className="grow">
          <span className="ob-title truncate">Updating the playlist</span>
          <span className="meta truncate">{playlist.step}</span>
        </span>
      </Link>
    );
  }
  if (dismissed) return null;
  const s = summary(transfers);

  if (s.active > 0) {
    const cur = s.current;
    return (
      <Link href="/settings#videos" className="offline-banner">
        <LoaderCircle className="spin" />
        <span className="grow">
          <span className="ob-title truncate">
            Videos {s.done + 1 > s.total ? s.total : s.done + 1} of {s.total}
            {cur ? ` · ${cur.title}` : ""}
          </span>
          <span className="ob-bar">
            <i style={{ width: `${((s.done + (cur?.state === "sending" ? cur.progress : 0)) / Math.max(1, s.total)) * 100}%` }} />
          </span>
        </span>
      </Link>
    );
  }

  if (pcStatus !== "connected" || (missing.length === 0 && !playlistUrl)) return null;
  return (
    <div className="offline-banner">
      <Monitor />
      <span className="grow">
        <span className="ob-title truncate">{pcName ?? "Your computer"} is on this Wi-Fi</span>
        <span className="meta">
          {missing.length
            ? `${missing.length} video${missing.length === 1 ? "" : "s"} not on this device yet`
            : "All videos on this device"}
        </span>
      </span>
      {playlistUrl && <PlaylistButton url={playlistUrl} />}
      {missing.length > 0 && (
        <button className="btn btn-primary btn-sm" onClick={() => void downloadMissing()}>
          <HardDriveDownload /> Download
        </button>
      )}
      <button className="icon-btn sm muted" aria-label="Not now" onClick={() => setDismissed(true)}>
        <X />
      </button>
    </div>
  );
}

/** Settings section: status of the desktop link and the videos stored on this device. */
export function OfflineVideosSection() {
  const handheld = useOffline((s) => s.handheld);
  const loaded = useOffline((s) => s.loaded);
  const videos = useOffline((s) => s.videos);
  const pcStatus = useOffline((s) => s.pcStatus);
  const pcName = useOffline((s) => s.pcName);
  const transfers = useOffline((s) => s.transfers);
  const missing = useMissing();
  const playlistUrl = usePlaylistUrl();
  const playlist = useOffline((s) => s.playlist);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!loaded || !handheld) return null;
  const stored = Object.values(videos);
  const bytes = stored.reduce((n, v) => n + v.size, 0);
  const s = summary(transfers);
  const searching = pcStatus === "looking" || pcStatus === "connecting";

  const status =
    pcStatus === "connected"
      ? `Connected to ${pcName ?? "your computer"}`
      : searching
        ? `Looking for ${pcName ?? "your computer"}…`
        : pcStatus === "blocked"
          ? `Chrome is blocking ${pcName ?? "your computer"}`
          : pcStatus === "unreachable"
            ? `Can't reach ${pcName ?? "your computer"}`
            : "Open TuneDeck on your computer, on the same Wi-Fi";
  const hint =
    pcStatus === "blocked"
      ? "Allow Local network access for this site: tap the icon left of the address (or Chrome → Settings → Site settings → Local network access), then tap Find."
      : pcStatus === "unreachable"
        ? "Is it on the same Wi-Fi? If Chrome asks to connect to devices on your local network, allow it."
        : null;

  return (
    <section className="section" id="videos">
      <p className="step-title">Videos on this device</p>
      <div className="panel form-grid">
        <p className="secondary" style={{ margin: 0 }}>
          Videos saved here open in TuneDeck&apos;s own player, with gestures, A–B loops and a standard-tuning version of songs
          in other tunings. Your computer downloads them and sends them over Wi-Fi.
        </p>
        <div className="row-gap">
          {pcStatus === "connected" ? <Check size={16} color="var(--success)" /> : <Monitor size={16} />}
          <span className="grow">{status}</span>
          {pcStatus !== "connected" && (
            <button className="btn btn-surface btn-sm" disabled={searching} onClick={() => void findDesktop(true)}>
              {searching ? <LoaderCircle className="spin" /> : <RefreshCw />} Find
            </button>
          )}
        </div>
        {hint && <span className={pcStatus === "blocked" ? "error-text" : "meta"}>{hint}</span>}
        <div className="row-gap">
          <span className="grow meta">
            {stored.length} saved · {fileSize(bytes)}
            {missing.length > 0 ? ` · ${missing.length} missing` : " · all videos saved"}
          </span>
          {missing.length > 0 && (
            <button className="btn btn-primary btn-sm" disabled={pcStatus !== "connected" || s.active > 0} onClick={() => void downloadMissing()}>
              <HardDriveDownload /> Download {missing.length}
            </button>
          )}
        </div>

        <label className="form-grid" style={{ gap: 6 }}>
          <span className="meta">
            YouTube playlist of covers: new videos go to Backlog (named by Claude Code on your computer), then download here
          </span>
          <div className="row-gap">
            <input
              className="input grow"
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/playlist?list=…"
              defaultValue={playlistUrl ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (playlistUrl ?? "")) setSetting("playlistUrl", v || null);
              }}
            />
            {playlistUrl && <PlaylistButton url={playlistUrl} disabled={pcStatus !== "connected"} />}
          </div>
          {playlist.state === "running" && <span className="meta">{playlist.step}…</span>}
          {playlist.state === "error" && <span className="error-text">{playlist.error}</span>}
          {playlist.state === "done" && (
            <span className="meta">
              {playlist.videos ? `Added ${playlist.songs} new song${playlist.songs === 1 ? "" : "s"} and ${playlist.videos} video${playlist.videos === 1 ? "" : "s"}` : "Nothing new in the playlist"}
            </span>
          )}
        </label>

        {transfers.length > 0 && (
          <div className="transfer-list">
            <div className="row-gap">
              <span className="grow" style={{ fontWeight: 600 }}>
                {s.done} of {s.total} saved
                {s.failed ? ` · ${s.failed} failed` : ""}
              </span>
            </div>
            <span className="ob-bar">
              <i style={{ width: `${(s.done / Math.max(1, s.total)) * 100}%` }} />
            </span>
            {visibleTransfers(transfers).map((t) => (
              <div key={t.key} className={`transfer ${t.state}`}>
                <div className="row-gap">
                  <span className="grow truncate" style={{ fontSize: 13.5 }}>
                    {t.title}
                  </span>
                  <span className="meta">
                    {t.state === "error" ? (t.error ?? STATE_LABEL.error) : STATE_LABEL[t.state]}
                    {(t.state === "downloading" || t.state === "processing" || t.state === "sending") &&
                      ` ${Math.round(t.progress * 100)}%`}
                  </span>
                </div>
                <span className="ob-bar">
                  <i style={{ width: `${(t.state === "saved" ? 1 : t.progress) * 100}%` }} />
                </span>
              </div>
            ))}
            {hiddenWaiting(transfers) > 0 && <span className="meta">…and {hiddenWaiting(transfers)} more waiting</span>}
            {s.active === 0 && (
              <button className="btn btn-ghost btn-sm" onClick={clearFinishedTransfers}>
                Clear list
              </button>
            )}
          </div>
        )}

        {stored.length > 0 &&
          (confirmClear ? (
            <div className="row-gap">
              <span className="grow meta">Delete all {stored.length} videos from this device?</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  await clearVideos();
                  setConfirmClear(false);
                  toast("Videos deleted from this device");
                }}
              >
                Delete
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmClear(true)}>
              <Trash2 /> Delete videos from this device
            </button>
          ))}
      </div>
    </section>
  );
}
