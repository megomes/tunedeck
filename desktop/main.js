// TuneDeck desktop: downloads the library's YouTube videos (yt-dlp), makes standard-tuning
// copies (ffmpeg + Rubber Band) and sends them to phones/tablets over the local network.
// The window's renderer holds the WebRTC connections; this process does everything else.

const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { findTabs } = require("./songsterr");

// Your TuneDeck deployment: typed on the sign-in screen, or preset with TUNEDECK_SERVER.
const DEFAULT_SERVER = process.env.TUNEDECK_SERVER || "";
const POLL_MS = 4000;

// Expose real LAN addresses in ICE candidates so phones on the same Wi-Fi can reach this PC.
app.commandLine.appendSwitch("disable-features", "WebRtcHideLocalIpsWithMdns");

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let tray = null;
let quitting = false;

// ---------- Config ----------

const configPath = () => path.join(app.getPath("userData"), "config.json");
let config = { server: DEFAULT_SERVER, token: null, pcId: null, name: os.hostname() };

function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
  } catch {
    /* first run */
  }
  if (!config.pcId) {
    config.pcId = crypto.randomUUID();
    saveConfig();
  }
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

const videosDir = () => path.join(app.getPath("videos"), "TuneDeck");

// ---------- UI state pushed to the window ----------

const status = {
  signedIn: false,
  online: false,
  server: DEFAULT_SERVER,
  error: null,
  tools: { ytdlp: null, ffmpeg: null, rubberband: false, claude: null, checked: false },
  library: { count: 0, bytes: 0, dir: "" },
  jobs: [],
  openAtLogin: false,
};

function push() {
  status.version = app.getVersion();
  status.server = config.server;
  status.name = config.name;
  status.signedIn = Boolean(config.token);
  status.openAtLogin = app.getLoginItemSettings().openAtLogin;
  win?.webContents.send("status", status);
  tray?.setToolTip(trayTip());
}

function trayTip() {
  const active = status.jobs.filter((j) => j.state === "downloading" || j.state === "processing");
  if (active.length) return `TuneDeck — ${active[0].title} (${Math.round(active[0].progress * 100)}%)`;
  return status.online ? "TuneDeck — ready for your phone and tablet" : "TuneDeck";
}

// ---------- Window & tray ----------

function createWindow() {
  win = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 420,
    minHeight: 480,
    title: "TuneDeck",
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    show: !process.argv.includes("--hidden"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Transfers keep running while the window sits in the tray.
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
  win.webContents.on("did-finish-load", push);
  // Phone connection diagnostics from the window go to webrtc.log (kept short).
  win.webContents.on("console-message", (e, _level, legacyMessage) => {
    const message = e.message ?? legacyMessage;
    if (!message?.startsWith("[webrtc]")) return;
    const file = path.join(app.getPath("userData"), "webrtc.log");
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.renameSync(file, file + ".old");
      fs.appendFileSync(file, `${new Date().toISOString()} ${message.slice(9)}\n`);
    } catch {
      /* diagnostics only */
    }
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "tray.png")));
  tray.setToolTip("TuneDeck");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open TuneDeck", click: showWindow },
      { label: "Open videos folder", click: () => shell.openPath(ensureDir(videosDir())) },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", showWindow);
}

app.on("second-instance", showWindow);
app.on("before-quit", () => {
  quitting = true;
});
app.on("window-all-closed", (e) => e.preventDefault());

// ---------- Server API ----------

async function apiFetch(pathname, init = {}) {
  const res = await fetch(new URL(pathname, config.server), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(config.token ? { Cookie: `td_session=${config.token}` } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 && config.token) {
    config.token = null;
    saveConfig();
    status.online = false;
    status.error = "Signed out. Enter your access code again.";
    push();
  }
  return res;
}

ipcMain.handle("login", async (_e, { server, code }) => {
  try {
    if (!server && !DEFAULT_SERVER) return { ok: false, error: "Enter the address of your TuneDeck server" };
    const base = new URL(server || DEFAULT_SERVER).origin;
    const res = await fetch(new URL("/api/auth/login", base), {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": `TuneDeck Desktop (${os.hostname()})` },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? `Sign-in failed (${res.status})` };
    }
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("td_session="));
    const token = cookie?.split(";")[0].slice("td_session=".length);
    if (!token) return { ok: false, error: "The server did not return a session" };
    config = { ...config, server: base, token };
    saveConfig();
    status.error = null;
    push();
    void poll();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Can't reach the server: ${err.message}` };
  }
});

ipcMain.handle("logout", () => {
  config.token = null;
  saveConfig();
  status.online = false;
  push();
});

let pollTimer = null;
async function poll() {
  clearTimeout(pollTimer);
  if (config.token) {
    try {
      const res = await apiFetch("/api/desktop", {
        method: "POST",
        body: JSON.stringify({ poll: { id: config.pcId, name: config.name } }),
      });
      if (res.ok) {
        const { offers } = await res.json();
        if (!status.online || status.error) {
          status.online = true;
          status.error = null;
          push();
        }
        for (const offer of offers ?? []) win?.webContents.send("offer", offer);
      } else if (res.status !== 401) {
        status.online = false;
        status.error = `Server error (${res.status})`;
        push();
      }
    } catch (err) {
      if (status.online || !status.error) {
        status.online = false;
        status.error = `Offline: ${err.cause?.code ?? err.message}`;
        push();
      }
    }
  }
  pollTimer = setTimeout(poll, POLL_MS);
}

ipcMain.handle("answer", async (_e, { sid, sdp }) => {
  const res = await apiFetch("/api/desktop/answer", { method: "POST", body: JSON.stringify({ sid, sdp }) });
  return res.ok;
});

// ---------- Tools ----------

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: String(stdout), stderr: String(stderr) }),
    );
  });
}

async function checkTools() {
  const [y, f, filters, c] = await Promise.all([
    run("yt-dlp", ["--version"]),
    run("ffmpeg", ["-hide_banner", "-version"]),
    run("ffmpeg", ["-hide_banner", "-filters"]),
    run("claude", ["--version"]),
  ]);
  status.tools = {
    ytdlp: y.ok ? y.stdout.trim() : null,
    ffmpeg: f.ok ? (f.stdout.match(/ffmpeg version (\S+)/)?.[1] ?? "ok") : null,
    rubberband: filters.ok && /\brubberband\b/.test(filters.stdout),
    claude: c.ok ? c.stdout.trim().split(/\s/)[0] : null,
    checked: true,
  };
  push();
}

ipcMain.handle("recheck-tools", checkTools);

// ---------- Library on this PC ----------

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const VIDEO_ID = /^[\w-]{6,20}$/;
const fileFor = (videoId, semitones) => path.join(videosDir(), `${videoId}.${semitones}.mp4`);

function scanLibrary() {
  let count = 0;
  let bytes = 0;
  try {
    for (const f of fs.readdirSync(videosDir())) {
      if (!/\.-?\d+\.mp4$/.test(f)) continue;
      count++;
      bytes += fs.statSync(path.join(videosDir(), f)).size;
    }
  } catch {
    /* not created yet */
  }
  status.library = { count, bytes, dir: videosDir() };
}

ipcMain.handle("open-folder", () => shell.openPath(ensureDir(videosDir())));
ipcMain.handle("set-open-at-login", (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(on), args: ["--hidden"] });
  push();
});

ipcMain.handle("file-info", (_e, { videoId, semitones }) => {
  if (!VIDEO_ID.test(videoId) || !Number.isInteger(semitones)) return null;
  try {
    const p = fileFor(videoId, semitones);
    return { path: p, size: fs.statSync(p).size };
  } catch {
    return null;
  }
});

// ---------- Download & tuning queue ----------
// One job per YouTube video; it downloads the original once, then renders each requested
// semitone variant. Two jobs run at once: enough to keep the Wi-Fi busy, few enough that
// YouTube doesn't throttle us. Sending to phones happens in parallel (renderer).

const WORKERS = 2;
const jobs = new Map(); // videoId -> job
const queue = [];
let working = 0;

function jobView(job) {
  return {
    videoId: job.videoId,
    title: job.title,
    state: job.state,
    progress: job.progress,
    step: job.step,
    error: job.error,
    variants: [...job.variants],
  };
}

function setJob(job, patch) {
  Object.assign(job, patch);
  status.jobs = [...jobs.values()].map(jobView);
  // Progress events are frequent; the window only needs a few per second.
  const now = Date.now();
  if (patch.state || now - (job.lastPush ?? 0) > 200) {
    job.lastPush = now;
    push();
    win?.webContents.send("job", jobView(job));
  }
}

/** Resolves when every requested variant of the video exists on disk. */
ipcMain.handle("ensure", async (_e, item) => {
  const { videoId, semitones, title } = item;
  if (!VIDEO_ID.test(videoId) || !Number.isInteger(semitones) || Math.abs(semitones) > 12) {
    return { ok: false, error: "Invalid video" };
  }
  if (fs.existsSync(fileFor(videoId, semitones))) return { ok: true };
  let job = jobs.get(videoId);
  if (!job || job.state === "done" || job.state === "error") {
    job = { videoId, title: title || videoId, state: "queued", progress: 0, step: "", error: null, variants: new Set(), waiters: [] };
    jobs.set(videoId, job);
    queue.push(job);
  }
  job.variants.add(semitones);
  if (job.title === videoId && title) job.title = title;
  setJob(job, { state: job.state });
  const p = new Promise((resolve) => job.waiters.push({ semitones, resolve }));
  for (let i = working; i < WORKERS; i++) void work();
  return p;
});

async function work() {
  if (working >= WORKERS) return;
  working++;
  try {
    while (queue.length) {
      const job = queue.shift();
      try {
        await runJob(job);
        setJob(job, { state: "done", progress: 1, step: "Ready" });
        for (const w of job.waiters) w.resolve({ ok: true });
      } catch (err) {
        console.error(job.videoId, err);
        setJob(job, { state: "error", error: String(err.message ?? err).slice(0, 300) });
        for (const w of job.waiters) {
          w.resolve(fs.existsSync(fileFor(job.videoId, w.semitones)) ? { ok: true } : { ok: false, error: job.error });
        }
      }
      job.waiters = [];
      scanLibrary();
      push();
    }
  } finally {
    working--;
  }
}

async function runJob(job) {
  ensureDir(videosDir());
  const original = fileFor(job.videoId, 0);
  if (!fs.existsSync(original)) {
    if (!status.tools.ytdlp) throw new Error("yt-dlp was not found. Install it and press Check again.");
    if (!status.tools.ffmpeg) throw new Error("ffmpeg was not found. Install it and press Check again.");
    const src = await download(job);
    await normalize(job, src, original);
    fs.rmSync(src, { force: true });
  }
  // Variants requested while this job was running are picked up by the loop.
  for (let i = 0; i < 20; i++) {
    const todo = [...job.variants].filter((s) => s !== 0 && !fs.existsSync(fileFor(job.videoId, s)));
    if (!todo.length) break;
    if (!status.tools.rubberband) throw new Error("This ffmpeg build has no Rubber Band filter, so it can't change the tuning.");
    await transpose(job, original, todo[0]);
  }
}

function spawnLogged(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let tail = "";
    const feed = (buf) => {
      const text = buf.toString();
      tail = (tail + text).slice(-2000);
      for (const line of text.split(/\r?\n|\r/)) if (line.trim()) onLine(line);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(errorFrom(tail) || `${cmd} exited with ${code}`))));
  });
}

/** The line that explains a failure, without tool noise like Python deprecation notices. */
function errorFrom(output) {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^Deprecated Feature/i.test(l));
  return lines.find((l) => l.startsWith("ERROR")) ?? lines.slice(-2).join(" ");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// YouTube sometimes asks yt-dlp to "sign in to confirm you're not a bot". When it does, use the
// YouTube session of a browser on this PC for the rest of the run. Firefox comes first because
// Chrome and Edge lock their cookies on Windows. TUNEDECK_COOKIES_BROWSER picks one explicitly.
const BOT_CHECK = /confirm you.re not a bot|Sign in to confirm/i;
let cookiesBrowser = null;

function pickCookiesBrowser() {
  if (process.env.TUNEDECK_COOKIES_BROWSER) return process.env.TUNEDECK_COOKIES_BROWSER;
  const local = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    ["firefox", path.join(process.env.APPDATA ?? "", "Mozilla", "Firefox", "Profiles")],
    ["edge", path.join(local, "Microsoft", "Edge", "User Data")],
    ["chrome", path.join(local, "Google", "Chrome", "User Data")],
    ["brave", path.join(local, "BraveSoftware", "Brave-Browser", "User Data")],
  ];
  return candidates.find(([, dir]) => fs.existsSync(dir))?.[0] ?? null;
}

const cookieArgs = () => (cookiesBrowser ? ["--cookies-from-browser", cookiesBrowser] : []);

/** After a bot check, switches yt-dlp to browser cookies. True when there is something new to try. */
function useCookiesAfter(err) {
  if (cookiesBrowser || !BOT_CHECK.test(err?.message ?? "")) return false;
  cookiesBrowser = pickCookiesBrowser();
  return Boolean(cookiesBrowser);
}

function botCheckHelp(err) {
  if (!BOT_CHECK.test(err?.message ?? "")) return err;
  return new Error(
    cookiesBrowser
      ? `YouTube asked to confirm you're not a bot, even with ${cookiesBrowser}'s cookies. Open youtube.com in ${cookiesBrowser}, sign in, and try again.`
      : "YouTube asked to confirm you're not a bot. Sign in to YouTube in Firefox on this PC and try again.",
  );
}

// YouTube sometimes answers 403 for a while (expired links, throttling). Try again with a fresh
// extraction, and as a last resort take the 360p single-file format, which is rarely blocked.
const BEST = "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b";
const ATTEMPTS = [
  { wait: 0, format: BEST, step: "Downloading from YouTube" },
  { wait: 8_000, format: BEST, step: "Retrying download" },
  { wait: 20_000, format: "18/b[ext=mp4]/b", step: "Retrying in lower quality (360p)" },
];

async function download(job) {
  let lastError = null;
  for (const attempt of ATTEMPTS) {
    if (attempt.wait) {
      const why = /403/.test(lastError?.message ?? "") ? "YouTube refused (403)" : "Download failed";
      setJob(job, { state: "downloading", progress: 0, step: `${why}, trying again…` });
      await sleep(attempt.wait);
    }
    try {
      return await downloadOnce(job, attempt.format, attempt.step);
    } catch (err) {
      if (useCookiesAfter(err)) {
        try {
          return await downloadOnce(job, attempt.format, `Downloading with ${cookiesBrowser}'s YouTube sign-in`);
        } catch (retryErr) {
          err = retryErr;
        }
      }
      lastError = err;
      if (BOT_CHECK.test(err.message)) break;
    }
  }
  throw botCheckHelp(lastError);
}

async function downloadOnce(job, format, step) {
  const tmp = ensureDir(path.join(videosDir(), ".tmp"));
  for (const f of fs.readdirSync(tmp)) if (f.startsWith(`${job.videoId}.src`)) fs.rmSync(path.join(tmp, f), { force: true });
  setJob(job, { state: "downloading", progress: 0, step });
  let stream = -1;
  let final = null;
  await spawnLogged(
    "yt-dlp",
    [
      ...cookieArgs(),
      "--newline",
      "--no-playlist",
      "--no-mtime",
      "--retries",
      "5",
      "--fragment-retries",
      "5",
      // H.264 + AAC up to 720p plays on every phone and tablet without re-encoding.
      "-f",
      format,
      "--merge-output-format",
      "mp4",
      "-o",
      path.join(tmp, `${job.videoId}.src.%(ext)s`),
      "--print",
      "after_move:filepath",
      `https://www.youtube.com/watch?v=${job.videoId}`,
    ],
    (line) => {
      if (/\[download\] Destination:/.test(line)) stream++;
      const m = line.match(/\[download\]\s+([\d.]+)%/);
      if (m) {
        const p = Number(m[1]) / 100;
        // Video stream first (most of the bytes), then audio.
        setJob(job, { progress: stream <= 0 ? p * 0.85 : 0.85 + p * 0.15 });
      }
      if (!line.startsWith("[") && line.endsWith(".mp4") && fs.existsSync(line.trim())) final = line.trim();
    },
  );
  if (!final) {
    const found = fs.readdirSync(tmp).find((f) => f.startsWith(`${job.videoId}.src`) && !f.endsWith(".part"));
    if (!found) throw new Error("yt-dlp finished without a file");
    final = path.join(tmp, found);
  }
  return final;
}

async function probe(file) {
  const r = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,height:format=duration",
    "-of", "json",
    file,
  ]);
  if (!r.ok) throw new Error("ffprobe failed");
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  return { vcodec: v?.codec_name, acodec: a?.codec_name, height: v?.height, duration: Number(j.format?.duration) || 0 };
}

async function ffmpeg(job, args, duration, step) {
  setJob(job, { state: "processing", progress: 0, step });
  await spawnLogged("ffmpeg", ["-hide_banner", "-y", "-nostats", "-progress", "pipe:1", ...args], (line) => {
    const m = line.match(/^out_time_us=(\d+)/);
    if (m && duration > 0) setJob(job, { progress: Math.min(1, Number(m[1]) / 1e6 / duration) });
  });
}

/** Makes an mp4 every device can play (H.264/AAC) with the index up front for instant seeking. */
async function normalize(job, src, dest) {
  const info = await probe(src);
  const tmp = `${dest}.tmp.mp4`;
  const video = info.vcodec === "h264" ? ["-c:v", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-vf", "scale=-2:'min(720,ih)'"];
  const audio = info.acodec === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k"];
  await ffmpeg(job, ["-i", src, "-map", "0:v:0", "-map", "0:a:0", ...video, ...audio, "-movflags", "+faststart", tmp], info.duration, info.vcodec === "h264" ? "Preparing video" : "Converting video");
  fs.renameSync(tmp, dest);
}

/** Pitch-shifts the audio (Rubber Band, tempo untouched) and copies the video stream as is. */
async function transpose(job, original, semitones) {
  const info = await probe(original);
  const dest = fileFor(job.videoId, semitones);
  const tmp = `${dest}.tmp.mp4`;
  const ratio = Math.pow(2, semitones / 12).toFixed(10);
  await ffmpeg(
    job,
    [
      "-i", original,
      "-map", "0:v:0", "-map", "0:a:0",
      "-c:v", "copy",
      "-af", `rubberband=pitch=${ratio}:pitchq=quality:channels=together`,
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      tmp,
    ],
    info.duration,
    `Tuning ${semitones > 0 ? "up" : "down"} ${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? "" : "s"}`,
  );
  fs.renameSync(tmp, dest);
}

// ---------- Playlist sync ----------
// A phone asks for it: read a YouTube playlist of covers, let Claude Code (installed on this PC)
// turn the new videos' titles into songs, and add them to the Backlog through the server API.

let playlistRun = null;

function sendPlaylist(update) {
  win?.webContents.send("playlist", update);
}

/** Runs a command with text on stdin and returns stdout. */
function runWithInput(cmd, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, cwd: os.tmpdir() });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd} took too long`));
    }, timeoutMs);
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT" ? new Error(`${cmd} was not found on this computer`) : e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(errorFrom(err || out) || `${cmd} exited with ${code}`));
    });
    child.stdin.end(input);
  });
}

async function playlistVideos(url) {
  const read = () => run("yt-dlp", [...cookieArgs(), "--flat-playlist", "-J", "--no-warnings", url]);
  let r = await read();
  if (!r.ok && useCookiesAfter(new Error(r.stderr))) r = await read();
  if (!r.ok) {
    const why = botCheckHelp(new Error(errorFrom(r.stderr))).message;
    throw new Error(/does not exist/i.test(why) ? "Can't read the playlist: make it Unlisted or Public on YouTube" : why || "yt-dlp failed");
  }
  const seen = new Set();
  const videos = [];
  for (const e of JSON.parse(r.stdout).entries ?? []) {
    if (!e?.id || seen.has(e.id) || /^\[(private|deleted) video\]$/i.test(e.title ?? "")) continue;
    seen.add(e.id);
    videos.push({ id: e.id, title: e.title ?? e.id, channel: e.channel ?? e.uploader ?? null, duration: e.duration ?? null });
  }
  return videos;
}

const PLAN_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    songs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          artist: { type: "string" },
          entryId: { type: ["string", "null"] },
          videos: { type: "array", items: { type: "string" } },
        },
        required: ["title", "artist", "videos"],
      },
    },
  },
  required: ["songs"],
});

/** Asks Claude Code to name the songs: title + original artist, videos of one song grouped. */
async function namePlaylistVideos(videos, existing) {
  const prompt = [
    "These YouTube videos come from a playlist of guitar covers of songs I want to learn. Turn them into songs for my repertoire app.",
    "- Clean names: only the song title and the original artist, properly capitalized. Drop words like Guitar Cover, Tab, Lesson, Solo, Riff, Improv, BEST VERSION, channel names, emojis.",
    "- Videos of the same song (full cover, solo only, riff, lesson) go in ONE song.",
    "- If a song is already in my library (list below), set entryId to its id. Otherwise entryId is null.",
    "- A cover of a famous version keeps the artist named in the video (Little Wing by Stevie Ray Vaughan stays SRV).",
    "- Improvs or the guitarist's own pieces: a short title like \"Slow Blues in C Minor (Improv)\" and the guitarist (channel) as artist.",
    "- Every video id must appear in exactly one song.",
    "",
    "Videos (id | channel | title):",
    ...videos.map((v) => `${v.id} | ${v.channel ?? ""} | ${v.title}`),
    "",
    "Songs already in my library (entryId | artist | title):",
    ...existing.map((s) => `${s.entryId} | ${s.artist} | ${s.title}`),
  ].join("\n");
  const out = await runWithInput(
    "claude",
    ["-p", "--model", "sonnet", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json", "--json-schema", PLAN_SCHEMA],
    prompt,
    5 * 60_000,
  );
  const result = JSON.parse(out);
  if (result.is_error) throw new Error(`Claude Code: ${String(result.result ?? "failed").slice(0, 200)}`);
  const songs = result.structured_output?.songs;
  if (!Array.isArray(songs)) throw new Error("Claude Code did not return the songs");
  // Anything Claude skipped still gets in, under its video title, to be renamed by hand.
  const placed = new Set(songs.flatMap((s) => s.videos));
  for (const v of videos) if (!placed.has(v.id)) songs.push({ title: v.title, artist: v.channel ?? "", entryId: null, videos: [v.id] });
  return songs;
}

async function syncPlaylist(url) {
  if (!config.token) throw new Error("The computer is signed out of TuneDeck");
  sendPlaylist({ state: "running", step: "Reading the playlist" });
  const [videos, snapRes] = await Promise.all([playlistVideos(url), apiFetch("/api/snapshot")]);
  if (!snapRes.ok) throw new Error(`Server error (${snapRes.status})`);
  const snap = await snapRes.json();
  // Videos taken from the playlist before stay handled even if their song was deleted since.
  const seen = Array.isArray(snap.settings?.playlistSeen) ? snap.settings.playlistSeen : [];
  const known = new Set([...seen, ...snap.resources.filter((r) => r.provider === "youtube").map((r) => r.externalId)]);
  const fresh = videos.filter((v) => !known.has(v.id));
  const markSeen = { t: "setting.set", key: "playlistSeen", value: [...new Set([...seen, ...videos.map((v) => v.id)])] };
  if (!fresh.length) {
    if (markSeen.value.length !== seen.length) await apiFetch("/api/ops", { method: "POST", body: JSON.stringify({ ops: [markSeen] }) });
    return { songs: 0, videos: 0, names: [] };
  }

  sendPlaylist({ state: "running", step: `Naming ${fresh.length} new video${fresh.length === 1 ? "" : "s"} with Claude` });
  const songTitles = new Map(snap.songs.map((s) => [s.id, s]));
  const existing = snap.entries
    .filter((e) => e.instrument === "guitar")
    .map((e) => ({ entryId: e.id, title: songTitles.get(e.songId)?.title ?? "", artist: songTitles.get(e.songId)?.artist ?? "" }));
  const plan = await namePlaylistVideos(fresh, existing);

  // Songsterr tab (and tuning) for new songs and for songs that don't have a tab yet.
  sendPlaylist({ state: "running", step: "Finding Songsterr tabs" });
  const entryOf = (song) => (song.entryId ? snap.entries.find((e) => e.id === song.entryId) : null);
  const tabs = await findTabs(plan.filter((song) => !entryOf(song)?.songsterrUrl));

  sendPlaylist({ state: "running", step: "Adding to the Backlog" });
  const byId = new Map(fresh.map((v) => [v.id, v]));
  const now = new Date().toISOString();
  const resources = [...snap.resources];
  const ops = [];
  const names = [];
  let top = Math.min(0, ...snap.entries.filter((e) => e.status === "BACKLOG").map((e) => e.position)) - plan.length;
  let created = 0;
  let added = 0;
  let tabbed = 0;
  for (const song of plan) {
    let entry = entryOf(song);
    const tab = tabs.get(song);
    if (entry && tab) {
      // Only fills what is empty: a tab or tuning picked by hand stays.
      entry = { ...entry, songsterrUrl: tab.url, tuning: entry.tuning ?? tab.tuning, updatedAt: now };
      ops.push({ t: "entry.upsert", entry });
      tabbed++;
    }
    if (!entry) {
      const songId = crypto.randomUUID();
      ops.push({
        t: "song.upsert",
        song: { id: songId, title: song.title.trim(), artist: song.artist.trim(), album: null, genre: null, bpm: null, createdAt: now, updatedAt: now },
      });
      entry = {
        id: crypto.randomUUID(), songId, instrument: "guitar", status: "BACKLOG", tuning: tab?.tuning ?? null, capo: null, difficulty: null,
        songsterrUrl: tab?.url ?? null, playCount: 0, lastPlayedAt: null, isFavorite: false, riffOnly: false, position: top++,
        createdAt: now, updatedAt: now,
      };
      ops.push({ t: "entry.upsert", entry });
      names.push(`${song.title} (${song.artist})`);
      created++;
      if (tab) tabbed++;
    }
    for (const id of song.videos) {
      const v = byId.get(id);
      if (!v || resources.some((r) => r.repertoireEntryId === entry.id && r.externalId === id)) continue;
      const same = resources.filter((r) => r.repertoireEntryId === entry.id && r.type === "guitar_cover");
      const resource = {
        id: crypto.randomUUID(), repertoireEntryId: entry.id, type: "guitar_cover", customLabel: null, provider: "youtube",
        url: `https://www.youtube.com/watch?v=${id}`, externalId: id, title: v.title, author: v.channel,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, durationSeconds: v.duration,
        metaStatus: v.duration != null ? "ok" : "pending", isPrimary: same.length === 0,
        sortOrder: same.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0), createdAt: now, updatedAt: now,
      };
      resources.push(resource);
      ops.push({ t: "resource.upsert", resource });
      added++;
    }
  }
  ops.push(markSeen);
  for (let i = 0; i < ops.length; i += 400) {
    const res = await apiFetch("/api/ops", { method: "POST", body: JSON.stringify({ ops: ops.slice(i, i + 400) }) });
    if (!res.ok) throw new Error(`Server error (${res.status})`);
  }
  return { songs: created, videos: added, tabs: tabbed, names };
}

/** One sync at a time: a second request while one runs waits for the same result. */
ipcMain.handle("playlist-sync", async (_e, { url }) => {
  if (typeof url !== "string" || !/^https:\/\/(www\.|m\.)?youtube\.com\/playlist\?list=[\w-]+/.test(url)) {
    return { ok: false, error: "Not a YouTube playlist link" };
  }
  playlistRun ??= syncPlaylist(url)
    .then((result) => ({ ok: true, ...result }))
    .catch((err) => ({ ok: false, error: String(err.message ?? err).slice(0, 300) }))
    .finally(() => (playlistRun = null));
  return playlistRun;
});

ipcMain.handle("retry", (_e, videoId) => {
  const job = jobs.get(videoId);
  if (!job || job.state !== "error") return;
  jobs.delete(videoId);
  status.jobs = [...jobs.values()].map(jobView);
  push();
});

// ---------- Start ----------

app.whenReady().then(async () => {
  loadConfig();
  if (process.platform === "win32") app.setAppUserModelId("app.tunedeck.desktop");
  createTray();
  createWindow();
  scanLibrary();
  push();
  await checkTools();
  void poll();
});

process.on("uncaughtException", (err) => {
  console.error(err);
  if (!app.isReady()) return;
  dialog.showErrorBox("TuneDeck", String(err.stack ?? err));
});
