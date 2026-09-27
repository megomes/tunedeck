import { NextResponse } from "next/server";
import { withSession } from "@/lib/server/auth";
import { enrichUrl } from "@/lib/server/enrich";

export const POST = withSession(async (req) => {
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : null;
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  try {
    const meta = await enrichUrl(url);
    if (!meta) return NextResponse.json({ error: "No metadata" }, { status: 404 });
    return NextResponse.json(meta);
  } catch (err) {
    console.error("enrich failed", err);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 502 });
  }
});
