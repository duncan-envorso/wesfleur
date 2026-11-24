"use client";
import { use, useCallback, useEffect, useState } from "react";
import SigPad from "../sigpad";

async function call(token, body) {
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

const initialsOf = (name) => name.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).join("").slice(0, 4);

export default function SignPage({ params }) {
  const { token } = use(params);
  const [v, setV] = useState(null);
  const [fatal, setFatal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [sig, setSig] = useState(null);
  const [ini, setIni] = useState(null);
  const [place, setPlace] = useState("");
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("drawn");

  const load = useCallback(() => call(token).then(setV).catch((e) => setFatal(e.message)), [token]);
  useEffect(() => { load(); }, [load]);

  async function act(body, after) {
    setBusy(true); setErr("");
    try { const j = await call(token, body); await after?.(j); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (fatal) return <Shell><div className="card"><h2>Can&apos;t open this link</h2><p>{fatal}</p></div></Shell>;
  if (!v) return <Shell><p className="meta">Loading…</p></Shell>;

  const doc = `/api/sign/${token}/document`;
  const s = v.signer;

  if (s.status === "signed" || v.request_status === "completed") {
    return (
      <Shell title={v.title}>
        <div className="card sign-done">
          <h2>✓ You&apos;ve signed</h2>
          <p>Thank you, {s.name.split(" ")[0]}. {v.completed
            ? "Everyone has now signed. Your copy, with the signature page and audit certificate, is below."
            : v.mail ? "We'll email you the final copy once everyone has signed." : "Once everyone has signed, you can download the final copy from this same link."}</p>
          {v.completed && <a className="btn" href={`${doc}?kind=signed&download=1`}>Download the signed lease</a>}
          <Parties v={v} />
        </div>
      </Shell>
    );
  }
  if (v.request_status === "voided" || v.request_status === "declined") {
    return <Shell title={v.title}><div className="card"><h2>This signing request is closed</h2><p>{v.request_status === "voided" ? "Westfleur Centre cancelled it." : "It was declined."} Contact Westfleur Centre if you think this is wrong.</p></div></Shell>;
  }

  const step = !read ? 1 : !v.verified ? 2 : 3;

  return (
    <Shell title={v.title}>
      <p className="meta sign-who">For <b>{s.name}</b>{s.capacity ? `, ${s.capacity}` : ""}</p>
      <ol className="sign-steps">
        <li className={step === 1 ? "on" : "done"}>Read</li>
        {v.needsCode && <li className={step === 2 ? "on" : step > 2 ? "done" : ""}>Confirm it&apos;s you</li>}
        <li className={step === 3 ? "on" : ""}>Sign</li>
      </ol>

      {v.message && <div className="card"><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{v.message}</p></div>}

      <section className="card">
        <h2>1. Read the lease</h2>
        <p>{v.lessor} and {v.tenant}: <b>{v.pages} pages</b>. Please read all of it before signing.</p>
        <div className="sign-doc"><iframe src={doc} title="Lease" /></div>
        <p className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
          <a className="btn ghost" href={doc} target="_blank" rel="noreferrer">Open the lease full screen</a>
          <a className="btn ghost" href={`${doc}?download=1`}>Download PDF</a>
        </p>
        {!read && <button onClick={() => setRead(true)}>I&apos;ve read the lease, continue</button>}
      </section>

      {read && v.needsCode && !v.verified && (
        <section className="card">
          <h2>2. Confirm it&apos;s you</h2>
          <p>We&apos;ll email a 6-digit code to <b>{s.email}</b>.</p>
          {!codeSent
            ? <button disabled={busy} onClick={() => act({ action: "code" }, () => setCodeSent(true))}>{busy ? "Sending…" : "Email me a code"}</button>
            : (
              <form className="row" style={{ justifyContent: "flex-start", gap: 10 }} onSubmit={(e) => { e.preventDefault(); act({ action: "verify", code }, load); }}>
                <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" aria-label="6-digit code" />
                <button disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Confirm"}</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => act({ action: "code" })}>Send another</button>
              </form>
            )}
        </section>
      )}

      {read && v.verified && (
        <section className="card">
          <h2>{v.needsCode ? "3" : "2"}. Sign</h2>
          <SigPad label="Your signature" typedDefault={s.name} onChange={(d, m) => { setSig(d); setMethod(m === "type" ? "typed" : "drawn"); }} />
          <SigPad label="Your initials (added to every page)" typedDefault={initialsOf(s.name)} height={110} hint="Initials here" onChange={setIni} />
          <label>Town or city where you&apos;re signing<input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Atlantis" /></label>
          <label className="check sign-agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I have read the whole lease. I agree to be bound by it, and to sign it electronically: my signature and initials here have the same effect as signing by hand.</span>
          </label>
          <button className="sign-btn" disabled={busy || !sig || !ini || !place.trim() || !agree}
            onClick={() => act({ action: "sign", signature: sig, initials: ini, place, agree, method }, load)}>
            {busy ? "Signing…" : "Sign the lease"}
          </button>
        </section>
      )}

      {err && <p className="err" role="alert">{err}</p>}

      <details className="sign-decline" open={declining} onToggle={(e) => setDeclining(e.currentTarget.open)}>
        <summary>I don&apos;t want to sign this</summary>
        <p className="meta">Westfleur Centre will be told, and nobody will be able to sign this version.</p>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Briefly, why (e.g. the rent is wrong)" />
        <button className="ghost" disabled={busy || !reason.trim()} onClick={() => act({ action: "decline", reason }, load)}>Decline to sign</button>
      </details>
    </Shell>
  );
}

function Parties({ v }) {
  return (
    <ul className="sign-parties">
      {[{ ...v.signer, me: true }, ...v.others].map((p, i) => (
        <li key={i}><span>{p.name}{p.me ? " (you)" : ""}</span><span className={`pill ${p.status === "signed" ? "ok" : ""}`}>{p.status === "signed" ? "Signed" : "Not yet"}</span></li>
      ))}
    </ul>
  );
}

function Shell({ title, children }) {
  return (
    <div className="sign-wrap">
      <header className="sign-head"><span className="brand-mark">W</span><div><b>Westfleur Centre</b><div className="meta">{title || "Lease signing"}</div></div></header>
      {children}
      <p className="meta sign-foot">Your signing activity (time, IP address and device) is recorded in an audit certificate attached to the signed lease.</p>
    </div>
  );
}
