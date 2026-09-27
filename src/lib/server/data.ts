import "server-only";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db, schema } from "@/db";
import type { Op, Settings, Snapshot } from "@/lib/shared/types";
import { deleteObject } from "./s3";

const {
  songs,
  repertoireEntries: entries,
  resources,
  tags,
  repertoireTags,
  playEvents,
  attachments,
  appSettings,
  jamTracks,
  jamPlays,
} = schema;

const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
const isoReq = (v: string) => new Date(v).toISOString();

export async function loadSnapshot(): Promise<Snapshot> {
  const d = db();
  const [s, e, r, t, et, p, a, st, jt, jp] = await d.batch([
    d.select().from(songs),
    d.select().from(entries),
    d.select().from(resources),
    d.select().from(tags),
    d.select().from(repertoireTags),
    d.select().from(playEvents),
    d.select().from(attachments),
    d.select().from(appSettings),
    d.select().from(jamTracks),
    d.select().from(jamPlays),
  ]);
  const settings: Settings = {};
  for (const row of st) settings[row.key] = row.value;
  return {
    songs: s.map((x) => ({ ...x, createdAt: isoReq(x.createdAt), updatedAt: isoReq(x.updatedAt) })),
    entries: e.map((x) => ({
      ...x,
      instrument: x.instrument as Snapshot["entries"][number]["instrument"],
      status: x.status as Snapshot["entries"][number]["status"],
      lastPlayedAt: iso(x.lastPlayedAt),
      createdAt: isoReq(x.createdAt),
      updatedAt: isoReq(x.updatedAt),
    })),
    resources: r.map((x) => ({
      ...x,
      type: x.type as Snapshot["resources"][number]["type"],
      provider: x.provider as Snapshot["resources"][number]["provider"],
      metaStatus: x.metaStatus as Snapshot["resources"][number]["metaStatus"],
      createdAt: isoReq(x.createdAt),
      updatedAt: isoReq(x.updatedAt),
    })),
    tags: t.map((x) => ({ ...x, createdAt: isoReq(x.createdAt) })),
    entryTags: et,
    playEvents: p.map((x) => ({ ...x, playedAt: isoReq(x.playedAt) })),
    attachments: a.map((x) => ({
      ...x,
      type: x.type as Snapshot["attachments"][number]["type"],
      createdAt: isoReq(x.createdAt),
    })),
    jamTracks: jt.map((x) => ({
      ...x,
      metaStatus: x.metaStatus as Snapshot["jamTracks"][number]["metaStatus"],
      lastPlayedAt: iso(x.lastPlayedAt),
      createdAt: isoReq(x.createdAt),
      updatedAt: isoReq(x.updatedAt),
    })),
    jamPlays: jp.map((x) => ({ ...x, playedAt: isoReq(x.playedAt) })),
    settings,
  };
}

function recomputeJam(trackId: string): Query {
  return db()
    .update(jamTracks)
    .set({
      playCount: sql`(select count(*)::int from ${jamPlays} where ${jamPlays.trackId} = ${trackId})`,
      lastPlayedAt: sql`(select max(${jamPlays.playedAt}) from ${jamPlays} where ${jamPlays.trackId} = ${trackId})`,
    })
    .where(eq(jamTracks.id, trackId));
}

type Query = BatchItem<"pg">;

function recomputePlays(entryId: string): Query {
  return db()
    .update(entries)
    .set({
      playCount: sql`(select count(*)::int from ${playEvents} where ${playEvents.repertoireEntryId} = ${entryId})`,
      lastPlayedAt: sql`(select max(${playEvents.playedAt}) from ${playEvents} where ${playEvents.repertoireEntryId} = ${entryId})`,
    })
    .where(eq(entries.id, entryId));
}

/** Translates one op into SQL statements. Every op is idempotent so retries from the offline queue are safe. */
async function opToQueries(op: Op, afterCommit: (() => Promise<void>)[]): Promise<Query[]> {
  const d = db();
  const now = new Date().toISOString();
  switch (op.t) {
    case "song.upsert": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, ...rest } = op.song;
      return [
        d.insert(songs)
          .values({ ...op.song, updatedAt: now })
          .onConflictDoUpdate({ target: songs.id, set: { ...rest, updatedAt: now } }),
      ];
    }
    case "entry.upsert": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, playCount, lastPlayedAt, ...rest } = op.entry;
      return [
        d.insert(entries)
          .values({ ...rest, id, createdAt, playCount: 0, lastPlayedAt: null, updatedAt: now })
          .onConflictDoUpdate({ target: entries.id, set: { ...rest, updatedAt: now } }),
        recomputePlays(id),
      ];
    }
    case "entry.delete": {
      const files = await d
        .select({ key: attachments.storageKey })
        .from(attachments)
        .where(eq(attachments.repertoireEntryId, op.id));
      afterCommit.push(async () => {
        await Promise.all(files.map((f) => deleteObject(f.key)));
      });
      return [
        d.delete(entries).where(eq(entries.id, op.id)),
        d.delete(songs).where(
          notExists(d.select({ one: sql`1` }).from(entries).where(eq(entries.songId, songs.id))),
        ),
      ];
    }
    case "resource.upsert": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, ...rest } = op.resource;
      return [
        d.insert(resources)
          .values({ ...op.resource, updatedAt: now })
          .onConflictDoUpdate({ target: resources.id, set: { ...rest, updatedAt: now } }),
      ];
    }
    case "resource.delete":
      return [d.delete(resources).where(eq(resources.id, op.id))];
    case "resource.reorder":
      return op.ids.map((id, i) =>
        d.update(resources)
          .set({ sortOrder: i })
          .where(and(eq(resources.id, id), eq(resources.repertoireEntryId, op.entryId))),
      );
    case "resource.setPrimary": {
      const [target] = await d.select().from(resources).where(eq(resources.id, op.id)).limit(1);
      if (!target) return [];
      return [
        d.update(resources)
          .set({ isPrimary: sql`${resources.id} = ${op.id}` })
          .where(and(eq(resources.repertoireEntryId, target.repertoireEntryId), eq(resources.type, target.type))),
      ];
    }
    case "tag.upsert": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, ...rest } = op.tag;
      return [d.insert(tags).values(op.tag).onConflictDoUpdate({ target: tags.id, set: rest })];
    }
    case "tag.delete":
      return [d.delete(tags).where(eq(tags.id, op.id))];
    case "entry.setTags": {
      const qs: Query[] = [d.delete(repertoireTags).where(eq(repertoireTags.repertoireEntryId, op.entryId))];
      if (op.tagIds.length) {
        const existing = await d.select({ id: tags.id }).from(tags).where(inArray(tags.id, op.tagIds));
        if (existing.length) {
          qs.push(
            d.insert(repertoireTags)
              .values(existing.map((t) => ({ repertoireEntryId: op.entryId, tagId: t.id })))
              .onConflictDoNothing(),
          );
        }
      }
      return qs;
    }
    case "play.add":
      return [
        d.insert(playEvents).values(op.event).onConflictDoNothing(),
        recomputePlays(op.event.repertoireEntryId),
      ];
    case "play.delete":
      return [d.delete(playEvents).where(eq(playEvents.id, op.id)), recomputePlays(op.entryId)];
    case "attachment.upsert": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, ...rest } = op.attachment;
      return [
        d.insert(attachments)
          .values(op.attachment)
          .onConflictDoUpdate({ target: attachments.id, set: { label: rest.label, filename: rest.filename } }),
      ];
    }
    case "attachment.delete": {
      const [row] = await d.select().from(attachments).where(eq(attachments.id, op.id)).limit(1);
      if (row) afterCommit.push(() => deleteObject(row.storageKey));
      return [d.delete(attachments).where(eq(attachments.id, op.id))];
    }
    case "jam.upsert": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, playCount, lastPlayedAt, ...rest } = op.track;
      return [
        d.insert(jamTracks)
          .values({ ...rest, id, createdAt, playCount: 0, lastPlayedAt: null, updatedAt: now })
          .onConflictDoUpdate({ target: jamTracks.id, set: { ...rest, updatedAt: now } }),
        recomputeJam(id),
      ];
    }
    case "jam.delete":
      return [d.delete(jamTracks).where(eq(jamTracks.id, op.id))];
    case "jamPlay.add":
      return [d.insert(jamPlays).values(op.play).onConflictDoNothing(), recomputeJam(op.play.trackId)];
    case "jamPlay.delete":
      return [d.delete(jamPlays).where(eq(jamPlays.id, op.id)), recomputeJam(op.trackId)];
    case "setting.set":
      return [
        d.insert(appSettings)
          .values({ key: op.key, value: op.value, updatedAt: now })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: op.value, updatedAt: now } }),
      ];
  }
}

async function runBatch(queries: Query[]) {
  if (!queries.length) return;
  await db().batch(queries as [Query, ...Query[]]);
}

export interface ApplyResult {
  applied: number;
  failed: { index: number; t: string; error: string }[];
}

/**
 * Applies ops atomically in one batch. If the batch fails (e.g. an op references a
 * row deleted on another device), it falls back to one-by-one so a single bad op
 * cannot block the whole offline queue forever.
 */
export async function applyOps(ops: Op[]): Promise<ApplyResult> {
  const afterCommit: (() => Promise<void>)[] = [];
  const perOp: Query[][] = [];
  for (const op of ops) perOp.push(await opToQueries(op, afterCommit));
  try {
    await runBatch(perOp.flat());
    await Promise.all(afterCommit.map((f) => f()));
    return { applied: ops.length, failed: [] };
  } catch (batchErr) {
    console.warn("Batch failed, retrying ops individually", batchErr);
  }
  const failed: ApplyResult["failed"] = [];
  let applied = 0;
  for (let i = 0; i < ops.length; i++) {
    try {
      await runBatch(perOp[i]);
      applied++;
    } catch (err) {
      failed.push({ index: i, t: ops[i].t, error: err instanceof Error ? err.message : String(err) });
    }
  }
  await Promise.all(afterCommit.map((f) => f()));
  return { applied, failed };
}
