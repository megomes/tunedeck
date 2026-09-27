"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { JamForm } from "@/components/JamForm";
import { TopBar } from "@/components/TopBar";

function AddJam() {
  const params = useSearchParams();
  return (
    <>
      <TopBar back title="Add backing track" />
      <div className="container" style={{ maxWidth: 720 }}>
        <JamForm initialUrl={params.get("url")} />
      </div>
    </>
  );
}

export default function AddJamPage() {
  return (
    <Suspense>
      <AddJam />
    </Suspense>
  );
}
