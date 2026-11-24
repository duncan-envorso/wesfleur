"use client";
import { use, useCallback, useEffect, useState } from "react";
import SigPad from "../sigpad";
import BoxSigning from "../boxes";
import { call, CodeCard, Decline, Done, initialsOf, Shell } from "../parts";

export default function SignPage({ params }) {
  const { token } = use(params);
  const [v, setV] = useState(null);
  const [fatal, setFatal] = useState("");
  const load = useCallback(() => call(token).then(setV).catch((e) => setFatal(e.message)), [token]);
  useEffect(() => { load(); }, [load]);

  if (fatal) return <Shell><div className="card"><h2>Can&apos;t open this link</h2><p>{fatal}</p></div></Shell>;
  if (!v) return <Shell><p className="meta">Loading…</p></Shell>;
  const doc = `/api/sign/${token}/document`;
  if (v.signer.status === "signed" || v.request_status === "completed") return <Shell title={v.title}><Done v={v} doc={doc} /></Shell>;
  if (v.request_status === "voided" || v.request_status === "declined") {
    return <Shell title={v.title}><div className="card"><h2>This signing request is closed</h2><p>{v.request_status === "voided" ? "Westfleur Centre cancelled it." : "It was declined."} Contact Westfleur Centre if you think this is wrong.</p></div></Shell>;
  }
  if (v.fields?.some((f) => f.mine)) return <BoxSigning token={token} v={v} reload={load} />;
  return <SimpleSigning token={token} v={v} reload={load} doc={doc} />;
}

// No boxes placed on the lease: read it, then sign once (initials go on every page, signature on a page at the end).
function SimpleSigning({ token, v, reload, doc }) {
  const s = v.signer;
  const [read, setRead] = useState(false);
  const [sig, setSig] = useState(null);
  const [ini, setIni] = useState(null);
  const [method, setMethod] = useState("drawn");
  const [place, setPlace] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const step = !read ? 1 : !v.verified ? 2 : 3;

  async function sign() {
    setBusy(true); setErr("");
    try { await call(token, { action: "sign", signature: sig, initials: ini, place, agree, method }); reload(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

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
      {read && v.needsCode && !v.verified && <CodeCard token={token} email={s.email} onVerified={reload} heading="2. Confirm it's you" />}
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
          <button className="sign-btn" disabled={busy || !sig || !ini || !place.trim() || !agree} onClick={sign}>{busy ? "Signing…" : "Sign the lease"}</button>
        </section>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      <Decline token={token} onDone={reload} />
    </Shell>
  );
}
