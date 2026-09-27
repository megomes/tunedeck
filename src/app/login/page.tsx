"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not sign in");
        setBusy(false);
        return;
      }
      navigator.serviceWorker?.controller?.postMessage("warm");
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch {
      setError("You're offline. Connect once to unlock this device.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <input
        className="input code-input"
        type="password"
        inputMode="text"
        autoComplete="current-password"
        autoFocus
        placeholder="Access code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        aria-label="Access code"
      />
      {error && (
        <p className="error-text" style={{ textAlign: "center", margin: 0 }}>
          {error}
        </p>
      )}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy || !code.trim()}>
        {busy ? <LoaderCircle className="spin" /> : <ArrowRight />}
        Unlock
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="TuneDeck" />
        <div style={{ textAlign: "center" }}>
          <h1 className="display">TuneDeck</h1>
          <p className="secondary" style={{ marginTop: 8 }}>
            Your repertoire, one tap away.
          </p>
        </div>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
