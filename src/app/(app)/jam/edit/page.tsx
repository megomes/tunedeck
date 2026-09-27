"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { JamForm } from "@/components/JamForm";
import { LoadingList } from "@/components/Loading";
import { TopBar } from "@/components/TopBar";
import { useData } from "@/lib/client/store";

function EditJam() {
  const params = useSearchParams();
  const data = useData();
  const track = data.jamTracks.find((t) => t.id === params.get("id"));
  return (
    <>
      <TopBar back title="Backing track" />
      <div className="container" style={{ maxWidth: 720 }}>
        {track ? <JamForm key={track.id} track={track} /> : <LoadingList rows={1} />}
      </div>
    </>
  );
}

export default function EditJamPage() {
  return (
    <Suspense>
      <EditJam />
    </Suspense>
  );
}
