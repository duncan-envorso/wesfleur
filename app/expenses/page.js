"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, CATEGORY } from "@/lib/expense-categories";
import { R, dateZA } from "../tenants/ui";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const label = (p) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const BLANK = { spent_on: today(), period: "", supplier: "", category: "", description: "", amount: "", vat: "", method: "EFT", reference: "", unit_code: "", notes: "" };
const DED = { yes: ["Deductible", "ok"], partly: ["Partly deductible", "warn"], no: ["Not deductible", "bad"] };

async function send(url, form) {
  const r = await fetch(url, { method: "POST", body: form, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Could not save");
  return j;
}

function ExpenseForm({ period, initial, onSaved, onCancel }) {
  const [v, setV] = useState({ ...BLANK, period, ...(initial || {}) });
  const [file, setFile] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  const cat = CATEGORY[v.category];

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      for (const [k, x] of Object.entries(v)) if (x !== null && x !== undefined) fd.append(k, x);
      if (file) fd.append("receipt", file);
      await send(initial?.id ? `/api/expenses/${initial.id}` : "/api/expenses", fd);
      onSaved();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="row"><h2>{initial?.id ? "Edit expense" : "Record an expense"}</h2><button type="button" className="ghost small-btn" onClick={onCancel}>Close</button></div>
      <div className="form-grid">
        <label>Date paid<input type="date" value={v.spent_on} onChange={(e) => set("spent_on", e.target.value)} required /></label>
        <label>For month<input type="month" value={v.period} onChange={(e) => set("period", e.target.value)} /><span className="hint">The month it relates to</span></label>
        <label>Paid to (supplier)<input value={v.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="City of Cape Town" required /></label>
        <label>Category
          <select value={v.category} onChange={(e) => set("category", e.target.value)} required>
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label>Amount paid, incl. VAT (R)<input inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} placeholder="20 000,00" required /></label>
        <label>VAT included (R)<input inputMode="decimal" value={v.vat} onChange={(e) => set("vat", e.target.value)} placeholder="0" />
          <span className="hint">From the supplier&apos;s tax invoice; claimable only once VAT-registered</span></label>
        <label>Paid by
          <select value={v.method} onChange={(e) => set("method", e.target.value)}>
            {["EFT", "Debit order", "Card", "Cash", "Other"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label>Bank reference<input value={v.reference} onChange={(e) => set("reference", e.target.value)} placeholder="e.g. MUNCIPAL BILL 12 Oct" /></label>
        <label>Unit (if for one shop)<input value={v.unit_code} onChange={(e) => set("unit_code", e.target.value)} placeholder="e.g. 10" /></label>
        <label className="wide">What it was for<input value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Rates and services, account 231703234, October 2026" /></label>
        <label className="wide">Receipt or invoice (photo or PDF)
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {initial?.receipt_url && !file && <span className="hint">Current: <a href={initial.receipt_url} target="_blank">{initial.receipt_name || "receipt"}</a> — choose a file to replace it</span>}
        </label>
        <label className="wide">Notes<textarea rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </div>
      {cat && (
        <div className={`sars-hint ${cat.deductible}`}>
          <span className={`pill ${DED[cat.deductible][1]}`}>{DED[cat.deductible][0]}</span>
          <div><b>Keep:</b> {cat.docs}.{cat.note ? <> {cat.note}</> : null}</div>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      <div><button disabled={busy}>{busy ? "Saving…" : "Save expense"}</button></div>
    </form>
  );
}

export default function Expenses() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("");
  const [form, setForm] = useState(null); // null | {} (new) | expense (edit)
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const pending = useRef({ id: null, at: 0 });

  const load = useCallback(async () => {
    const r = await fetch(`/api/expenses?period=${period}${cat ? `&category=${cat}` : ""}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) setErr(j.error); else { setErr(""); setData(j); }
  }, [period, cat]);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    const now = Date.now();
    if (pending.current.id !== id || now - pending.current.at > 3000) { pending.current = { id, at: now }; setMsg("Tap × again to delete that expense."); return; }
    await fetch(`/api/expenses/${id}`, { method: "DELETE" }); setMsg("Expense deleted."); load();
  }
  function csv() {
    const head = ["Date", "For month", "Supplier", "Category", "Deductible", "Description", "Amount incl VAT", "VAT", "Paid by", "Reference", "Unit", "Receipt", "Notes"];
    const rows = data.rows.map((r) => [r.spent_on, r.period, r.supplier, CATEGORY[r.category]?.label, CATEGORY[r.category]?.deductible, r.description, r.amount, r.vat, r.method, r.reference, r.unit_code, r.receipt_url, r.notes]);
    const text = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `westfleur-expenses-${period}.csv`;
    a.click();
  }

  const max = Math.max(1, ...(data?.byCategory || []).map((c) => c.amount));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Expenses</h1>
          <p className="meta">Costs paid by Westfleur Centre (Pty) Ltd, with the evidence SARS expects.</p>
        </div>
        <div className="row wrap">
          <label className="month-pick">Month<input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
          <button onClick={() => setForm({})}>Record expense</button>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      {form && <ExpenseForm key={form.id || "new"} period={period} initial={form.id ? form : null} onCancel={() => setForm(null)}
        onSaved={() => { setForm(null); setMsg("Expense saved."); load(); }} />}
      {data && (
        <>
          <div className="summary">
            <div className="stat"><span className="meta">Spent in {label(period)}</span><b>{R(data.total)}</b><span className="meta">{data.rows.length} expense{data.rows.length === 1 ? "" : "s"}{cat ? " in this category" : ""}</span></div>
            <div className="stat"><span className="meta">VAT included</span><b>{R(data.vat)}</b><span className="meta">claimable once VAT-registered</span></div>
            <div className={"stat" + (data.missingReceipts ? " alert" : "")}><span className="meta">Missing receipts</span><b>{data.missingReceipts}</b><span className="meta">SARS can disallow these</span></div>
          </div>
          {data.byCategory.length > 0 && (
            <section className="card">
              <h2>By category</h2>
              <div className="cat-bars">
                {data.byCategory.map((c) => (
                  <button key={c.key} className={"cat-bar" + (cat === c.key ? " on" : "")} onClick={() => setCat(cat === c.key ? "" : c.key)} title="Filter by this category">
                    <span className="cat-name">{c.label}</span>
                    <span className="cat-track"><span style={{ width: `${(c.amount / max) * 100}%` }} /></span>
                    <span className="cat-amt">{R(c.amount)}</span>
                  </button>
                ))}
              </div>
              {cat && <button className="ghost small-btn" onClick={() => setCat("")}>Show all categories</button>}
            </section>
          )}
          <div className="bar" style={{ marginTop: 16 }}>
            {data.rows.length > 0 && <button className="ghost" onClick={csv}>Download CSV</button>}
            {msg && <span className="pill ok">{msg}</span>}
          </div>
          <div className="scroll">
            <table>
              <thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>What for</th><th className="num">Amount</th><th className="num">VAT</th><th>Receipt</th><th>Checks</th><th></th></tr></thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={9} className="meta">No expenses recorded for {label(period)}. Tap “Record expense” to add one.</td></tr>}
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{dateZA(r.spent_on)}</td>
                    <td><b>{r.supplier}</b>{r.reference && <div className="meta">{r.reference}</div>}</td>
                    <td>{CATEGORY[r.category]?.label || r.category}</td>
                    <td>{r.description}{r.unit_code && <div className="meta">Shop {r.unit_code}</div>}</td>
                    <td className="num">{R(r.amount)}</td>
                    <td className="num">{r.vat ? R(r.vat) : "—"}</td>
                    <td>{r.receipt_url ? <a href={r.receipt_url} target="_blank">View</a> : <span className="pill bad">None</span>}</td>
                    <td>{r.flags.filter((f) => f !== "No receipt").map((f) => <span key={f} className={`pill ${f === "Not deductible" ? "bad" : "warn"}`}>{f}</span>)}</td>
                    <td className="nowrap"><button className="linkish small" onClick={() => setForm(r)}>edit</button>
                      <button className="linkish" onClick={() => remove(r.id)} aria-label="Delete expense">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta">Keep receipts and invoices for at least five years (Tax Administration Act s29). Personal spending paid from the company account isn&apos;t a business expense — record it as “Personal / non-business” so it can go to the director&apos;s loan account.</p>
        </>
      )}
    </>
  );
}
