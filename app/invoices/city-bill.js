"use client";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { R, api } from "../tenants/ui";

const EMPTY = { bill_date: "", account_no: "", water_fixed: "", sewer_fixed: "", refuse: "", water_kl: "", rates: "", water_use: "",
  sewer_use: "", bulk_elec: "", bulk_elec_fixed: "", bulk_elec_kwh: "", other_charges: "", notes: "" };
const gapCls = (g) => (g < -0.5 ? "err" : g > 0.5 ? "warnbox" : "");
const pct = (x) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(2)}%`);

export default function CityBill({ period, onSaved }) {
  const [d, setD] = useState(null);
  const [v, setV] = useState(EMPTY);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [prepaid, setPrepaid] = useState([]);
  const [openRow, setOpenRow] = useState(null);

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
      setPrepaid((r.prepaid.length ? r.prepaid : r.prepaidSuggested).map((p) => ({ meter_no: p.meter_no, label: p.label || "", unit_code: p.unit_code || "",
        kwh: p.kwh ?? "", tokens: p.tokens ?? "", recovery: p.recovery ?? "", statement_period: p.statement_period || "" })));
      setOpen(!r.bill);
    }).catch((e) => setMsg(e.message));
  }, [period]);

  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  async function save() {
    setMsg("");
    try { const r = await api("/api/city-bill", "PUT", { ...v, period, items, prepaid }); setD(r); setOpen(false); setMsg("Saved — tap “Rebuild all drafts” if drafts were already prepared"); onSaved?.(); }
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
              <h3>Rest of the bill</h3>
              <p className="meta">So the app can compare the whole City account with what you recover. Excluding VAT; rates carry no VAT.</p>
            </div>
            <label>Property rates (R)<input inputMode="decimal" value={v.rates} onChange={(e) => set("rates", e.target.value)} placeholder="10118.20" /></label>
            <label>Water consumption charge (R)<input inputMode="decimal" value={v.water_use} onChange={(e) => set("water_use", e.target.value)} placeholder="4351.60" />
              <span className="hint">Centre main meter only — not a tenant or shared meter below</span></label>
            <label>Sewerage disposal charge (R)<input inputMode="decimal" value={v.sewer_use} onChange={(e) => set("sewer_use", e.target.value)} placeholder="3090.07" />
              <span className="hint">Centre main meter only</span></label>
            <label>Bulk electricity total (R)<input inputMode="decimal" value={v.bulk_elec} onChange={(e) => set("bulk_elec", e.target.value)} placeholder="7847.58" />
              <span className="hint">“Multiple cons. meters” — consumption + service & wires, feeding the prepaid sub-meters</span></label>
            <label>…of which service & wires (R)<input inputMode="decimal" value={v.bulk_elec_fixed} onChange={(e) => set("bulk_elec_fixed", e.target.value)} placeholder="4204.18" /></label>
            <label>Bulk electricity used (kWh)<input inputMode="decimal" value={v.bulk_elec_kwh} onChange={(e) => set("bulk_elec_kwh", e.target.value)} placeholder="1239" /></label>
            <label>Other charges (R)<input inputMode="decimal" value={v.other_charges} onChange={(e) => set("other_charges", e.target.value)} placeholder="179.13" />
              <span className="hint">Dunning, interest and other penalty lines</span></label>
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
            <div className="wide">
              <h3>Prepaid electricity (Citiq building statement)</h3>
              <p className="meta">From Citiq&apos;s building statement: kWh, “Tokens purchased incl VAT” and “Total recovery” for each meter. Link each meter to its real unit — Citiq&apos;s own unit numbers don&apos;t match the shops.</p>
              <table className="lines">
                <thead><tr><th>Citiq meter</th><th>Citiq label</th><th>Unit</th><th className="num">kWh</th><th className="num">Tokens</th><th className="num">Recovery</th><th>Statement period</th><th></th></tr></thead>
                <tbody>{prepaid.map((p, i) => {
                  const up = (k, x) => setPrepaid((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: x } : l)));
                  return (
                    <tr key={i}>
                      <td><input value={p.meter_no} onChange={(e) => up("meter_no", e.target.value)} placeholder="54730327662" /></td>
                      <td><input value={p.label} onChange={(e) => up("label", e.target.value)} placeholder="3 Potters" /></td>
                      <td><select value={p.unit_code} onChange={(e) => up("unit_code", e.target.value)}>
                        <option value="">Choose…</option>{d.units.map((u) => <option key={u.code} value={u.code}>{u.name}</option>)}</select></td>
                      <td className="num"><input className="n" inputMode="decimal" value={p.kwh} onChange={(e) => up("kwh", e.target.value)} /></td>
                      <td className="num"><input className="n" inputMode="decimal" value={p.tokens} onChange={(e) => up("tokens", e.target.value)} /></td>
                      <td className="num"><input className="n" inputMode="decimal" value={p.recovery} onChange={(e) => up("recovery", e.target.value)} /></td>
                      <td><input value={p.statement_period} onChange={(e) => up("statement_period", e.target.value)} placeholder="1–30 Sep 2026" /></td>
                      <td><button className="linkish" onClick={() => setPrepaid((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove">×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <button className="ghost small-btn" style={{ marginTop: 6 }} onClick={() => setPrepaid((ls) => [...ls, { meter_no: "", label: "", unit_code: "", kwh: "", tokens: "", recovery: "", statement_period: ls.at(-1)?.statement_period || "" }])}>+ Add prepaid meter</button>
            </div>
            <label className="wide">Notes<input value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. bill 240010083074, water period 19 Sep – 19 Oct" /></label>
          </div>
        </>
      )}
      {msg && <p className={msg.startsWith("Saved") ? "pill ok" : "err"} style={{ justifySelf: "start" }}>{msg}</p>}
      <div className="row wrap">
        {open ? <button onClick={save}>Save City bill</button> : <button className="ghost" onClick={() => setOpen(true)}>Edit City bill</button>}
      </div>
      {b && !open && d.recovery && (
        <div style={{ marginTop: 8 }}>
          <h3>City bill vs what we recover</h3>
          <table className="tight">
            <thead><tr><th>Service</th><th className="num">City cost</th><th className="num">Recovered</th><th className="num">Gap</th></tr></thead>
            <tbody>
              {d.recovery.rows.filter((r) => r.cost || r.recovered).map((r) => (
                <Fragment key={r.key}>
                  <tr onClick={() => setOpenRow(openRow === r.key ? null : r.key)} style={{ cursor: "pointer" }} aria-expanded={openRow === r.key}>
                    <td><span aria-hidden="true">{openRow === r.key ? "▾" : "▸"}</span> {r.label}<br /><span className="meta">{r.how}</span></td><td className="num">{R(r.cost)}</td>
                    <td className="num">{R(r.recovered)}</td><td className="num"><span className={gapCls(r.gap)}>{r.gap > 0 ? "+" : ""}{R(r.gap)}</span></td></tr>
                  {openRow === r.key && <tr><td colSpan={4}><RowDetail row={r} /></td></tr>}
                </Fragment>
              ))}
              <tr><td><b>Total</b></td><td className="num"><b>{R(d.recovery.total.cost)}</b></td><td className="num"><b>{R(d.recovery.total.recovered)}</b></td>
                <td className="num"><b className={gapCls(d.recovery.total.gap)}>{R(d.recovery.total.gap)}</b></td></tr>
            </tbody>
          </table>
          <p className="meta">Costs include the City&apos;s 15% VAT while the company isn&apos;t VAT-registered (rates have none). “Recovered” is this month&apos;s invoice lines — drafts and issued, net of credit notes — plus the Citiq payout. A negative gap is what the company carries; a positive one is over-recovery a tenant could dispute.</p>
          {d.prepaid.length > 0 && (
            <>
              <h3>Prepaid electricity by meter</h3>
              <table className="tight">
                <thead><tr><th>Unit</th><th>Citiq label / meter</th><th className="num">kWh</th><th className="num">Tokens</th><th className="num">Recovery</th><th className="num">Per kWh</th></tr></thead>
                <tbody>{d.prepaid.map((p) => (
                  <tr key={p.id}><td>{p.unit_name || "—"}{p.tenant ? <><br /><span className="meta">{p.tenant}</span></> : p.unit_code ? <><br /><span className="warnbox">vacant</span></> : null}</td>
                    <td>{p.label}<br /><span className="meta">{p.meter_no}</span></td><td className="num">{p.kwh ?? "—"}</td><td className="num">{R(p.tokens)}</td>
                    <td className="num">{R(p.recovery)}</td><td className="num">{p.kwh ? R(p.recovery / p.kwh) : "—"}</td></tr>
                ))}
                  <tr><td colSpan={2}><b>Total</b>{d.prepaid[0]?.statement_period ? <span className="meta"> ({d.prepaid[0].statement_period})</span> : null}</td>
                    <td className="num"><b>{d.recovery.prepaid.kwh}</b></td><td className="num"><b>{R(d.recovery.prepaid.tokens)}</b></td>
                    <td className="num"><b>{R(d.recovery.prepaid.recovery)}</b></td><td className="num">{d.recovery.prepaid.kwh ? R(d.recovery.prepaid.recovery / d.recovery.prepaid.kwh) : "—"}</td></tr>
                </tbody>
              </table>
            </>
          )}
          {d.recovery.flags.length > 0 && (
            <ul className="warnbox" style={{ paddingLeft: 20 }}>{d.recovery.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
          )}
        </div>
      )}
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

// What the City charged for one service, and how each tenant's invoice recovered it.
function RowDetail({ row }) {
  const x = row.detail || { city: [], tenants: [] };
  const w = x.water;
  return (
    <div style={{ display: "grid", gap: 10, padding: "6px 0 10px" }}>
      {x.city.length > 0 && (
        <table className="tight">
          <thead><tr><th>City charged</th><th className="num">Incl VAT</th></tr></thead>
          <tbody>
            {x.city.map((c, i) => <tr key={i}><td>{c.label}</td><td className="num">{R(c.amount)}</td></tr>)}
            <tr><td><b>Total</b></td><td className="num"><b>{R(row.cost)}</b></td></tr>
          </tbody>
        </table>
      )}
      {x.prepaid && <p className="meta">Recovered through Citiq prepaid tokens — see “Prepaid electricity by meter” below.</p>}
      {x.tenants.length > 0 ? (
        <table className="tight">
          <thead><tr><th>Tenant / invoice</th><th>Line</th><th className="num">Use</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {x.tenants.map((t) => (
              <Fragment key={t.invoice_id}>
                {t.lines.map((l, i) => (
                  <tr key={i}>
                    {i === 0 && <td rowSpan={t.lines.length + 1} style={{ verticalAlign: "top" }}>
                      <b>{t.tenant}</b>{t.unit ? <><br /><span className="meta">{t.unit}</span></> : null}<br />
                      <Link href={`/invoices/${t.invoice_id}`}>{t.number || "Draft"}</Link>
                      {t.credit ? <span className="pill"> credit</span> : t.status === "draft" ? <span className="pill warn"> draft</span> : null}</td>}
                    <td>{l.description}</td>
                    <td className="num">{l.quantity !== null && l.unit ? `${Number(l.quantity).toLocaleString("en-ZA")} ${l.unit}` : ""}</td>
                    <td className="num">{R(l.amount)}</td>
                  </tr>
                ))}
                <tr><td className="meta">Subtotal</td><td></td><td className="num"><b>{R(t.total)}</b></td></tr>
              </Fragment>
            ))}
            <tr><td colSpan={3}><b>Recovered from tenants</b></td><td className="num"><b>{R(row.recovered)}</b></td></tr>
            <tr><td colSpan={3}>{row.gap < 0 ? "Not recovered — carried by the company" : row.gap > 0 ? "Over-recovered — tenants could dispute" : "Difference"}</td>
              <td className="num"><span className={gapCls(row.gap)}>{row.gap > 0 ? "+" : ""}{R(row.gap)}</span></td></tr>
          </tbody>
        </table>
      ) : !x.prepaid && <p className="meta">Nothing on this month&apos;s invoices for this service.</p>}
      {w && (
        <p className={w.unmeteredKl > 0.5 ? "warnbox" : "meta"}>
          The City measured <b>{w.cityKl} kL</b> on the centre&apos;s main meter; tenant meter lines this month add up to <b>{w.meteredKl} kL</b>.
          {w.unmeteredKl > 0.5 ? <> The other <b>{w.unmeteredKl} kL</b> (gym, common taps, leaks, unread meters) costs about <b>{R(w.unmeteredCost)}</b> at {R(w.perKl)}/kL incl sewerage.</> : null}
        </p>
      )}
    </div>
  );
}
