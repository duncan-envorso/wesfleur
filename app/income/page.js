"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { INCOME_CATEGORIES, INCOME_CATEGORY } from "@/lib/income-categories";
import { R, api, dateZA } from "../tenants/ui";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const label = (p) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const BLANK = { received_on: today(), period: "", payer: "", category: "", description: "", amount: "", method: "EFT", reference: "", notes: "" };

function IncomeForm({ period, initial, onSaved, onCancel }) {
  const [v, setV] = useState({ ...BLANK, period, ...(initial || {}) });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  const cat = INCOME_CATEGORY[v.category];
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      if (initial?.id) await api(`/api/income/${initial.id}`, "PATCH", v); else await api("/api/income", "POST", v);
      onSaved();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  return (
    <form className="card" onSubmit={save}>
      <div className="row"><h2>{initial?.id ? "Edit income" : "Record income"}</h2><button type="button" className="ghost small-btn" onClick={onCancel}>Close</button></div>
      <div className="form-grid">
        <label>Date received<input type="date" value={v.received_on} onChange={(e) => set("received_on", e.target.value)} required /></label>
        <label>For month<input type="month" value={v.period} onChange={(e) => set("period", e.target.value)} /></label>
        <label>Received from<input value={v.payer} onChange={(e) => set("payer", e.target.value)} placeholder="Envorso LLC" required /></label>
        <label>Category
          <select value={v.category} onChange={(e) => set("category", e.target.value)} required>
            <option value="">Choose…</option>
            {INCOME_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label>Amount received (R)<input inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} placeholder="94 090,50" required /></label>
        <label>Received by
          <select value={v.method} onChange={(e) => set("method", e.target.value)}>
            {["EFT", "Cash deposit", "Card", "SWIFT", "Other"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label>Bank reference<input value={v.reference} onChange={(e) => set("reference", e.target.value)} placeholder="e.g. R026JCBS80 ENVORSO LLC" /></label>
        <label className="wide">What it was for<input value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Consulting services, October 2026" /></label>
        <label className="wide">Notes<textarea rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </div>
      {cat?.note && <div className="sars-hint"><div>{cat.note}</div></div>}
      {err && <p className="err">{err}</p>}
      <div><button disabled={busy}>{busy ? "Saving…" : "Save income"}</button></div>
    </form>
  );
}

export default function Income() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const pending = useRef({ id: null, at: 0 });

  const load = useCallback(() => api(`/api/income?period=${period}`).then((d) => { setData(d); setErr(""); }).catch((e) => setErr(e.message)), [period]);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    const now = Date.now();
    if (pending.current.id !== id || now - pending.current.at > 3000) { pending.current = { id, at: now }; setMsg("Tap × again to delete."); return; }
    await api(`/api/income/${id}`, "DELETE"); setMsg("Deleted."); load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Income</h1>
          <p className="meta">Money in that isn&apos;t tenant rent: gym, consulting, payouts. Rent and recoveries come from <Link href="/invoices">invoices</Link>.</p>
        </div>
        <div className="row wrap">
          <label className="month-pick">Month<input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
          <button onClick={() => setForm({})}>Record income</button>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      {form && <IncomeForm key={form.id || "new"} period={period} initial={form.id ? form : null} onCancel={() => setForm(null)}
        onSaved={() => { setForm(null); setMsg("Income saved."); load(); }} />}
      {data && (
        <>
          <div className="summary">
            <div className="stat"><span className="meta">Other income in {label(period)}</span><b>{R(data.total)}</b><span className="meta">{data.rows.length} item{data.rows.length === 1 ? "" : "s"}</span></div>
            {data.byCategory.map((c) => (
              <div key={c.key} className="stat"><span className="meta">{c.label}</span><b>{R(c.amount)}</b></div>
            ))}
          </div>
          {msg && <p><span className="pill ok">{msg}</span></p>}
          <div className="scroll">
            <table>
              <thead><tr><th>Date</th><th>From</th><th>Category</th><th>What for</th><th className="num">Amount</th><th></th></tr></thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={6} className="meta">Nothing recorded for {label(period)}.</td></tr>}
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{dateZA(r.received_on)}</td>
                    <td><b>{r.payer}</b>{r.reference && r.reference !== r.payer && <div className="meta">{r.reference}</div>}</td>
                    <td>{INCOME_CATEGORY[r.category]?.label || r.category}</td>
                    <td>{r.description}</td>
                    <td className="num">{R(r.amount)}</td>
                    <td className="nowrap"><button className="linkish small" onClick={() => setForm(r)}>edit</button>
                      <button className="linkish" onClick={() => remove(r.id)} aria-label="Delete">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
