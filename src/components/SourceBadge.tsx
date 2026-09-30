"use client";

import { TabletSmartphone } from "lucide-react";
import { useOffline, videoKey } from "@/lib/client/offline";

function YouTubeMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="1.5" y="4.5" width="21" height="15" rx="4.5" fill="#ff0033" />
      <path d="M10 8.8v6.4l5.6-3.2z" fill="#fff" />
    </svg>
  );
}

/**
 * Phones/tablets only: where a video plays from, the copy stored on this device
 * (TuneDeck's own player) or YouTube. Desktop browsers always use YouTube, so no badge there.
 */
export function SourceBadge({ videoId }: { videoId: string | null | undefined }) {
  const handheld = useOffline((s) => s.handheld);
  const local = useOffline((s) => (videoId ? Boolean(s.videos[videoKey(videoId, 0)]) : false));
  if (!handheld || !videoId) return null;
  return local ? (
    <span className="src-badge local" title="Saved on this device" aria-label="Saved on this device">
      <TabletSmartphone />
    </span>
  ) : (
    <span className="src-badge yt" title="Plays from YouTube" aria-label="Plays from YouTube">
      <YouTubeMark />
    </span>
  );
}
