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
  const [items, setItems] = useState([]);

  useEffect(() => {
    setMsg("");
    api(`/api/city-bill?period=${period}`).then((r) => {
      setD(r);
      setV(r.bill ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, r.bill[k] ?? ""])) : EMPTY);
      const base = (r.items.length ? r.items : r.suggested).map((i) => ({ ...i, usage: i.usage ?? "", amount: i.amount ?? "", usage_period: i.usage_period ?? "" }));
      // Every shared City meter gets a row, even in a month where nothing was entered yet.
      for (const g of r.shared) if (!base.some((i) => i.shared && i.meter_no === g.meter_no)) {
        base.push({ shared: true, unit_code: null, service: g.service, meter_no: g.meter_no, usage: "", usage_unit: "kL", usage_period: "", amount: "" });
      }
      setItems(base);
      setOpen(!r.bill);
    }).catch((e) => setMsg(e.message));
  }, [period]);

  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  async function save() {
    setMsg("");
    try { const r = await api("/api/city-bill", "PUT", { ...v, period, items }); setD(r); setOpen(false); setMsg("Saved — tap “Rebuild all drafts” if drafts were already prepared"); onSaved?.(); }
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
      {!open && d.items.length > 0 && (
        <table className="tight">
          <thead><tr><th>Tenant meter on the City account</th><th className="num">Use</th><th className="num">City amount excl VAT</th></tr></thead>
          <tbody>{d.items.map((i) => (
            <tr key={i.id}><td>{i.shared ? "Shared" : d.units.find((u) => u.code === i.unit_code)?.name || i.unit_code} – {i.service} meter {i.meter_no} {i.usage_period ? `(${i.usage_period})` : ""}</td>
              <td className="num">{i.usage ? `${Number(i.usage).toLocaleString("en-ZA")} ${i.usage_unit || ""}` : ""}</td><td className="num">{R(i.amount)}</td></tr>
          ))}</tbody>
        </table>
      )}
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
            <div className="wide">
              <h3>Tenant meters on the City account</h3>
              <p className="meta">Meters the City bills on your account that serve one tenant (e.g. Visfabriek&apos;s electricity, meter 74861) or a group of tenants (e.g. water meter C-XJK3343). Enter the meter&apos;s total from the bill <b>excluding VAT</b>, including its fixed/service charges — for a water meter, add the water and sewerage lines for that meter. Shared meters are split by the members&apos; floor area.</p>
              <table className="lines">
                <thead><tr><th>Unit</th><th>Service</th><th>Meter no.</th><th className="num">Use</th><th>Period</th><th className="num">Amount excl VAT</th><th></th></tr></thead>
                <tbody>{items.map((it, i) => {
                  const up = (k, x) => setItems((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: x } : l)));
                  return (
                    <tr key={i}>
                      <td>{it.shared
                        ? <span className="meta">Shared: {d.shared.find((g) => g.meter_no === it.meter_no)?.members.map((m) => m.trading_name).join(", ") || "group"}</span>
                        : <select value={it.unit_code || ""} onChange={(e) => up("unit_code", e.target.value)}>
                            <option value="">Choose…</option>{d.units.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}</select>}</td>
                      <td><select value={it.service} onChange={(e) => up("service", e.target.value)}><option value="electricity">Electricity</option><option value="water">Water</option></select></td>
                      <td><input value={it.meter_no || ""} onChange={(e) => up("meter_no", e.target.value)} placeholder="74861" /></td>
                      <td className="num"><input className="n" inputMode="decimal" value={it.usage} onChange={(e) => up("usage", e.target.value)} placeholder="9853" /></td>
                      <td><input value={it.usage_period} onChange={(e) => up("usage_period", e.target.value)} placeholder="16 Sep – 15 Oct 2026" /></td>
                      <td className="num"><input className="n" inputMode="decimal" value={it.amount} onChange={(e) => up("amount", e.target.value)} placeholder={it.shared ? "768.94" : "33177.91"} /></td>
                      <td><button className="linkish" onClick={() => setItems((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove">×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <button className="ghost small-btn" style={{ marginTop: 6 }} onClick={() => setItems((ls) => [...ls, { unit_code: "3", service: "electricity", meter_no: "", usage: "", usage_unit: "kWh", usage_period: "", amount: "" }])}>+ Add tenant meter</button>
            </div>
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
                <td className="num">{pct(r.share)}</td><td className="num">{r.onShared ? <span className="meta">on shared meter</span> : r.fixed === null ? "—" : `${R(r.fixed)} (${pct(r.fshare)})`}</td><td className="num">{r.refuse === null ? "—" : R(r.refuse)}</td></tr>
            ))}
            <tr><td colSpan={3} className="meta">Company&apos;s own share (vacant units, gym, common areas)</td><td className="num">{pct(d.companyShare)}</td><td colSpan={2}></td></tr>
          </tbody>
        </table>
        {d.shared.map((g) => (
          <div key={g.meter_no} style={{ marginTop: 12 }}>
            <h3>Shared City meter {g.meter_no}</h3>
            {g.missing.length > 0 && <p className="warnbox">Not split until these tenants have a unit with a floor area: {g.missing.join(", ")}.</p>}
            <table className="tight">
              <thead><tr><th>Tenant</th><th>Unit</th><th className="num">Area</th><th className="num">Share</th><th className="num">Amount</th></tr></thead>
              <tbody>{g.split.map((m) => (
                <tr key={m.tenant_id}><td>{m.trading_name}</td><td>{m.unit || <span className="warnbox">no unit</span>}</td>
                  <td className="num">{m.area ? `${m.area} m²` : "—"}</td><td className="num">{pct(m.share)}</td><td className="num">{m.amount === null ? "—" : R(m.amount)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ))}
        <p className="meta">
          Fixed charges are split over {d.fixedArea} m² — the let area not on a shared meter.
          Amounts shown include the City&apos;s 15% VAT, since the company isn&apos;t VAT-registered and recovers its actual cost. Water and sewerage <i>use</i> are billed from each tenant&apos;s own meter; only the fixed connection charges and refuse are split by area.
          {d.basis === "let" ? " Split over the area actually let, as the leases provide (clauses 10.3 and 11.2) — change this under Settings → Invoices." : " Split over the whole building — the company carries the share of vacant and own-use space."}
        </p>
      </details>
    </section>
  );
}
