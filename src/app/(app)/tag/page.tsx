"use client";

import { Hash, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { LoadingList } from "@/components/Loading";
import { ColorPicker } from "@/components/Pickers";
import { Sheet } from "@/components/Sheet";
import { SongRow } from "@/components/SongRow";
import { TopBar } from "@/components/TopBar";
import { deleteTag, updateTag } from "@/lib/client/actions";
import { useData, useLoaded } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";
import { byTitle, useViews } from "@/lib/client/views";
import { STATUSES, STATUS_LABEL } from "@/lib/shared/types";

function TagDetail() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const data = useData();
  const loaded = useLoaded();
  const views = useViews();
  const tag = data.tags.find((t) => t.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);

  const songs = useMemo(() => views.filter((v) => v.tags.some((t) => t.id === id)).sort(byTitle), [views, id]);

  if (!tag) {
    return (
      <>
        <TopBar back="/tags" />
        {loaded ? (
          <div className="empty">
            <Hash />
            <h3>Tag not found</h3>
            <Link href="/tags" className="btn btn-surface mt-3">
              All tags
            </Link>
          </div>
        ) : (
          <LoadingList />
        )}
      </>
    );
  }

  return (
    <>
      <TopBar
        back="/tags"
        title={
          <span className="row-gap">
            <span className="tag-dot" style={{ width: 10, height: 10, ...(tag.color ? { background: tag.color } : {}) }} />
            {tag.name}
          </span>
        }
        actions={
          <button
            className="icon-btn"
            aria-label="Edit tag"
            onClick={() => {
              setName(tag.name);
              setColor(tag.color);
              setEditing(true);
            }}
          >
            <Pencil />
          </button>
        }
      />
      <div className="container">
        <p className="meta" style={{ marginTop: 0 }}>
          {songs.length} song{songs.length === 1 ? "" : "s"}
        </p>
        {songs.length === 0 ? (
          <div className="empty">
            <Hash />
            <h3>No songs with this tag</h3>
            <p>Add it from a song page.</p>
          </div>
        ) : (
          STATUSES.map((st) => {
            const group = songs.filter((v) => v.entry.status === st);
            if (!group.length) return null;
            return (
              <section key={st} className="section" style={{ marginTop: 18 }}>
                <div className="section-head">
                  <h2 className="section-title">
                    {STATUS_LABEL[st]} <span className="meta">{group.length}</span>
                  </h2>
                </div>
                <div className="list">
                  {group.map((v) => (
                    <SongRow key={v.id} view={v} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit tag"
        footer={
          <>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirm(`Delete tag “${tag.name}”? Songs keep everything else.`)) return;
                deleteTag(tag.id);
                toast("Tag deleted");
                router.replace("/tags");
              }}
            >
              <Trash2 /> Delete
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={!name.trim()}
              onClick={() => {
                updateTag(tag.id, { name: name.trim(), color });
                setEditing(false);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <div className="form-grid">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tag name" />
          <div className="field">
            <span className="label">Color</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
      </Sheet>
    </>
  );
}

export default function TagPage() {
  return (
    <Suspense>
      <TagDetail />
    </Suspense>
  );
}
