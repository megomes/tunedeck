import type { Tag } from "@/lib/shared/types";

export function TagPills({ tags, max }: { tags: Tag[]; max?: number }) {
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <span className="tag-list">
      {shown.map((t) => (
        <span key={t.id} className="tag-pill">
          <span className="tag-dot" style={t.color ? { background: t.color } : undefined} />
          {t.name}
        </span>
      ))}
      {max && tags.length > max && <span className="tag-pill">+{tags.length - max}</span>}
    </span>
  );
}
