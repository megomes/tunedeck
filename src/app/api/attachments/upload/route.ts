import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { presignUpload, storageConfigured } from "@/lib/server/s3";

const MAX_BYTES = 50 * 1024 * 1024;

/** Returns a presigned PUT URL so the browser uploads straight to Neon Object Storage. */
export const POST = withSession(async (req) => {
  if (!storageConfigured()) return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const { entryId, filename, contentType, size } = body ?? {};
  if (typeof entryId !== "string" || typeof filename !== "string" || typeof size !== "number") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 50 MB" }, { status: 413 });
  const lower = filename.toLowerCase();
  const type = lower.endsWith(".pdf") ? "pdf" : /\.(mid|midi)$/.test(lower) ? "midi" : null;
  if (!type) return NextResponse.json({ error: "Only PDF and MIDI files are supported" }, { status: 415 });

  const id = randomUUID();
  const safe = filename.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const storageKey = `entries/${entryId}/${id}/${safe}`;
  const ct = typeof contentType === "string" && contentType ? contentType : type === "pdf" ? "application/pdf" : "audio/midi";
  const uploadUrl = await presignUpload(storageKey, ct);
  return NextResponse.json({ id, type, storageKey, uploadUrl, contentType: ct });
});
