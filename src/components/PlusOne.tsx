"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { playedOnce } from "@/lib/client/actions";

export function PlusOne({ entryId, label = "1" }: { entryId: string; label?: string }) {
  const [pulse, setPulse] = useState(0);
  return (
    <button
      key={pulse}
      className={`plus-one ${pulse ? "pulse" : ""}`}
      aria-label="Played once more"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        playedOnce(entryId);
        setPulse((n) => n + 1);
      }}
    >
      <Plus />
      {label}
    </button>
  );
}
