// Syncs the "Guitar v2" YouTube playlist into the TuneDeck backlog through the app's own API.
//
//   node scripts/playlist-sync.mjs login           Asks for the access code once, saves a session in .env.sync
//   node scripts/playlist-sync.mjs new [out.json]  Playlist videos that are not in TuneDeck yet + the existing songs
//   node scripts/playlist-sync.mjs apply plan.json Adds the songs/covers described in plan.json
//
// plan.json: [{ "title": "Scar Tissue", "artist": "Red Hot Chili Peppers", "entryId"?: "...",
//               "videos": [{ "id": "xVphdYl6JxQ", "type"?: "guitar_cover" }] }]
// Without entryId, an existing guitar entry with the same title + artist is reused, otherwise a new
// song lands at the top of Backlog. Video titles, channels and durations come from the playlist.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const PLAYLIST = "https://www.youtube.com/playlist?list=PL8HBPDLAQBBLEmOYUdEWoRgUycSotH2KB";
const ENV_FILE = path.join(import.meta.dirname, "..", ".env.sync");
const STATUS = "BACKLOG";

function readEnv() {
  const env = {};
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return {
    server: (process.env.TUNEDECK_SERVER || env.TUNEDECK_SERVER || "https://tunedeck.vercel.app").replace(/\/$/, ""),
    token: process.env.TUNEDECK_TOKEN || env.TUNEDECK_TOKEN || null,
  };
}

/** Reads a secret from the terminal without echoing it. Pasted text keeps no bracketed-paste markers. */
function askSecret(question) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    const rl = readline.createInterface({ input: stdin });
    stdout.write(question);
    return new Promise((resolve) => rl.once("line", (a) => (rl.close(), resolve(a.trim()))));
  }
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const clean = chunk.replace(/\x1b\[[0-9;]*[~A-Za-z]/g, "");
      for (const ch of clean) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(value.trim());
        }
        if (ch === "\x03") {
          stdin.setRawMode(false);
          return reject(new Error("Cancelled."));
        }
        if (ch === "\x7f" || ch === "\b") {
          if (value) (value = value.slice(0, -1)), stdout.write("\b \b");
        } else if (ch >= " ") {
          value += ch;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function api(pathname, init = {}) {
  const { server, token } = readEnv();
  if (!token) throw new Error("Not signed in: run `node scripts/playlist-sync.mjs login` first.");
  const res = await fetch(server + pathname, {
    ...init,
    headers: { ...init.headers, cookie: `td_session=${token}`, "content-type": "application/json" },
  });
  if (res.status === 401) throw new Error("Session expired or revoked: run `node scripts/playlist-sync.mjs login` again.");
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function login() {
  const { server } = readEnv();
  const code = process.env.TUNEDECK_CODE?.trim() || (await askSecret(`TuneDeck access code (${server}): `));
  if (!code) throw new Error("No access code received.");
  console.log(`Trying a ${code.length}-character code...`);
  const res = await fetch(`${server}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "TuneDeck playlist sync" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status} ${await res.text()}`);
  const token = res.headers.getSetCookie().map((c) => c.match(/^td_session=([^;]+)/)?.[1]).find(Boolean);
  if (!token) throw new Error("Login succeeded but no session cookie came back.");
  fs.writeFileSync(ENV_FILE, `TUNEDECK_SERVER=${server}\nTUNEDECK_TOKEN=${token}\n`, { mode: 0o600 });
  console.log(`Signed in. Session saved in ${path.basename(ENV_FILE)} (git-ignored).`);
}

function playlist() {
  const out = execFileSync("yt-dlp", ["--flat-playlist", "-J", "--no-warnings", PLAYLIST], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const seen = new Set();
  const videos = [];
  for (const e of JSON.parse(out).entries ?? []) {
    if (!e?.id || seen.has(e.id) || /^\[(private|deleted) video\]$/i.test(e.title ?? "")) continue;
    seen.add(e.id);
    videos.push({ id: e.id, title: e.title, channel: e.channel ?? e.uploader ?? null, duration: e.duration ?? null });
  }
  return videos;
}

async function listNew(outFile) {
  const [videos, snap] = await Promise.all([Promise.resolve().then(playlist), api("/api/snapshot")]);
  const known = new Set(snap.resources.filter((r) => r.provider === "youtube").map((r) => r.externalId));
  const songs = new Map(snap.songs.map((s) => [s.id, s]));
  const result = {
    newVideos: videos.filter((v) => !known.has(v.id)),
    songs: snap.entries.map((e) => ({
      entryId: e.id,
      title: songs.get(e.songId)?.title,
      artist: songs.get(e.songId)?.artist,
      instrument: e.instrument,
      status: e.status,
    })),
  };
  const json = JSON.stringify(result, null, 2);
  if (outFile) fs.writeFileSync(outFile, json);
  else console.log(json);
  console.error(`${videos.length} videos in the playlist, ${result.newVideos.length} not in TuneDeck yet.`);
}

const norm = (s) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");

async function apply(planFile) {
  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  const [videos, snap] = await Promise.all([Promise.resolve().then(playlist), api("/api/snapshot")]);
  const byId = new Map(videos.map((v) => [v.id, v]));
  const now = new Date().toISOString();
  const ops = [];
  const entries = [...snap.entries];
  const resources = [...snap.resources];
  // New cards go on top of the column, keeping the plan's order.
  let top = Math.min(0, ...entries.filter((e) => e.status === STATUS).map((e) => e.position)) - plan.length;
  let created = 0;
  let added = 0;

  for (const item of plan) {
    let entry = item.entryId ? entries.find((e) => e.id === item.entryId) : null;
    if (!entry) {
      const song = snap.songs.find((s) => norm(s.title) === norm(item.title) && norm(s.artist) === norm(item.artist));
      entry = song ? entries.find((e) => e.songId === song.id && e.instrument === "guitar") : null;
      if (!entry) {
        const songId = song?.id ?? randomUUID();
        if (!song) {
          ops.push({
            t: "song.upsert",
            song: { id: songId, title: item.title, artist: item.artist ?? "", album: null, genre: null, bpm: null, createdAt: now, updatedAt: now },
          });
        }
        entry = {
          id: randomUUID(), songId, instrument: "guitar", status: STATUS, tuning: null, capo: null, difficulty: null,
          songsterrUrl: null, playCount: 0, lastPlayedAt: null, isFavorite: false, riffOnly: false, position: top++, createdAt: now, updatedAt: now,
        };
        entries.push(entry);
        ops.push({ t: "entry.upsert", entry });
        created++;
      }
    }
    for (const v of item.videos) {
      if (resources.some((r) => r.repertoireEntryId === entry.id && r.externalId === v.id)) continue;
      const meta = byId.get(v.id) ?? {};
      const type = v.type ?? "guitar_cover";
      const same = resources.filter((r) => r.repertoireEntryId === entry.id && r.type === type);
      const resource = {
        id: randomUUID(), repertoireEntryId: entry.id, type, customLabel: v.label ?? null, provider: "youtube",
        url: `https://www.youtube.com/watch?v=${v.id}`, externalId: v.id, title: meta.title ?? null, author: meta.channel ?? null,
        thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, durationSeconds: meta.duration ?? null,
        metaStatus: meta.title && meta.duration != null ? "ok" : "pending", isPrimary: same.length === 0,
        sortOrder: same.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0), createdAt: now, updatedAt: now,
      };
      resources.push(resource);
      ops.push({ t: "resource.upsert", resource });
      added++;
    }
  }

  for (let i = 0; i < ops.length; i += 400) {
    await api("/api/ops", { method: "POST", body: JSON.stringify({ ops: ops.slice(i, i + 400) }) });
  }
  console.log(`Done: ${created} new songs in ${STATUS}, ${added} videos added.`);
}

const [cmd, arg] = process.argv.slice(2);
const run = { login, new: () => listNew(arg), apply: () => apply(arg) }[cmd];
if (!run) {
  console.error("Usage: node scripts/playlist-sync.mjs login | new [out.json] | apply plan.json");
  process.exit(1);
}
run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
