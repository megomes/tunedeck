import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { currentSessionId, unauthorized } from "@/lib/server/auth";
import { presignDownload } from "@/lib/server/s3";

/** Redirects to a short-lived signed download URL. */
export async function GET(req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  if (!(await currentSessionId())) return unauthorized();
  const { id } = await ctx.params;
  const [row] = await db().select().from(schema.attachments).where(eq(schema.attachments.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const url = await presignDownload(row.storageKey, row.filename, !download && row.type === "pdf");
  return NextResponse.redirect(url, 302);
}
