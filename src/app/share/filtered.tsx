"use client";

import { useState } from "react";
import { List, type Row } from "./list";

/** Grid with tuning chips on top (only when the songs use more than one tuning). */
export function FilteredList({ items }: { items: Row[] }) {
  const [tuning, setTuning] = useState<string | null>(null);

  const counts = new Map<string, number>();
  for (const r of items) if (r.tuning) counts.set(r.tuning, (counts.get(r.tuning) ?? 0) + 1);
  const tunings = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = tuning ? items.filter((r) => r.tuning === tuning) : items;

  return (
    <>
      {tunings.length > 1 && (
        <div className="share-chips" role="group" aria-label="Filtrar por afinação">
          <button aria-pressed={tuning === null} onClick={() => setTuning(null)}>
            Todas <span>{items.length}</span>
          </button>
          {tunings.map(([t, n]) => (
            <button key={t} aria-pressed={tuning === t} onClick={() => setTuning(tuning === t ? null : t)}>
              {t} <span>{n}</span>
            </button>
          ))}
        </div>
      )}
      <List items={shown} />
    </>
  );
}
