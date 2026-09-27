"use client";

import { Music2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { initials } from "@/lib/client/format";

export function Thumb({
  src,
  title,
  className,
  children,
}: {
  src: string | null | undefined;
  title: string;
  className?: string;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = src && failed !== src;
  return (
    <div className={`thumb ${className ?? ""}`}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />
      ) : (
        <div className="thumb-fallback" aria-hidden>
          <Music2 />
          <span className="initials">{initials(title)}</span>
        </div>
      )}
      {children}
    </div>
  );
}
