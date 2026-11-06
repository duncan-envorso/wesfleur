"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { R, api, dateZA } from "../tenants/ui";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const label = (p) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const STATUS = {
  paid: ["Paid", "ok"], overpaid: ["In credit", "info"], part: ["Part paid", "warn"], unpaid: ["Unpaid", "bad"], nothing: ["Nothing due", ""],
};

function RecordRow({ row, period, onSaved, onCancel }) {
  const [v, setV] = useState({ paid_on: today(), amount: row.due > 0 ? String(row.due) : "", reference: "", period });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr("");
    try { await api("/api/payments", "POST", { ...v, tenant_id: row.tenant_id }); onSaved(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <tr className="inline-form-row">
      <td colSpan={10}>
        <div className="inline-form">
          <label>Date received<input type="date" value={v.paid_on} onChange={(e) => setV({ ...v, paid_on: e.target.value })} /></label>
          <label>Amount (R)<input inputMode="decimal" value={v.amount} autoFocus onChange={(e) => setV({ ...v, amount: e.target.value })} /></label>
          <label>Bank reference<input value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} placeholder="e.g. FNB 30 Oct — MAREBOLE" /></label>
          <label>For month<input type="month" value={v.period} onChange={(e) => setV({ ...v, period: e.target.value })} /></label>
          <div className="row wrap" style={{ alignSelf: "end" }}>
            <button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save payment"}</button>
            <button className="ghost" onClick={onCancel}>Cancel</button>
          </div>
        </div>
        {err && <p className="err">{err}</p>}
      </td>
    </tr>
  );
}

export default function Payments() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const pending = useRef({ id: null, at: 0 });

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([api(`/api/collections?period=${period}`), api(`/api/payments?period=${period}`)]);
      setData(c); setList(p); setErr("");
    } catch (e) { setErr(e.message); }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    const now = Date.now();
    if (pending.current.id !== id || now - pending.current.at > 3000) { pending.current = { id, at: now }; setMsg("Tap × again to delete that payment."); return; }
    await api(`/api/payments/${id}`, "DELETE"); setMsg("Payment deleted."); load();
  }

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="meta">Loading…</p>;
  const t = data.totals;
  const rows = data.rows.filter((r) => filter === "all" || (filter === "due" ? r.due > 0.5 : r.status === "paid" || r.status === "overpaid"));
  const pct = t.invoiced + t.bf > 0 ? Math.min(100, Math.round((t.paid / (t.invoiced + Math.max(t.bf, 0))) * 100)) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p className="meta">What each tenant owes for {label(period)}, including anything brought forward.</p>
        </div>
        <label className="month-pick">Month<input type="month" value={period} onChange={(e) => { setPeriod(e.target.value); setOpen(null); }} /></label>
      </div>

      <div className="summary">
        <div className="stat"><span className="meta">Invoiced for {label(period)}</span><b>{R(t.invoiced)}</b>
          <span className="meta">{t.bf ? `+ ${R(t.bf)} brought forward` : "nothing brought forward"}</span></div>
        <div className="stat"><span className="meta">Received</span><b>{R(t.paid)}</b>
          <div className="progress" aria-label={`${pct}% collected`}><span style={{ width: `${pct}%` }} /></div>
          <span className="meta">{pct}% collected</span></div>
        <div className={"stat" + (t.outstanding > 0.5 ? " alert" : "")}><span className="meta">Still due</span><b>{R(t.outstanding)}</b>
          <span className="meta">{t.tenantsDue} tenant{t.tenantsDue === 1 ? "" : "s"} owing</span></div>
      </div>

      <div className="bar">
        <div className="segmented" role="group" aria-label="Show">
          {[["all", "All tenants"], ["due", "Owing"], ["paid", "Paid"]].map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        {msg && <span className="pill ok">{msg}</span>}
      </div>

      <div className="scroll">
        <table className="collections">
          <thead>
            <tr><th>Unit</th><th>Tenant</th><th className="num">Brought forward</th><th className="num">This month</th>
              <th className="num">Paid</th><th className="num">Waived</th><th className="num">Due</th><th>Status</th><th>Last paid</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="meta">Nobody in this view.</td></tr>}
            {rows.map((r) => {
              const [s, cls] = STATUS[r.status];
              return [
                <tr key={r.tenant_id} className={r.due > 0.5 ? "owing" : ""}>
                  <td>{r.unit_name || "—"}</td>
                  <td><Link href={`/tenants/${r.tenant_id}`}><b>{r.trading_name}</b></Link></td>
                  <td className="num">{r.bf ? R(r.bf) : <span className="meta">—</span>}</td>
                  <td className="num">{r.invoiced ? R(r.invoiced) : <span className="meta">—</span>}
                    <div className="meta">{r.invoiceState === "issued" ? r.numbers.join(", ") : r.invoiceState === "draft" ? "draft" : "no invoice yet"}</div></td>
                  <td className="num">{r.paid ? R(r.paid) : <span className="meta">—</span>}</td>
                  <td className="num">{r.adjusted ? R(-r.adjusted) : <span className="meta">—</span>}</td>
                  <td className="num due">{R(r.due)}</td>
                  <td><span className={`pill ${cls}`}>{s}</span></td>
                  <td className="nowrap">{dateZA(r.last_paid)}</td>
                  <td><button className="ghost small-btn" onClick={() => setOpen(open === r.tenant_id ? null : r.tenant_id)}>Record</button></td>
                </tr>,
                open === r.tenant_id && <RecordRow key={`f${r.tenant_id}`} row={r} period={period} onCancel={() => setOpen(null)}
                  onSaved={() => { setOpen(null); setMsg(`Payment saved for ${r.trading_name}.`); load(); }} />,
              ];
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={2}><b>Total</b></td><td className="num">{R(t.bf)}</td><td className="num">{R(t.invoiced)}</td>
              <td className="num">{R(t.paid)}</td><td className="num">{t.adjusted ? R(-t.adjusted) : "—"}</td><td className="num"><b>{R(t.due)}</b></td><td colSpan={3}></td></tr>
          </tfoot>
        </table>
      </div>
      <p className="meta">“This month” uses the issued invoice, or the draft until it&apos;s issued. Rent paid in advance counts toward the month it&apos;s for. Brought forward only includes invoices issued from this app (INV0000455 onwards).</p>

      <section className="card" style={{ marginTop: 20 }}>
        <h2>Payments received for {label(period)} ({list.length})</h2>
        {list.length === 0 ? <p className="meta">None recorded yet.</p> : (
          <table className="tight">
            <thead><tr><th>Date</th><th>Tenant</th><th className="num">Amount</th><th>Reference</th><th></th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}><td className="nowrap">{dateZA(p.paid_on)}</td><td>{p.trading_name}</td><td className="num">{R(p.amount)}</td>
                  <td className="meta">{p.reference}</td><td><button className="linkish" onClick={() => remove(p.id)} aria-label="Delete payment">×</button></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
