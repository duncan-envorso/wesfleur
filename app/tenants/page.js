"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alerts, R, StatusPill, api, dateZA } from "./ui";

export default function Tenants() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showPast, setShowPast] = useState(false);

  useEffect(() => { api("/api/tenants").then(setData).catch((e) => setError(e.message)); }, []);

  const attention = useMemo(() => {
    if (!data) return [];
    return data.tenants.filter((t) => t.active)
      .flatMap((t) => t.alerts.filter((a) => a.level !== "info").map((a) => ({ ...a, t })))
      .sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1));
  }, [data]);

  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="meta">Loading…</p>;

  const rows = data.tenants.filter((t) => showPast || t.active);
  const vacant = data.units.filter((u) => !u.occupied);
  const tot = data.totals;

  return (
    <>
      <div className="row" style={{ alignItems: "baseline" }}>
        <h1>Tenants</h1>
        <Link className="btn" href="/tenants/new">Add tenant</Link>
      </div>

      <RentIncome tenants={data.tenants} vacant={vacant} tot={tot} />

      <div className="summary">
        <div className="stat"><span className="meta">Units let</span><b>{tot.occupiedUnits} of {tot.units}</b>
          <span className="meta">{vacant.length ? "Vacant or unconfirmed: " + vacant.map((u) => u.name).join(", ") : "Fully let"}</span></div>
        <div className={"stat" + (attention.some((a) => a.level === "high") ? " alert" : "")}>
          <span className="meta">Needs attention</span><b>{attention.length}</b>
          <span className="meta">{attention.filter((a) => a.level === "high").length} urgent</span></div>
      </div>

      {attention.length > 0 && (
        <details className="card" open>
          <summary><h2 style={{ display: "inline" }}>Needs attention</h2></summary>
          <ul className="alerts">
            {attention.map((a, i) => (
              <li key={i} className={a.level}>
                <Link href={`/tenants/${a.t.id}`}><b>{a.t.lease?.unit_name || "Unit?"} · {a.t.trading_name}</b></Link> — {a.text}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="bar" style={{ marginTop: 16 }}>
        <label className="check"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past tenants</label>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Unit</th><th>Tenant</th><th>Lease</th><th>Ends</th>
              <th className="num">Rent / month</th><th className="num">Increase</th><th>Next increase</th><th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const l = t.lease;
              const s = l?.state;
              return (
                <tr key={t.id} className={t.active ? "" : "past"}>
                  <td>{l?.unit_name || <span className="meta">Not confirmed</span>}</td>
                  <td><Link href={`/tenants/${t.id}`}><b>{t.trading_name}</b></Link>
                    {t.legal_name && t.legal_name !== t.trading_name && <div className="meta">{t.legal_name}</div>}</td>
                  <td><StatusPill lease={l} />{t.renewal && <div className="meta">Renewal from {dateZA(t.renewal.start_date)}</div>}</td>
                  <td>{dateZA(l?.end_date)}</td>
                  <td className="num">{R(l?.current_rent)}
                    {s?.missed?.length > 0 && <div className="warnbox">should be {R(s.expectedRent)}</div>}</td>
                  <td className="num">{l?.escalation_pct ? `${l.escalation_pct}%` : "—"}</td>
                  <td>{s?.nextDate && !s.nextAfterEnd ? <>{dateZA(s.nextDate)}<div className="meta">→ {R(s.nextAmount)}</div></> : <span className="meta">{s?.nextAfterEnd ? "after lease ends" : "—"}</span>}</td>
                  <td>{t.active ? <Alerts alerts={t.alerts.filter((a) => a.level !== "info")} compact /> : <span className="meta">Past tenant</span>}</td>
                </tr>
              );
            })}
            {vacant.map((u) => (
              <tr key={"u" + u.id} className="past">
                <td>{u.name}</td><td colSpan={7}><span className="pill">Vacant / unconfirmed</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">Rents are as billed, excluding VAT. Increases are worked out from each lease&apos;s escalation rate and increase date.</p>
    </>
  );
}

// The headline: total rent per month (excl. VAT, rent only), with each tenant's share.
function RentIncome({ tenants, vacant, tot }) {
  const rows = tenants.filter((t) => t.active && t.lease?.current_rent > 0)
    .map((t) => ({ id: t.id, name: t.trading_name, unit: t.lease.unit_name, rent: t.lease.current_rent,
      due: t.lease.state?.missed?.length ? t.lease.state.expectedRent : null }))
    .sort((a, b) => b.rent - a.rent);
  const max = rows[0]?.rent || 1;
  const short = tot.expected - tot.monthly;
  return (
    <section className="card rentincome" aria-labelledby="rent-h">
      <div className="ri-head">
        <div>
          <h2 id="rent-h" className="meta ri-label">Rent income per month</h2>
          <div className="ri-total">{R(tot.monthly)}</div>
          <div className="meta">{R(tot.annual)} a year · excl. VAT · rent only (no utilities or recoveries) · {rows.length} paying tenant{rows.length === 1 ? "" : "s"}</div>
        </div>
        {short > 0.5 && (
          <div className="ri-short">
            <span className="meta">Should be, with missed increases</span>
            <b>{R(tot.expected)}</b>
            <span className="meta">{R(short)} a month not being billed</span>
          </div>
        )}
      </div>
      <ul className="ri-list">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/tenants/${r.id}`} className="ri-name"><b>{r.name}</b><span className="meta">{r.unit || "Unit?"}</span></Link>
            <span className="ri-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, (r.rent / max) * 100)}%` }} /></span>
            <span className="ri-amt">{R(r.rent)}{r.due && <span className="ri-due">should be {R(r.due)}</span>}</span>
            <span className="ri-pct meta">{tot.monthly ? Math.round((r.rent / tot.monthly) * 1000) / 10 : 0}%</span>
          </li>
        ))}
        {vacant.map((u) => (
          <li key={"v" + u.id} className="ri-vacant">
            <span className="ri-name"><b>{u.name}</b><span className="meta">Vacant or unconfirmed</span></span>
            <span className="ri-bar" aria-hidden="true" />
            <span className="ri-amt meta">R0</span>
            <span className="ri-pct meta">—</span>
          </li>
        ))}
      </ul>
      <div className="ri-foot"><span>Total per month</span><b>{R(tot.monthly)}</b></div>
    </section>
  );
}
