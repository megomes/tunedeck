"use client";

import { Check, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  /** Small color dot before the label (riff colors, status colors). */
  dot?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children?: MenuEntry[];
}
export type MenuEntry = MenuItem | "separator";

let menu: { x: number; y: number; items: MenuEntry[] } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function closeContextMenu() {
  menu = null;
  emit();
}

/**
 * Right-click handler for desktop (mouse/trackpad). On touch screens a long press also fires
 * `contextmenu`, which would fight with long-press dragging, so it is left alone there.
 */
export function contextMenu(items: () => MenuEntry[]) {
  return (e: MouseEvent) => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    e.preventDefault();
    e.stopPropagation();
    menu = { x: e.clientX, y: e.clientY, items: items() };
    emit();
  };
}

function useMenu() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => menu,
    () => null,
  );
}

function List({ items, x, y, onPicked }: { items: MenuEntry[]; x: number; y: number; onPicked: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<number | null>(null);
  const [sub, setSub] = useState<{ x: number; y: number } | null>(null);

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
     
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);

  return (
    <div ref={ref} className="ctx-menu" role="menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === "separator" ? (
          <div key={i} className="ctx-sep" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`ctx-item ${it.danger ? "danger" : ""} ${open === i ? "open" : ""}`}
            disabled={it.disabled}
            onMouseEnter={(e) => {
              if (!it.children) return setOpen(null);
              const r = e.currentTarget.getBoundingClientRect();
              setOpen(i);
              setSub({ x: r.right + 2, y: r.top - 5 });
            }}
            onClick={() => {
              if (it.children) {
                const r = (document.activeElement as HTMLElement | null)?.getBoundingClientRect();
                setOpen(open === i ? null : i);
                if (r) setSub({ x: r.right + 2, y: r.top - 5 });
                return;
              }
              it.onSelect?.();
              onPicked();
            }}
          >
            <span className="ctx-icon">
              {it.checked ? <Check /> : it.dot ? <i style={{ background: it.dot }} /> : it.icon}
            </span>
            <span className="ctx-label">{it.label}</span>
            {it.children && <ChevronRight className="ctx-more" />}
          </button>
        ),
      )}
      {open != null && sub && typeof items[open] === "object" && (items[open] as MenuItem).children && (
        <List items={(items[open] as MenuItem).children!} x={sub.x} y={sub.y} onPicked={onPicked} />
      )}
    </div>
  );
}

/** Renders the open context menu; mounted once in the app shell. */
export function ContextMenuHost() {
  const m = useMenu();
  useEffect(() => {
    if (!m) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeContextMenu();
    const onDown = (e: PointerEvent) => !(e.target as HTMLElement).closest(".ctx-menu") && closeContextMenu();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("resize", closeContextMenu);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("resize", closeContextMenu);
    };
  }, [m]);
  if (!m) return null;
  return <List key={`${m.x}:${m.y}`} items={m.items} x={m.x} y={m.y} onPicked={closeContextMenu} />;
}
