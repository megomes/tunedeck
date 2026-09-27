"use client";

import { Hash, Plus, Tags } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { TopBar } from "@/components/TopBar";
import { createTag } from "@/lib/client/actions";
import { useData, useLoaded } from "@/lib/client/store";
import { ColorPicker } from "@/components/Pickers";
import { LoadingList } from "@/components/Loading";

export default function TagsPage() {
  const data = useData();
  const loaded = useLoaded();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    const archived = new Set(data.entries.filter((e) => e.status === "ARCHIVED").map((e) => e.id));
    for (const et of data.entryTags) if (!archived.has(et.repertoireEntryId)) counts.set(et.tagId, (counts.get(et.tagId) ?? 0) + 1);
    return data.tags
      .map((t) => ({ ...t, count: counts.get(t.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data]);

  return (
    <>
      <TopBar
        title="Tags"
        actions={
          <button className="icon-btn" aria-label="New tag" onClick={() => setOpen(true)}>
            <Plus />
          </button>
        }
      />
      <div className="container">
        {!loaded ? (
          <LoadingList />
        ) : tags.length === 0 ? (
          <div className="empty">
            <Tags />
            <h3>No tags yet</h3>
            <p>Tags replace setlists: “Warmup”, “Drop D Favorites”, “Acoustic”, “To Record”…</p>
            <button className="btn btn-primary mt-3" onClick={() => setOpen(true)}>
              <Plus /> Create a tag
            </button>
          </div>
        ) : (
          <div className="tag-grid mt-2">
            {tags.map((t) => (
              <Link key={t.id} href={`/tag?id=${t.id}`} className="tag-card">
                <span className="tag-icon" style={t.color ? { background: `${t.color}22`, color: t.color } : undefined}>
                  <Hash />
                </span>
                <span className="row-main">
                  <span className="row-title truncate">{t.name}</span>
                  <span className="meta">
                    {t.count} song{t.count === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New tag"
        footer={
          <button
            className="btn btn-primary btn-block"
            disabled={!name.trim()}
            onClick={() => {
              createTag(name, color);
              setName("");
              setColor(null);
              setOpen(false);
            }}
          >
            Create
          </button>
        }
      >
        <div className="form-grid">
          <input className="input" autoFocus placeholder="Tag name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="field">
            <span className="label">Color</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
      </Sheet>
    </>
  );
}
