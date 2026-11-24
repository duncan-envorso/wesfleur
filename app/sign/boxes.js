"use client";
import { useMemo, useRef, useState } from "react";
import PdfPages from "../pdf/pages";
import SigPad from "./sigpad";
import { call, CodeCard, Decline, initialsOf, Shell } from "./parts";
import { kindInfo, longDate } from "@/lib/lease-fields";

// Signing on the lease itself: the signer's boxes are highlighted on the pages; tap each to fill it.
export default function BoxSigning({ token, v, reload }) {
  const s = v.signer;
  const doc = `/api/sign/${token}/document`;
  const mine = useMemo(() => v.fields.filter((f) => f.mine).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x), [v.fields]);
  const others = v.fields.filter((f) => !f.mine);
  const [sig, setSig] = useState(null);
  const [ini, setIni] = useState(null);
  const [method, setMethod] = useState("drawn");
  const [adopting, setAdopting] = useState(null); // field that asked for it
  const [draftSig, setDraftSig] = useState(null);
  const [draftIni, setDraftIni] = useState(null);
  const [applied, setApplied] = useState(() => new Set());
  const [values, setValues] = useState({});
  const [asking, setAsking] = useState(null); // text/place field being filled
  const [answer, setAnswer] = useState("");
  const [place, setPlace] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const finishRef = useRef(null);

  const today = new Date().toISOString().slice(0, 10);
  const isDone = (f) => f.kind === "date" || f.kind === "name" ? true
    : f.kind === "signature" || f.kind === "initials" ? applied.has(f.id)
    : f.required === false || !!values[f.id];
  const todo = mine.filter((f) => !isDone(f));
  const needed = mine.filter((f) => !(f.kind === "date" || f.kind === "name"));
  const hasPlaceBox = mine.some((f) => f.kind === "place");
  const locked = !v.verified;

  function tap(f) {
    setErr("");
    if (locked) { setErr("Confirm the code we email you first (top of the page)"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (f.kind === "signature" || f.kind === "initials") {
      if (!sig || !ini) { setAdopting(f); return; }
      setApplied((a) => { const n = new Set(a); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; });
    } else if (f.kind === "text" || f.kind === "place") {
      setAsking(f); setAnswer(values[f.id] || (f.kind === "place" ? place : ""));
    }
  }

  function goNext() {
    const f = todo[0];
    if (!f) { finishRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const el = document.querySelector(`[data-field="${f.id}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    else document.querySelector(`[data-page="${f.page}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function finish() {
    setBusy(true); setErr("");
    try {
      await call(token, { action: "sign", signature: sig, initials: ini, method, values, applied: [...applied], place: hasPlaceBox ? undefined : place, agree });
      reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const preview = (f) => {
    if (f.kind === "date") return <span className="sbt">{longDate(today)}</span>;
    if (f.kind === "name") return <span className="sbt">{s.name}</span>;
    if (f.kind === "signature" && applied.has(f.id)) return <img src={sig} alt="" />;
    if (f.kind === "initials" && applied.has(f.id)) return <img src={ini} alt="" />;
    if ((f.kind === "text" || f.kind === "place") && values[f.id]) return <span className="sbt">{values[f.id]}</span>;
    return null;
  };

  return (
    <Shell title={v.title} wide>
      <p className="meta sign-who">For <b>{s.name}</b>{s.capacity ? `, ${s.capacity}` : ""} · {v.pages} pages</p>
      {v.message && <div className="card"><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{v.message}</p></div>}
      {locked && <CodeCard token={token} email={s.email} onVerified={reload} heading="First, confirm it's you" />}

      <div className="sign-progress" role="status">
        <span><b>{needed.length - todo.length}</b> of {needed.length} boxes done</span>
        <div className="sign-progress-bar"><span style={{ width: `${needed.length ? ((needed.length - todo.length) / needed.length) * 100 : 100}%` }} /></div>
        <button onClick={goNext} disabled={locked}>{todo.length ? (applied.size || Object.keys(values).length ? "Next box" : "Start") : "Finish"}</button>
      </div>
      <p className="meta">Read the lease below. Your boxes are highlighted: tap each one to sign, initial or fill it in. <a href={doc} target="_blank" rel="noreferrer">Open the PDF</a></p>

      <PdfPages url={doc} maxWidth={980} overlay={(page) => (
        <>
          {others.filter((f) => f.page === page).map((f) => (
            <div key={f.id} className="sb-box other" style={pos(f)}><span className="sbt">{f.done ? `${kindInfo(f.kind).label}: signed` : `${kindInfo(f.kind).label} · ${f.who}`}</span></div>
          ))}
          {mine.filter((f) => f.page === page).map((f) => {
            const p = preview(f);
            const done = isDone(f);
            return (
              <button type="button" key={f.id} data-field={f.id} className={`sb-box mine ${f.kind}${done ? " done" : ""}${f.kind === "date" || f.kind === "name" ? " auto" : ""}`}
                style={pos(f)} onClick={() => tap(f)} aria-label={`${kindInfo(f.kind).label}${f.label ? `: ${f.label}` : ""}${done ? " (done)" : ""}`}>
                {p ?? <span className="sbt">{f.kind === "signature" ? "Sign here" : f.kind === "initials" ? "Initial" : f.label || kindInfo(f.kind).label}{f.required === false ? " (optional)" : ""}</span>}
              </button>
            );
          })}
        </>
      )} />

      <section className="card" ref={finishRef}>
        <h2>Finish</h2>
        {todo.length > 0 && <p className="warnbox">{todo.length} box{todo.length === 1 ? "" : "es"} still to do. <button className="linkish small" onClick={goNext}>Go to the next one</button></p>}
        {!hasPlaceBox && <label>Town or city where you&apos;re signing<input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Atlantis" /></label>}
        <label className="check sign-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I have read the whole lease. I agree to be bound by it, and to sign it electronically: my signature and initials here have the same effect as signing by hand.</span>
        </label>
        <button className="sign-btn" disabled={busy || locked || todo.length > 0 || !agree || (!hasPlaceBox && !place.trim())} onClick={finish}>{busy ? "Signing…" : "Finish signing"}</button>
        {sig && <button className="linkish small" onClick={() => { setAdopting(mine.find((f) => f.kind === "signature") || mine[0]); }}>Change my signature or initials</button>}
        {err && <p className="err" role="alert">{err}</p>}
      </section>

      <Decline token={token} onDone={reload} />

      {adopting && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Your signature">
          <div className="modal-card">
            <h2>Your signature and initials</h2>
            <p className="meta">Used for every box you tap. You can change them before you finish.</p>
            <SigPad label="Signature" typedDefault={s.name} onChange={(d, m) => { setDraftSig(d); setMethod(m === "type" ? "typed" : "drawn"); }} />
            <SigPad label="Initials" typedDefault={initialsOf(s.name)} height={110} hint="Initials here" onChange={setDraftIni} />
            <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
              <button disabled={!draftSig || !draftIni} onClick={() => {
                const replacing = !!sig;
                setSig(draftSig); setIni(draftIni);
                if (!replacing) setApplied((a) => new Set(a).add(adopting.id));
                setAdopting(null);
              }}>{sig ? "Use these" : "Use these and sign this box"}</button>
              <button className="ghost" onClick={() => setAdopting(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {asking && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Fill in">
          <form className="modal-card" onSubmit={(e) => {
            e.preventDefault();
            const a = answer.trim();
            // One answer fills every "place" box of this signer.
            setValues((v2) => {
              const n = { ...v2, [asking.id]: a };
              if (asking.kind === "place") for (const f of mine) if (f.kind === "place" && (!n[f.id] || f.id === asking.id)) n[f.id] = a;
              return n;
            });
            if (asking.kind === "place" && a) setPlace(a);
            setAsking(null);
          }}>
            <h2>{asking.kind === "place" ? "Where are you signing?" : asking.label || "Fill in"}</h2>
            <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={asking.kind === "place" ? "Town or city, e.g. Atlantis" : ""} maxLength={200} />
            <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
              <button>Save</button>
              <button type="button" className="ghost" onClick={() => setAsking(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </Shell>
  );
}

const pos = (f) => ({ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` });
