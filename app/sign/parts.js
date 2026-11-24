"use client";
import { useState } from "react";

export async function call(token, body) {
  const r = await fetch(`/api/sign/${token}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong");
  return j;
}

export const initialsOf = (name) => name.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).join("").slice(0, 4);

export function Shell({ title, children, wide = false }) {
  return (
    <div className={"sign-wrap" + (wide ? " wide" : "")}>
      <header className="sign-head"><span className="brand-mark">W</span><div><b>Westfleur Centre</b><div className="meta">{title || "Lease signing"}</div></div></header>
      {children}
      <p className="meta sign-foot">Your signing activity (time, IP address and device) is recorded in an audit certificate attached to the signed lease.</p>
    </div>
  );
}

// "Email me a code" then enter it.
export function CodeCard({ token, email, onVerified, heading = "Confirm it's you" }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function act(body, after) {
    setBusy(true); setErr("");
    try { await call(token, body); after?.(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <section className="card">
      <h2>{heading}</h2>
      <p>We&apos;ll email a 6-digit code to <b>{email}</b>. You need it before you can sign.</p>
      {!sent
        ? <button disabled={busy} onClick={() => act({ action: "code" }, () => setSent(true))}>{busy ? "Sending…" : "Email me a code"}</button>
        : (
          <form className="row" style={{ justifyContent: "flex-start", gap: 10, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); act({ action: "verify", code }, onVerified); }}>
            <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" aria-label="6-digit code" />
            <button disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Confirm"}</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => act({ action: "code" })}>Send another</button>
          </form>
        )}
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}

export function Decline({ token, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <details className="sign-decline" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>I don&apos;t want to sign this</summary>
      <p className="meta">Westfleur Centre will be told, and nobody will be able to sign this version.</p>
      <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Briefly, why (e.g. the rent is wrong)" />
      <button className="ghost" disabled={busy || !reason.trim()} onClick={async () => {
        setBusy(true); setErr("");
        try { await call(token, { action: "decline", reason }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
      }}>Decline to sign</button>
      {err && <p className="err">{err}</p>}
    </details>
  );
}

export function Done({ v, doc }) {
  const s = v.signer;
  return (
    <div className="card sign-done">
      <h2>✓ You&apos;ve signed</h2>
      <p>Thank you, {s.name.split(" ")[0]}. {v.completed
        ? "Everyone has now signed. Your copy, with the audit certificate, is below."
        : v.mail ? "We'll email you the final copy once everyone has signed." : "Once everyone has signed, you can download the final copy from this same link."}</p>
      {v.completed && <a className="btn" href={`${doc}?kind=signed&download=1`}>Download the signed lease</a>}
      <ul className="sign-parties">
        {[{ ...v.signer, me: true }, ...v.others].map((p, i) => (
          <li key={i}><span>{p.name}{p.me ? " (you)" : ""}</span><span className={`pill ${p.status === "signed" ? "ok" : ""}`}>{p.status === "signed" ? "Signed" : "Not yet"}</span></li>
        ))}
      </ul>
    </div>
  );
}
