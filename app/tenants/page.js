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

      <div className="summary">
        <div className="stat"><span className="meta">Rent billed per month</span><b>{R(tot.monthly)}</b><span className="meta">{R(tot.annual)} a year, excl. VAT</span></div>
        {tot.expected > tot.monthly + 0.5 && (
          <div className="stat alert"><span className="meta">If missed increases were applied</span><b>{R(tot.expected)}</b><span className="meta">{R(tot.expected - tot.monthly)} a month more</span></div>
        )}
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
