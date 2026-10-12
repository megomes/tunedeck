"use client";

import {
  Bot,
  CloudOff,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  Link2Off,
  ShieldOff,
  Smartphone,
  Tags,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OfflineVideosSection } from "@/components/OfflineVideos";
import { InstrumentChips, StatusChips } from "@/components/Pickers";
import { APP_VERSION } from "@/components/SyncBadge";
import { TopBar } from "@/components/TopBar";
import { setSetting } from "@/lib/client/actions";
import { CLIP_OPTIONS, clipSeconds } from "@/lib/client/backlog";
import { timeAgo } from "@/lib/client/format";
import { api, clearLocalCache, sync, useData, useStore } from "@/lib/client/store";
import { toast } from "@/lib/client/ui";
import { DEFAULT_TUNINGS, type Instrument, type Status } from "@/lib/shared/types";

interface DeviceSession {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function deviceName(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

/** Ready-to-paste instructions for a chat agent, with the Markdown link filled in. */
function agentPrompt(url: string) {
  return `Tenho uma biblioteca de músicas que eu toco no app TuneDeck.
Ela está neste link, em Markdown, somente leitura e sempre atualizada:

${url}

Como ler:
- Abra o link e leia o conteúdo inteiro antes de responder.
  Se não conseguir acessar, me avise em vez de supor o conteúdo.
- Cada música mostra título, artista, instrumento, afinação, capo, dificuldade (0–5),
  tags, riffs e quantas vezes eu toquei.
- Riffs são partes de uma música (intro, solo…) que eu aprendo separadas,
  com status próprio, independente do status da música.
- Músicas em "Just riffs" são aquelas em que eu só quero os riffs, não a música inteira.
- Os status são:
  - Up Next: as próximas que vou aprender (fila curta, até 5)
  - Learning: estou praticando agora
  - Can Play e Mastered: já toco
  - Backlog: vídeos guardados que talvez eu aprenda um dia
  - Archived: parado
- Use só o que está no link como fonte do meu repertório.
- Sempre que eu perguntar algo sobre as músicas que eu toco, consulte o link de novo,
  porque ele muda.

Confirme que leu respondendo só com o total de músicas e quantas há em cada status.
Depois aguarde minha pergunta.`;
}

/** Secret read-only link to the repertoire, for AI agents (JSON or Markdown). */
function AgentFeedSection() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/feed")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setToken(j.token))
      .catch(() => {});
  }, []);

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    try {
      const res = await api("/api/feed", { method });
      if (!res.ok) throw new Error();
      setToken((await res.json()).token);
    } catch {
      toast("Could not update the link");
    } finally {
      setBusy(false);
    }
  }

  const base = token ? `${window.location.origin}/api/feed/${token}` : "";
  const copy = async (text: string, what = "Link") => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      prompt(`Copy this ${what.toLowerCase()}`, text);
    }
  };

  return (
    <section className="section">
      <p className="step-title">AI agent link</p>
      <div className="panel" style={{ paddingTop: 6, paddingBottom: 6 }}>
        <div className="panel-row">
          <Bot />
          <span className="grow">
            {token ? "Read-only link is on" : "Share your repertoire with an AI agent"}
            <div className="meta">
              {token
                ? "Anyone with the link can read your songs, status, tuning and tags. No videos, files or settings."
                : "A secret link with your songs and their status, e.g. to ask which pedal fits what you play."}
            </div>
          </span>
          {token === null && (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void call("POST")}>
              Create link
            </button>
          )}
        </div>
        {token && (
          <>
            <button className="panel-row" style={{ width: "100%", textAlign: "left" }} onClick={() => void copy(agentPrompt(`${base}?format=md`), "Prompt")}>
              <Bot />
              <span className="grow">
                Copy prompt for AI
                <div className="meta">Instructions plus the link, ready to paste into a chat</div>
              </span>
            </button>
            <button className="panel-row" style={{ width: "100%", textAlign: "left" }} onClick={() => void copy(`${base}?format=md`)}>
              <Copy />
              <span className="grow">
                Copy Markdown link
                <div className="meta">Best for chat agents</div>
              </span>
            </button>
            <button className="panel-row" style={{ width: "100%", textAlign: "left" }} onClick={() => void copy(base)}>
              <Copy />
              <span className="grow">Copy JSON link</span>
            </button>
            <button
              className="panel-row"
              style={{ width: "100%", textAlign: "left" }}
              disabled={busy}
              onClick={() => confirm("Create a new link? The current one stops working.") && void call("POST")}
            >
              <RefreshCw />
              <span className="grow">Replace link</span>
            </button>
            <button
              className="panel-row"
              style={{ width: "100%", textAlign: "left" }}
              disabled={busy}
              onClick={() => confirm("Turn off the link? It stops working immediately.") && void call("DELETE")}
            >
              <Link2Off />
              <span className="grow">Turn off link</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const data = useData();
  const syncStatus = useStore((s) => s.sync);
  const pending = useStore((s) => s.outbox.length);
  const lastSyncAt = useStore((s) => s.lastSyncAt);
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [newTuning, setNewTuning] = useState("");
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const customTunings = (data.settings.customTunings as string[] | undefined) ?? [];
  const defaultInstrument = (data.settings.defaultInstrument as Instrument) ?? "guitar";
  const defaultStatus = (data.settings.defaultStatus as Status) ?? "WANT_TO_PLAY";

  const loadSessions = () =>
    api("/api/auth/sessions")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setSessions(j.sessions))
      .catch(() => {});

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function importBackup(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const res = await api("/api/import", { method: "POST", body: text, timeoutMs: 180_000 });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      toast(`Restored ${body.applied} records${body.failed ? ` · ${body.failed} skipped` : ""}`);
      await sync();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function logout() {
    if (!confirm("Log out of this device? Local data will be cleared.")) return;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await clearLocalCache().catch(() => {});
    router.replace("/login");
  }

  const addTuning = () => {
    const t = newTuning.trim();
    if (!t || customTunings.includes(t) || DEFAULT_TUNINGS.includes(t)) return;
    setSetting("customTunings", [...customTunings, t]);
    setNewTuning("");
  };

  return (
    <>
      <TopBar title="Settings" />
      <div className="container" style={{ maxWidth: 760 }}>
        <section className="section" style={{ marginTop: 8 }}>
          <p className="step-title">When adding a song</p>
          <div className="panel form-grid">
            <div className="field">
              <span className="label">Default instrument</span>
              <InstrumentChips value={defaultInstrument} onChange={(i) => setSetting("defaultInstrument", i)} />
            </div>
            <div className="field">
              <span className="label">Default status</span>
              <StatusChips value={defaultStatus} onChange={(s) => setSetting("defaultStatus", s)} />
            </div>
          </div>
        </section>

        <OfflineVideosSection />

        <section className="section">
          <p className="step-title">Backlog previews</p>
          <div className="panel form-grid">
            <div className="field">
              <span className="label">Clip length</span>
              <div className="segmented">
                {CLIP_OPTIONS.map((n) => (
                  <button key={n} className={`chip sm ${clipSeconds(data.settings) === n ? "active" : ""}`} onClick={() => setSetting("clipSeconds", n)}>
                    {n} s
                  </button>
                ))}
              </div>
              <span className="hint">
                On phones and tablets, Backlog videos saved on the device play short clips: from the ⭐ you marked, then a few spots
                in the middle of the song.
              </span>
            </div>
          </div>
        </section>

        <section className="section">
          <p className="step-title">Tunings</p>
          <div className="panel form-grid">
            <div className="segmented">
              {DEFAULT_TUNINGS.map((t) => (
                <span key={t} className="chip sm">
                  {t}
                </span>
              ))}
              {customTunings.map((t) => (
                <button
                  key={t}
                  className="chip sm active"
                  aria-label={`Remove ${t}`}
                  onClick={() => setSetting("customTunings", customTunings.filter((x) => x !== t))}
                >
                  {t} <X className="x" />
                </button>
              ))}
            </div>
            <div className="row-gap">
              <input
                className="input"
                style={{ height: 40, borderRadius: 999 }}
                placeholder="Add a tuning, e.g. Open G, DADGAD"
                value={newTuning}
                onChange={(e) => setNewTuning(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTuning()}
              />
              <button className="btn btn-surface btn-sm" onClick={addTuning} disabled={!newTuning.trim()}>
                Add
              </button>
            </div>
          </div>
        </section>

        <section className="section">
          <p className="step-title">Library</p>
          <div className="panel" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <Link href="/tags" className="panel-row">
              <Tags />
              <span className="grow">Manage tags</span>
              <span className="meta">{data.tags.length}</span>
            </Link>
            <a href="/api/export?format=json" className="panel-row" download>
              <Download />
              <span className="grow">
                Export JSON backup
                <div className="meta">Songs, resources, tags, play history and file metadata</div>
              </span>
            </a>
            <a href="/api/export?format=csv" className="panel-row" download>
              <FileSpreadsheet />
              <span className="grow">Export CSV song list</span>
            </a>
            <button className="panel-row" style={{ width: "100%", textAlign: "left" }} disabled={importing} onClick={() => fileRef.current?.click()}>
              <Upload />
              <span className="grow">
                {importing ? "Restoring…" : "Restore JSON backup"}
                <div className="meta">Merges with what is already here</div>
              </span>
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importBackup(e.target.files[0])} />
          </div>
        </section>

        <AgentFeedSection />

        <section className="section">
          <p className="step-title">Offline & sync</p>
          <div className="panel" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <div className="panel-row">
              {syncStatus === "offline" ? <CloudOff /> : <Database />}
              <span className="grow">
                {syncStatus === "offline" ? "Offline — changes are queued" : syncStatus === "error" ? "Sync error" : "Library cached on this device"}
                <div className="meta">
                  {data.entries.length} songs · last sync {lastSyncAt ? timeAgo(lastSyncAt).toLowerCase() : "never"} · {APP_VERSION}
                  {pending ? ` · ${pending} change${pending > 1 ? "s" : ""} pending` : ""}
                </div>
              </span>
              <button className="btn btn-surface btn-sm" onClick={() => void sync()} disabled={syncStatus === "syncing"}>
                <RefreshCw className={syncStatus === "syncing" ? "spin" : ""} /> Sync
              </button>
            </div>
            <button
              className="panel-row"
              style={{ width: "100%", textAlign: "left" }}
              onClick={async () => {
                const warn = pending ? `\n\n${pending} unsynced change(s) will be lost.` : "";
                if (!confirm(`Clear the local cache and reload everything from the server?${warn}`)) return;
                await clearLocalCache();
                toast("Local cache cleared");
              }}
            >
              <HardDriveDownload />
              <span className="grow">Clear local cache</span>
            </button>
          </div>
        </section>

        <section className="section">
          <p className="step-title">App</p>
          <div className="panel" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <div className="panel-row">
              <Smartphone />
              <span className="grow">
                {standalone ? "Installed" : "Install TuneDeck"}
                <div className="meta">
                  {standalone
                    ? "Running as an app. On Android, Share → TuneDeck adds links instantly."
                    : installEvt
                      ? "Adds an app icon and enables Share → TuneDeck on Android."
                      : "iOS: Share → Add to Home Screen. Android/desktop: browser menu → Install app."}
                </div>
              </span>
              {installEvt && !standalone && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    await installEvt.prompt();
                    setInstallEvt(null);
                  }}
                >
                  Install
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="section">
          <p className="step-title">Access</p>
          <div className="panel" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {(sessions ?? []).map((s) => (
              <div key={s.id} className="panel-row">
                <MonitorSmartphone />
                <span className="grow">
                  {deviceName(s.userAgent)}
                  {s.current && <span className="meta"> · this device</span>}
                  <div className="meta">Active {timeAgo(s.lastSeenAt).toLowerCase()}</div>
                </span>
              </div>
            ))}
            {sessions && sessions.length > 1 && (
              <button
                className="panel-row"
                style={{ width: "100%", textAlign: "left" }}
                onClick={async () => {
                  if (!confirm("Sign out every other device?")) return;
                  await api("/api/auth/sessions", { method: "DELETE" });
                  toast("Other devices signed out");
                  void loadSessions();
                }}
              >
                <ShieldOff />
                <span className="grow">Sign out other devices</span>
              </button>
            )}
            <button className="panel-row" style={{ width: "100%", textAlign: "left" }} onClick={logout}>
              <LogOut />
              <span className="grow">Log out of this device</span>
            </button>
          </div>
        </section>

        <p className="meta mt-8" style={{ textAlign: "center" }}>
          TuneDeck · your repertoire, one tap away
        </p>
        <div style={{ height: 8 }} />
      </div>
    </>
  );
}
