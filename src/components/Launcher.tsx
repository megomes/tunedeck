"use client";

import { ChevronDown, ExternalLink, Guitar, Play } from "lucide-react";
import { useRef, useState } from "react";
import { openExternal } from "@/lib/client/actions";
import { duration } from "@/lib/client/format";
import { primaryOf, type SongView } from "@/lib/client/views";
import { RESOURCE_LABEL, RESOURCE_SHORT, RESOURCE_TYPES, type Resource, type ResourceType } from "@/lib/shared/types";
import { hostLabel } from "@/lib/shared/urls";
import { Sheet } from "./Sheet";
import { Thumb } from "./Thumb";

export function resourceName(r: Resource) {
  return r.customLabel || r.title || hostLabel(r.url);
}

export function ResourceRow({ r, onOpen }: { r: Resource; onOpen: () => void }) {
  return (
    <button className="pick" onClick={onOpen}>
      {r.thumbnailUrl ? (
        <Thumb src={r.thumbnailUrl} title={resourceName(r)} />
      ) : (
        <div className="res-icon" style={{ width: 72 }}>
          <ExternalLink />
        </div>
      )}
      <div className="row-main">
        {r.customLabel && <span className="res-label truncate">{r.customLabel}</span>}
        <span className="row-title clamp-2" style={{ fontSize: 14 }}>
          {r.title || hostLabel(r.url)}
        </span>
        <span className="meta truncate">
          {[r.author, duration(r.durationSeconds), r.isPrimary ? "Primary" : null].filter(Boolean).join(" · ")}
        </span>
      </div>
    </button>
  );
}

/** One-tap launcher: TAB / ORIGINAL / COVER / BACKING / LESSON. Chevron or long-press lists alternatives. */
export function Launcher({ view, max = 6, exclude = [] }: { view: SongView; max?: number; exclude?: ResourceType[] }) {
  const [sheet, setSheet] = useState<ResourceType | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const types = RESOURCE_TYPES.filter((t) => view.byType[t]?.length && !exclude.includes(t)).slice(0, view.entry.songsterrUrl ? max - 1 : max);

  const startPress = (t: ResourceType) => {
    longPressed.current = false;
    if ((view.byType[t]?.length ?? 0) < 2) return;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setSheet(t);
    }, 480);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  if (!view.entry.songsterrUrl && !types.length) return null;

  return (
    <div className="launcher" onClick={(e) => e.stopPropagation()}>
      {view.entry.songsterrUrl && (
        <span className="launch tab-launch">
          <button
            onClick={(e) => {
              e.preventDefault();
              openExternal(view.entry.songsterrUrl!, view.id);
            }}
          >
            <Guitar />
            TAB
          </button>
        </span>
      )}
      {types.map((t) => {
        const list = view.byType[t]!;
        const primary = primaryOf(list)!;
        return (
          <span className="launch" key={t}>
            <button
              onPointerDown={() => startPress(t)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onContextMenu={(e) => list.length > 1 && e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                if (longPressed.current) return;
                openExternal(primary.url, view.id);
              }}
              title={resourceName(primary)}
            >
              {primary.provider === "youtube" && <Play />}
              {RESOURCE_SHORT[t]}
            </button>
            {list.length > 1 && (
              <button
                className="more"
                aria-label={`All ${RESOURCE_LABEL[t]} versions`}
                onClick={(e) => {
                  e.preventDefault();
                  setSheet(t);
                }}
              >
                <ChevronDown />
              </button>
            )}
          </span>
        );
      })}
      <Sheet open={sheet != null} onClose={() => setSheet(null)} title={sheet ? RESOURCE_LABEL[sheet] : ""}>
        <div className="pick-list" style={{ maxHeight: "none" }}>
          {sheet &&
            view.byType[sheet]?.map((r) => (
              <ResourceRow
                key={r.id}
                r={r}
                onOpen={() => {
                  setSheet(null);
                  openExternal(r.url, view.id);
                }}
              />
            ))}
        </div>
      </Sheet>
    </div>
  );
}
