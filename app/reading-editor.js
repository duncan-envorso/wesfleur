"use client";
import { useState } from "react";

// Posts a reading; handles the "looks wrong" check by offering the suggestion or saving anyway.
export async function postReading(fields, confirm = false) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== "") fd.append(k, v);
  if (confirm) fd.append("confirm", "1");
  const r = await fetch("/api/readings", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (r.status === 409 && j.needsConfirm) return { problem: j };
  if (!r.ok) throw new Error(j.error || "Could not save");
  return { ok: true };
}

export function Problem({ problem, onUse, onForce, busy }) {
  if (!problem) return null;
  return (
    <div className="problem">
      <div>{problem.error}</div>
      <div className="row wrap">
        {problem.suggestion && <button type="button" onClick={() => onUse(problem.suggestion)} disabled={busy}>Use {problem.suggestion}</button>}
        <button type="button" className="ghost" onClick={onForce} disabled={busy}>Save as typed</button>
      </div>
    </div>
  );
}

const show = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 4, maximumFractionDigits: 4 }));

// A reading in the report that can be corrected in place.
export function EditableReading({ meterId, period, value, note, onSaved, label }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  const [n, setN] = useState("");
  const [problem, setProblem] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(reading = v, confirm = false) {
    setBusy(true); setErr("");
    try {
      const res = await postReading({ meter_id: meterId, period, reading, note: n || "Corrected" }, confirm);
      if (res.problem) { setV(reading); setProblem(res.problem); return; }
      setOpen(false); setProblem(null); onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <span className="editable">
        {show(value)}
        <button type="button" className="linkish small" title={`Edit ${label}`} aria-label={`Edit ${label}`}
          onClick={() => { setV(value === null || value === undefined ? "" : String(value).replace(".", ",")); setN(note || ""); setProblem(null); setOpen(true); }}>
          {value === null || value === undefined ? "add" : "edit"}
        </button>
      </span>
    );
  }
  return (
    <div className="inline-edit">
      <span className="meta">{label} · {period}</span>
      <input inputMode="decimal" value={v} autoFocus onChange={(e) => { setV(e.target.value); setProblem(null); }}
        onKeyDown={(e) => e.key === "Enter" && save()} />
      <input placeholder="Reason, e.g. typo — missing comma" value={n} onChange={(e) => setN(e.target.value)} />
      <Problem problem={problem} busy={busy} onUse={(s) => save(s)} onForce={() => save(v, true)} />
      {err && <div className="err">{err}</div>}
      <div className="row wrap">
        <button type="button" onClick={() => save()} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
