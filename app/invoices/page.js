"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { R, api, dateZA } from "../tenants/ui";
import CityBill from "./city-bill";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

function PaymentForm({ tenants, onSaved }) {
  const [v, setV] = useState({ tenant_id: "", paid_on: today(), amount: "", reference: "" });
  const [err, setErr] = useState("");
  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  async function save() {
    setErr("");
    try { await api("/api/payments", "POST", v); setV({ ...v, amount: "", reference: "" }); onSaved(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <div className="card">
      <h2>Record a payment</h2>
      <div className="form-grid">
        <label>Tenant
          <select value={v.tenant_id} onChange={(e) => set("tenant_id", e.target.value)}>
            <option value="">Choose…</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.trading_name}</option>)}
          </select>
        </label>
        <label>Date received<input type="date" value={v.paid_on} onChange={(e) => set("paid_on", e.target.value)} /></label>
        <label>Amount (R)<input inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} placeholder="7 537,07" /></label>
        <label>Reference<input value={v.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Bank reference" /></label>
      </div>
      {err && <p className="err">{err}</p>}
      <div><button onClick={save}>Save payment</button></div>
    </div>
  );
}

export default function Invoices() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/invoices?period=${period}`));
      setPayments(await api("/api/payments"));
    } catch (e) { setErr(e.message); }
  }, [period]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api("/api/tenants").then((d) => setTenants(d.tenants.filter((t) => t.active))).catch(() => {}); }, []);

  async function act(action, label) {
    setBusy(label); setErr(""); setMsg("");
    try {
      const r = await api("/api/invoices", "POST", { action, period });
      setMsg(action === "prepare"
        ? `${r.created} draft${r.created === 1 ? "" : "s"} prepared${r.skipped ? ` (${r.skipped} tenant${r.skipped === 1 ? "" : "s"} already invoiced)` : ""}.`
        : `Issued ${r.issued.length}: ${r.issued.join(", ") || "none"}.`);
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  }

  const pending = useRef(0);
  async function removePayment(id) {
    if (Date.now() - pending.current > 3000) { pending.current = Date.now(); setMsg("Tap × again to delete that payment."); return; }
    await api(`/api/payments/${id}`, "DELETE"); setMsg(""); load();
  }

  const inv = data?.invoices || [];
  const drafts = inv.filter((i) => i.status === "draft");
  const issued = inv.filter((i) => i.status === "issued" && i.kind === "invoice");
  const warnCount = drafts.reduce((s, d) => s + (d.warnings?.length || 0), 0);

  return (
    <>
      <h1>Invoices</h1>
      <div className="bar">
        <label>Billing month<input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
        <button onClick={() => act("prepare", "Preparing…")} disabled={!!busy}>{busy === "Preparing…" ? busy : "Prepare drafts"}</button>
        <button className={confirmAll ? "danger" : "ghost"} disabled={!!busy || !drafts.length}
          onClick={() => { if (!confirmAll) { setConfirmAll(true); return; } setConfirmAll(false); act("issue-all", "Issuing…"); }}>
          {busy === "Issuing…" ? busy : confirmAll
            ? `Tap again to issue ${drafts.length}${warnCount ? ` — ${warnCount} warning${warnCount === 1 ? "" : "s"} not checked` : ""}`
            : `Issue all drafts (${drafts.length})`}
        </button>
        {data && <span className="pill">Next number {data.nextNumber}</span>}
        <span className={"pill" + (data?.vatFrom ? " ok" : "")}>{data?.vatFrom ? `VAT from ${dateZA(data.vatFrom)}` : "Not VAT-registered"}</span>
      </div>
      {msg && <p className="pill ok" style={{ display: "inline-block" }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
      {warnCount > 0 && <p className="warnbox">{warnCount} thing{warnCount === 1 ? "" : "s"} to check on the drafts — open each one marked ⚠ before issuing.</p>}

      <CityBill period={period} onSaved={load} />

      <div className="summary">
        <div className="stat"><span className="meta">Drafts</span><b>{drafts.length}</b><span className="meta">{R(drafts.reduce((s, d) => s + d.total, 0))}</span></div>
        <div className="stat"><span className="meta">Issued this month</span><b>{issued.length}</b><span className="meta">{R(issued.reduce((s, d) => s + d.total, 0))}</span></div>
      </div>

      <div className="scroll">
        <table>
          <thead><tr><th>Unit</th><th>Tenant</th><th>Number</th><th>Date</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {inv.length === 0 && <tr><td colSpan={7} className="meta">No invoices for this month yet. Capture the meter readings, then tap “Prepare drafts”.</td></tr>}
            {inv.map((i) => (
              <tr key={i.id}>
                <td>{i.unit_name || "—"}</td>
                <td><Link href={`/invoices/${i.id}`}><b>{i.trading_name}</b></Link></td>
                <td>{i.number || <span className="meta">draft</span>}{i.kind === "credit" && <div className="meta">credit note</div>}</td>
                <td>{dateZA(i.issue_date)}</td>
                <td className="num">{R(i.total)}</td>
                <td>
                  <span className={"pill " + (i.status === "issued" ? (i.credited_by ? "" : "ok") : "warn")}>
                    {i.status === "issued" ? (i.credited_by ? `credited (${i.credited_by})` : "issued") : "draft"}
                  </span>
                  {i.status === "draft" && i.warnings?.length > 0 && <span className="warnbox" title={i.warnings.join("\n")}> ⚠ {i.warnings.length}</span>}
                </td>
                <td className="nowrap">
                  <Link href={`/invoices/${i.id}`}>{i.status === "draft" ? "Review" : "Open"}</Link>{" · "}
                  <a href={`/api/invoices/${i.id}/pdf`} target="_blank">PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ margin: "24px 0 8px" }}>Tenant balances</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Tenant</th><th className="num">Invoiced</th><th className="num">Paid</th><th className="num">Balance</th><th>Last payment</th></tr></thead>
          <tbody>
            {(data?.balances || []).length === 0 && <tr><td colSpan={5} className="meta">Balances appear once invoices are issued from the app.</td></tr>}
            {(data?.balances || []).map((b) => {
              const bal = Math.round((b.billed - b.paid) * 100) / 100;
              return (
                <tr key={b.id}>
                  <td>{b.trading_name}</td><td className="num">{R(b.billed)}</td><td className="num">{R(b.paid)}</td>
                  <td className="num"><b className={bal > 0.5 ? "warnbox" : ""}>{R(bal)}</b></td><td>{dateZA(b.last_paid)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="meta">Balances only include invoices issued from this app (INV0000455 onwards) and payments recorded here.</p>

      <div className="stack" style={{ marginTop: 16 }}>
        <PaymentForm tenants={tenants} onSaved={load} />
        {payments.length > 0 && (
          <details className="card">
            <summary>Recent payments ({payments.length})</summary>
            <table className="tight">
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}><td className="nowrap">{dateZA(p.paid_on)}</td><td>{p.trading_name}</td><td className="num">{R(p.amount)}</td>
                    <td className="meta">{p.reference}</td><td><button className="linkish" onClick={() => removePayment(p.id)} aria-label="Delete payment">×</button></td></tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </>
  );
}
