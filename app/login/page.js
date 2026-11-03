"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not sign in");
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-mark" aria-hidden="true">W</div>
      <h1>Westfleur Centre</h1>
      <p className="meta">Sign in to capture meter readings</p>

      <label>Username
        <input autoComplete="username" autoCapitalize="none" autoCorrect="off" required
          value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
      </label>
      <label>Password
        <div className="pw">
          <input type={show ? "text" : "password"} autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="ghost small" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </label>
      {error && <div className="err" role="alert">{error}</div>}
      <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="meta center">You&apos;ll stay signed in on this device for 30 days.</p>
    </form>
  );
}

export default function Login() {
  return (
    <div className="login-wrap">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
