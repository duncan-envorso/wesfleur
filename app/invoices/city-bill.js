"use client";
import { useEffect, useState } from "react";
import { R, api } from "../tenants/ui";

const EMPTY = { bill_date: "", account_no: "", water_fixed: "", sewer_fixed: "", refuse: "", water_kl: "", notes: "" };
const pct = (x) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(2)}%`);

export default function CityBill({ period, onSaved }) {
  const [d, setD] = useState(null);
  const [v, setV] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMsg("");
    api(`/api/city-bill?period=${period}`).then((r) => {
      setD(r);
      setV(r.bill ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, r.bill[k] ?? ""])) : EMPTY);
      setOpen(!r.bill);
    }).catch((e) => setMsg(e.message));
  }, [period]);

  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  async function save() {
    setMsg("");
    try { const r = await api("/api/city-bill", "PUT", { ...v, period }); setD(r); setOpen(false); setMsg("Saved — tap “Rebuild all drafts” if drafts were already prepared"); onSaved?.(); }
    catch (e) { setMsg(e.message); }
  }
  if (!d) return null;
  const b = d.bill;
  return (
    <section className="card" style={{ margin: "16px 0" }}>
      <div className="row">
        <h2>City bill for this month</h2>
        {b ? <span className="pill ok">Entered</span> : <span className="pill warn">Not entered</span>}
      </div>
      {b && !open && (
        <div className="facts">
          <div><span className="meta">Fixed water</span><b>{R(b.water_fixed)}</b></div>
          <div><span className="meta">Fixed sewerage</span><b>{R(b.sewer_fixed)}</b></div>
          <div><span className="meta">Refuse</span><b>{R(b.refuse)}</b></div>
          <div><span className="meta">Centre water used</span><b>{b.water_kl ? `${b.water_kl} kL` : "—"}</b>
            <span className="meta">{b.water_kl ? `shop meters: ${d.meteredKl} kL` : ""}</span></div>
        </div>
      )}
      {open && (
        <>
          <p className="meta">From the City of Cape Town account, enter the amounts <b>excluding VAT</b> (the figures before “Add 15% VAT”). Use the bill whose charges you are recovering on this month&apos;s invoices.</p>
          <div className="form-grid">
            <label>Bill date<input type="date" value={v.bill_date} onChange={(e) => set("bill_date", e.target.value)} /></label>
            <label>City account no.<input value={v.account_no} onChange={(e) => set("account_no", e.target.value)} placeholder="231703234" /></label>
            <label>Fixed water charges (R)<input inputMode="decimal" value={v.water_fixed} onChange={(e) => set("water_fixed", e.target.value)} placeholder="733.82" />
              <span className="hint">All “Fixed Basic Charge” lines under WATER</span></label>
            <label>Fixed sewerage charges (R)<input inputMode="decimal" value={v.sewer_fixed} onChange={(e) => set("sewer_fixed", e.target.value)} placeholder="527.47" />
              <span className="hint">All “Fixed Basic Charge” lines under SEWERAGE</span></label>
            <label>Refuse charge (R)<input inputMode="decimal" value={v.refuse} onChange={(e) => set("refuse", e.target.value)} placeholder="442.60" /></label>
            <label>Centre water used (kL)<input inputMode="decimal" value={v.water_kl} onChange={(e) => set("water_kl", e.target.value)} placeholder="110" />
              <span className="hint">Optional — checks the shop meters add up</span></label>
            <label className="wide">Notes<input value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. bill 240010083074, water period 19 Sep – 19 Oct" /></label>
          </div>
        </>
      )}
      {msg && <p className={msg.startsWith("Saved") ? "pill ok" : "err"} style={{ justifySelf: "start" }}>{msg}</p>}
      <div className="row wrap">
        {open ? <button onClick={save}>Save City bill</button> : <button className="ghost" onClick={() => setOpen(true)}>Edit City bill</button>}
      </div>
      <details>
        <summary>How it&apos;s split ({d.basis === "total" ? `over ${d.buildingArea} m² building area` : `over ${d.letArea} m² let`})</summary>
        <table className="tight">
          <thead><tr><th>Unit</th><th>Tenant</th><th className="num">Area</th><th className="num">Share</th><th className="num">Fixed charges</th><th className="num">Refuse</th></tr></thead>
          <tbody>
            {d.split.map((r) => (
              <tr key={r.code}><td>{r.unit}</td><td>{r.tenant}</td><td className="num">{r.area ? `${r.area} m²` : <span className="warnbox">missing</span>}</td>
                <td className="num">{pct(r.share)}</td><td className="num">{r.fixed === null ? "—" : R(r.fixed)}</td><td className="num">{r.refuse === null ? "—" : R(r.refuse)}</td></tr>
            ))}
            <tr><td colSpan={3} className="meta">Company&apos;s own share (vacant units, gym, common areas)</td><td className="num">{pct(d.companyShare)}</td><td colSpan={2}></td></tr>
          </tbody>
        </table>
        <p className="meta">
          Amounts shown include the City&apos;s 15% VAT, since the company isn&apos;t VAT-registered and recovers its actual cost. Water and sewerage <i>use</i> are billed from each tenant&apos;s own meter; only the fixed connection charges and refuse are split by area.
          {d.basis === "let" ? " Split over the area actually let, as the leases provide (clauses 10.3 and 11.2) — change this under Settings → Invoices." : " Split over the whole building — the company carries the share of vacant and own-use space."}
        </p>
      </details>
    </section>
  );
}
