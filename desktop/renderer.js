// Window: status UI + the WebRTC side. Phones send offers through the TuneDeck server,
// this window answers, and videos then flow directly over the local network.

const api = window.tunedeck;
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CHUNK = 64 * 1024;
const HIGH_WATER = 8 * 1024 * 1024;

let status = null;
/** sid -> connected phone/tablet */
const peers = new Map();

// ---------- Formatting ----------

function size(bytes) {
  if (!bytes) return "0 MB";
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

const JOB_LABEL = { queued: "Waiting", downloading: "Downloading", processing: "Processing", done: "Ready", error: "Failed" };

// ---------- Rendering ----------

let paintQueued = false;
function paint() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    render();
  });
}

function render() {
  if (!status) return;
  const pill = $("#pill");
  pill.textContent = !status.signedIn ? "Signed out" : status.online ? "Online" : "Offline";
  pill.className = `pill ${status.signedIn && status.online ? "ok" : "off"}`;

  $("#login").hidden = status.signedIn;
  $("#main").hidden = !status.signedIn;
  if (!status.signedIn) {
    const server = $("#server");
    if (!server.value) server.value = status.server;
    $("#login-error").textContent = status.error ?? "";
    return;
  }

  $("#conn-error").textContent = status.error ?? "";
  $("#conn-error").hidden = !status.error;

  // Devices
  const list = [...peers.values()];
  $("#devices").innerHTML = list.length
    ? list
        .map((p) => {
          const s = p.sending;
          const pct = s ? Math.round((s.sent / s.size) * 100) : 0;
          const line = !p.connected
            ? "Connecting…"
            : s
              ? `Sending ${esc(s.title)} · ${size(s.sent)} of ${size(s.size)}${p.rate ? ` · ${(p.rate / 1e6).toFixed(1)} MB/s` : ""}`
              : p.queue.length
                ? `${p.queue.length} ready to send`
                : `Connected · ${p.saved} received`;
          return `<div class="item">
            <div class="row"><strong>${esc(p.device)}</strong><span class="muted">${line}</span></div>
            ${s ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}
          </div>`;
        })
        .join("")
    : `<p class="muted">No phone or tablet connected. Open TuneDeck on it, on the same Wi-Fi as this computer: it finds this computer by itself.</p>`;

  // Queue: running and failed jobs, the next few waiting, and a count of the rest.
  const all = status.jobs;
  const done = all.filter((j) => j.state === "done").length;
  const waiting = all.filter((j) => j.state === "queued");
  const jobs = [...all.filter((j) => j.state === "downloading" || j.state === "processing" || j.state === "error"), ...waiting.slice(0, 5)].sort(
    (a, b) => rank(a) - rank(b),
  );
  $("#queue-summary").textContent = all.length
    ? `${done} of ${all.length} ready${waiting.length ? ` · ${waiting.length} waiting` : ""}`
    : "";
  $("#queue-bar").hidden = !all.length || done === all.length;
  $("#queue-bar i").style.width = `${(all.reduce((n, j) => n + (j.state === "done" ? 1 : j.state === "error" ? 0 : j.progress * 0.9), 0) / Math.max(1, all.length)) * 100}%`;
  const more = waiting.length > 5 ? `<p class="muted small">…and ${waiting.length - 5} more waiting</p>` : "";
  $("#jobs").innerHTML = jobs.length
    ? jobs
        .map((j) => {
          const pct = Math.round((j.progress ?? 0) * 100);
          const detail = j.state === "error" ? esc(j.error) : j.state === "downloading" || j.state === "processing" ? `${esc(j.step)} · ${pct}%` : JOB_LABEL[j.state];
          return `<div class="item ${j.state}">
            <div class="row"><strong class="truncate">${esc(j.title)}</strong>
              ${j.state === "error" ? `<button class="link" data-retry="${esc(j.videoId)}">Dismiss</button>` : ""}
            </div>
            <div class="muted small">${detail}</div>
            ${j.state === "downloading" || j.state === "processing" ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}
          </div>`;
        })
        .join("") + more
    : all.length
      ? `<p class="muted">All done.</p>`
      : `<p class="muted">Nothing to do. Videos your phone or tablet asks for show up here.</p>`;

  // Library & tools
  const lib = status.library;
  $("#library").textContent = `${lib.count} file${lib.count === 1 ? "" : "s"} · ${size(lib.bytes)}`;
  const t = status.tools;
  $("#tools").innerHTML = !t.checked
    ? `<span class="muted">Checking…</span>`
    : [
        tool("yt-dlp", t.ytdlp, "Install with: pip install -U yt-dlp"),
        tool("ffmpeg", t.ffmpeg, "Install with: winget install Gyan.FFmpeg"),
        tool("Rubber Band (tuning)", t.rubberband ? "ok" : null, "Needs an ffmpeg “full” build, e.g. winget install Gyan.FFmpeg"),
        tool("Claude Code (playlist names)", t.claude, "Install from claude.com/claude-code and sign in"),
      ].join("");
  $("#autostart").checked = status.openAtLogin;
  $("#server-label").textContent = status.server ? new URL(status.server).host : "";
}

function rank(j) {
  return { downloading: 0, processing: 0, queued: 1, error: 2, done: 3 }[j.state] ?? 4;
}

function tool(name, version, hint) {
  return `<div class="row"><span>${version ? "✓" : "✗"} ${name}</span><span class="muted small">${version ? esc(version === "ok" ? "" : version) : esc(hint)}</span></div>`;
}

// ---------- WebRTC ----------

function waitIce(pc, ms) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, ms);
  });
}

function drop(peer) {
  if (!peers.has(peer.sid)) return;
  peers.delete(peer.sid);
  try {
    peer.ch?.close();
    peer.pc.close();
  } catch {
    /* already closed */
  }
  paint();
}

async function accept({ sid, sdp, device }) {
  if (peers.has(sid)) return;
  // One connection per device: a new offer from it replaces the old one.
  for (const p of peers.values()) if (p.device === device && !p.connected) drop(p);
  const pc = new RTCPeerConnection({ iceServers: [] });
  const peer = { sid, device, pc, ch: null, connected: false, wanted: new Map(), queue: [], sending: null, saved: 0, rate: 0 };
  peers.set(sid, peer);
  paint();
  pc.ondatachannel = (e) => setupChannel(peer, e.channel);
  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) drop(peer);
  };
  try {
    await pc.setRemoteDescription({ type: "offer", sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc, 2500);
    await api.answer(sid, pc.localDescription.sdp);
  } catch (err) {
    console.error("answer failed", err);
    drop(peer);
    return;
  }
  // Phones on another network never connect: forget them.
  setTimeout(() => !peer.connected && drop(peer), 45_000);
}

function send(peer, msg) {
  if (peer.ch?.readyState === "open") peer.ch.send(JSON.stringify(msg));
}

function setupChannel(peer, ch) {
  peer.ch = ch;
  ch.binaryType = "arraybuffer";
  ch.bufferedAmountLowThreshold = 1024 * 1024;
  const open = () => {
    peer.connected = true;
    paint();
  };
  if (ch.readyState === "open") open();
  ch.onopen = open;
  ch.onclose = () => drop(peer);
  ch.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.t === "hello") {
      peer.device = String(msg.device ?? peer.device).slice(0, 60);
      send(peer, { t: "hello", name: status?.name });
    } else if (msg.t === "want" && Array.isArray(msg.items)) {
      for (const item of msg.items.slice(0, 2000)) {
        if (typeof item?.videoId !== "string" || !Number.isInteger(item.semitones)) continue;
        const key = `${item.videoId}:${item.semitones}`;
        if (peer.wanted.has(key)) continue;
        const it = { key, videoId: item.videoId, semitones: item.semitones, title: String(item.title ?? item.videoId).slice(0, 200) };
        peer.wanted.set(key, it);
        send(peer, { t: "status", key, state: "queued", progress: 0 });
        void prepare(peer, it);
      }
    } else if (msg.t === "playlist" && typeof msg.url === "string") {
      void api.syncPlaylist(msg.url).then((r) => send(peer, { t: "playlist", state: r.ok ? "done" : "error", ...r }));
    } else if (msg.t === "saved") {
      peer.saved++;
      peer.wanted.delete(msg.key);
      paint();
    } else if (msg.t === "failed") {
      peer.wanted.delete(msg.key);
    }
    paint();
  };
  paint();
}

async function prepare(peer, item) {
  let info = null;
  for (let attempt = 0; attempt < 2 && !info; attempt++) {
    const r = await api.ensure(item);
    if (!peers.has(peer.sid)) return;
    if (!r.ok) {
      send(peer, { t: "status", key: item.key, state: "error", error: r.error ?? "Download failed" });
      peer.wanted.delete(item.key);
      return;
    }
    info = await api.fileInfo(item.videoId, item.semitones);
  }
  if (!info) {
    send(peer, { t: "status", key: item.key, state: "error", error: "File missing on the computer" });
    return;
  }
  peer.queue.push({ ...item, path: info.path, size: info.size });
  send(peer, { t: "status", key: item.key, state: "ready", progress: 1 });
  paint();
  void pump(peer);
}

function drained(ch) {
  return new Promise((resolve) => {
    const done = () => {
      ch.removeEventListener("bufferedamountlow", done);
      ch.removeEventListener("close", done);
      resolve();
    };
    ch.addEventListener("bufferedamountlow", done);
    ch.addEventListener("close", done);
  });
}

/** Sends queued files one at a time, pausing whenever the channel's buffer fills up. */
async function pump(peer) {
  if (peer.sending || !peer.queue.length) return;
  const ch = peer.ch;
  const file = peer.queue.shift();
  const chunk = Math.min(CHUNK, peer.pc.sctp?.maxMessageSize || CHUNK);
  peer.sending = { key: file.key, title: file.title, size: file.size, sent: 0 };
  send(peer, { t: "file", key: file.key, size: file.size });
  const fh = await api.openFile(file.path);
  const started = performance.now();
  try {
    let pos = 0;
    while (pos < file.size) {
      if (ch.readyState !== "open") throw new Error("closed");
      if (ch.bufferedAmount > HIGH_WATER) await drained(ch);
      const bytes = await api.read(fh, pos, Math.min(chunk, file.size - pos));
      if (!bytes.byteLength) throw new Error("short read");
      ch.send(bytes);
      pos += bytes.byteLength;
      peer.sending.sent = pos;
      peer.rate = pos / ((performance.now() - started) / 1000);
      paint();
    }
    send(peer, { t: "end", key: file.key });
  } catch (err) {
    if (ch.readyState === "open") console.error("send failed", err);
  } finally {
    await api.closeFile(fh);
    peer.sending = null;
    paint();
  }
  if (peers.has(peer.sid)) void pump(peer);
}

// Forward download/processing progress to every device waiting for that video.
api.on("job", (job) => {
  const state = job.state === "done" ? null : job.state;
  for (const peer of peers.values()) {
    for (const item of peer.wanted.values()) {
      if (item.videoId !== job.videoId || !state) continue;
      if (peer.queue.some((q) => q.key === item.key) || peer.sending?.key === item.key) continue;
      send(peer, { t: "status", key: item.key, state, progress: job.progress, error: job.error ?? undefined });
    }
  }
});

// Playlist sync progress goes to every connected device.
api.on("playlist", (update) => {
  for (const peer of peers.values()) send(peer, { t: "playlist", ...update });
});

api.on("offer", (offer) => void accept(offer));
api.on("status", (s) => {
  status = s;
  paint();
});

// ---------- Controls ----------

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#login-btn");
  btn.disabled = true;
  $("#login-error").textContent = "";
  const r = await api.login($("#server").value.trim(), $("#code").value);
  btn.disabled = false;
  if (!r.ok) $("#login-error").textContent = r.error;
  else $("#code").value = "";
});

document.addEventListener("click", (e) => {
  const retry = e.target.closest("[data-retry]");
  if (retry) void api.retry(retry.dataset.retry);
});
$("#open-folder").addEventListener("click", () => void api.openFolder());
$("#recheck").addEventListener("click", () => void api.recheckTools());
$("#logout").addEventListener("click", () => void api.logout());
$("#autostart").addEventListener("change", (e) => void api.setOpenAtLogin(e.target.checked));
