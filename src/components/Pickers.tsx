"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { createTag } from "@/lib/client/actions";
import { useData } from "@/lib/client/store";
import { useTunings } from "@/lib/client/views";
import { TAG_COLORS, INSTRUMENTS, INSTRUMENT_LABEL, RESOURCE_LABEL, RESOURCE_TYPES, STATUSES, STATUS_LABEL, type Instrument, type ResourceType, type Status } from "@/lib/shared/types";

export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const data = useData();
  const [name, setName] = useState("");
  const tags = data.tags.slice().sort((a, b) => a.name.localeCompare(b.name));
  const add = () => {
    if (!name.trim()) return;
    const id = createTag(name);
    if (!value.includes(id)) onChange([...value, id]);
    setName("");
  };
  return (
    <div className="form-grid" style={{ gap: 12 }}>
      {tags.length > 0 && (
        <div className="segmented">
          {tags.map((t) => {
            const on = value.includes(t.id);
            return (
              <button
                type="button"
                key={t.id}
                className={`chip sm ${on ? "active" : ""}`}
                onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
              >
                <span className="tag-dot" style={t.color ? { background: t.color } : undefined} />
                {t.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="row-gap">
        <input
          className="input"
          style={{ height: 40, borderRadius: 999 }}
          placeholder="New tag"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-surface btn-sm" onClick={add} disabled={!name.trim()}>
          <Plus /> Add
        </button>
      </div>
    </div>
  );
}

export function TuningPicker({ value, onChange }: { value: string | null; onChange: (t: string | null) => void }) {
  const tunings = useTunings();
  const [custom, setCustom] = useState("");
  const isCustom = value != null && !tunings.includes(value);
  return (
    <div className="form-grid" style={{ gap: 12 }}>
      <div className="segmented">
        {tunings.map((t) => (
          <button type="button" key={t} className={`chip sm ${value === t ? "active" : ""}`} onClick={() => onChange(t)}>
            {t}
          </button>
        ))}
        {isCustom && <button type="button" className="chip sm active">{value}</button>}
        <button type="button" className={`chip sm ${value == null ? "active" : ""}`} onClick={() => onChange(null)}>
          Not set
        </button>
      </div>
      <div className="row-gap">
        <input
          className="input"
          style={{ height: 40, borderRadius: 999 }}
          placeholder="Custom tuning, e.g. Open G"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              e.preventDefault();
              onChange(custom.trim());
              setCustom("");
            }
          }}
        />
        <button
          type="button"
          className="btn btn-surface btn-sm"
          disabled={!custom.trim()}
          onClick={() => {
            onChange(custom.trim());
            setCustom("");
          }}
        >
          Use
        </button>
      </div>
    </div>
  );
}

export function StatusChips({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <div className="segmented">
      {STATUSES.filter((s) => s !== "ARCHIVED" || value === "ARCHIVED").map((s) => (
        <button type="button" key={s} className={`chip sm ${value === s ? "active" : ""}`} onClick={() => onChange(s)}>
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/** Whole song (on the Library board) or just some riffs (only in the Riffs tab). */
export function LearnChips({ riffOnly, onChange }: { riffOnly: boolean; onChange: (riffOnly: boolean) => void }) {
  return (
    <div className="segmented">
      {[false, true].map((v) => (
        <button type="button" key={String(v)} className={`chip sm ${riffOnly === v ? "active" : ""}`} onClick={() => onChange(v)}>
          {riffOnly === v && <Check />}
          {v ? "Just riffs" : "Whole song"}
        </button>
      ))}
    </div>
  );
}

export function InstrumentChips({ value, onChange }: { value: Instrument; onChange: (i: Instrument) => void }) {
  return (
    <div className="segmented">
      {INSTRUMENTS.map((i) => (
        <button type="button" key={i} className={`chip sm ${value === i ? "active" : ""}`} onClick={() => onChange(i)}>
          {value === i && <Check />}
          {INSTRUMENT_LABEL[i]}
        </button>
      ))}
    </div>
  );
}

export function CategoryChips({ value, onChange }: { value: ResourceType; onChange: (t: ResourceType) => void }) {
  return (
    <div className="segmented">
      {RESOURCE_TYPES.map((t) => (
        <button type="button" key={t} className={`chip sm ${value === t ? "active" : ""}`} onClick={() => onChange(t)}>
          {RESOURCE_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

export const LABEL_SUGGESTIONS = ["Best version", "Full song", "Solo only", "No vocals", "Easy fingering", "Good camera angle"];

export function LabelInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="form-grid" style={{ gap: 10 }}>
      <input className="input" placeholder="Custom label (optional)" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="segmented">
        {LABEL_SUGGESTIONS.map((l) => (
          <button type="button" key={l} className={`chip sm ${value === l ? "active" : ""}`} onClick={() => onChange(value === l ? "" : l)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) {
  return (
    <div className="segmented" style={{ gap: 10 }}>
      <button
        type="button"
        className="color-swatch"
        style={{ background: "var(--background-tertiary)" }}
        aria-pressed={value == null}
        aria-label="No color"
        onClick={() => onChange(null)}
      />
      {TAG_COLORS.map((c) => (
        <button type="button" key={c} className="color-swatch" style={{ background: c }} aria-pressed={value === c} aria-label={c} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

