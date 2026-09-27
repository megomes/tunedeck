"use client";

export const DIFFICULTY_LABEL = ["Trivial", "Easy", "Moderate", "Intermediate", "Hard", "Expert"];

/**
 * 0–5 difficulty as ascending bars. Tap a bar to set it, tap "0" for trivial,
 * tap the current value again to clear it.
 */
export function DifficultyInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const set = (v: number) => onChange(value === v ? null : v);
  return (
    <div className="difficulty" role="radiogroup" aria-label="Difficulty">
      <button
        type="button"
        role="radio"
        aria-checked={value === 0}
        className={`diff-zero ${value === 0 ? "on" : ""}`}
        onClick={() => set(0)}
      >
        0
      </button>
      <div className="diff-bars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} — ${DIFFICULTY_LABEL[n]}`}
            className={`diff-bar ${value != null && n <= value ? "on" : ""}`}
            style={{ height: 8 + n * 5 }}
            onClick={() => set(n)}
          />
        ))}
      </div>
      <span className="diff-text">
        {value == null ? (
          <span className="meta">Not rated</span>
        ) : (
          <>
            <strong>{value}</strong>
            <span className="meta">/5 · {DIFFICULTY_LABEL[value]}</span>
          </>
        )}
      </span>
    </div>
  );
}

/** Compact read-only meter for cards. */
export function DifficultyMeter({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <span className="diff-mini" title={`Difficulty ${value}/5 · ${DIFFICULTY_LABEL[value]}`} aria-label={`Difficulty ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= value ? "on" : ""} style={{ height: 3 + n * 1.6 }} />
      ))}
    </span>
  );
}
