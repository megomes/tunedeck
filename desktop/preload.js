// Bridge between the window (WebRTC + UI) and the main process (downloads, server API).
const { contextBridge, ipcRenderer } = require("electron");
const fs = require("node:fs");

const handles = new Map();
let nextHandle = 1;

contextBridge.exposeInMainWorld("tunedeck", {
  on: (channel, cb) => {
    if (!["status", "offer", "job", "playlist"].includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
  login: (server, code) => ipcRenderer.invoke("login", { server, code }),
  logout: () => ipcRenderer.invoke("logout"),
  answer: (sid, sdp) => ipcRenderer.invoke("answer", { sid, sdp }),
  ensure: (item) => ipcRenderer.invoke("ensure", item),
  fileInfo: (videoId, semitones) => ipcRenderer.invoke("file-info", { videoId, semitones }),
  openFolder: () => ipcRenderer.invoke("open-folder"),
  recheckTools: () => ipcRenderer.invoke("recheck-tools"),
  syncPlaylist: (url) => ipcRenderer.invoke("playlist-sync", { url }),
  retry: (videoId) => ipcRenderer.invoke("retry", videoId),
  setOpenAtLogin: (on) => ipcRenderer.invoke("set-open-at-login", on),

  // Chunked file reads for streaming a video over a data channel.
  openFile: async (path) => {
    const fh = await fs.promises.open(path, "r");
    const id = nextHandle++;
    handles.set(id, fh);
    return id;
  },
  read: async (id, position, length) => {
    const fh = handles.get(id);
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, position);
    return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
  },
  closeFile: async (id) => {
    await handles.get(id)?.close();
    handles.delete(id);
  },
});
