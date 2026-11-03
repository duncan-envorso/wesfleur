"use client";
import { useEffect, useState } from "react";
import { money } from "@/lib/calc";

const fmt = (n, d = 3) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-ZA", { minimumFractionDigits: d, maximumFractionDigits: d }));
const lastMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 7); };

function toCsv(data) {
  const head = ["Meter", "Shop", "Tenant", "Type", "Previous period", "Previous", "Current", "Used", "Unit", "Water/Electricity", "Sewerage", "Total", "Recharge", "Read on", "Read by", "Photo", "Note"];
  const rows = data.meters.map((m) => {
    const unit = m.type === "electricity" ? "kWh" : "kL";
    return [m.name, m.shop, m.tenant, m.type, m.previous_period, m.previous, m.current, m.calc.usage, unit,
      m.calc.lines[0]?.amount, m.calc.lines[1]?.amount ?? "", m.calc.total, m.recharge ? "yes" : "no",
      m.read_on ? String(m.read_on).slice(0, 10) : "", m.read_by, m.photo_url, m.note];
  });
  return [head, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function Report() {
  const [period, setPeriod] = useState(lastMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    fetch(`/api/readings?period=${period}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) setError(j.error); else { setError(""); setData(j); }
    });
  }, [period]);

  function download() {
    const blob = new Blob([toCsv(data)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `westfleur-meters-${period}.csv`;
    a.click();
  }

  const rec = data?.reconciliation;
  const t = data?.tariffs;

  return (
    <>
      <h1>Meter report — {period}</h1>
      <div className="bar">
        <label>Billing month
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
        {data && <button className="ghost" onClick={download}>Download CSV</button>}
        {data && <button className="ghost" onClick={() => window.print()}>Print</button>}
      </div>
      {error && <p className="err">{error}</p>}
      {!data && !error && <p className="meta">Loading…</p>}
      {data && (
        <>
          <div className="summary">
            <div className="stat"><span className="meta">To recharge to tenants</span><b>{money(data.rechargeTotal)}</b></div>
            {rec && <div className="stat"><span className="meta">City main meter</span><b>{fmt(rec.mainUsage)} kL</b></div>}
            {rec && <div className="stat"><span className="meta">Sum of sub-meters</span><b>{fmt(rec.subTotal)} kL</b></div>}
            {rec && (
              <div className={"stat" + (Math.abs(rec.unaccounted) > 1 ? " alert" : "")}>
                <span className="meta">Unaccounted (leaks / common / unmetered)</span>
                <b>{fmt(rec.unaccounted)} kL · {money(rec.unaccountedCost)}</b>
                {rec.missing.length > 0 && <span className="meta">Missing readings: {rec.missing.join(", ")}</span>}
              </div>
            )}
            {!rec && <div className="stat"><span className="meta">Reconciliation</span><span className="meta">Read the City main meter this month and last to see unaccounted water.</span></div>}
          </div>

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Meter</th><th>Tenant</th><th className="num">Previous</th><th className="num">Current</th>
                  <th className="num">Used</th><th className="num">Water / elec.</th><th className="num">Sewerage</th>
                  <th className="num">Total</th><th>Photos</th>
                </tr>
              </thead>
              <tbody>
                {data.meters.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}{!m.recharge && <div className="meta">not recharged</div>}</td>
                    <td>{m.tenant}{m.note && <div className="meta">{m.note}</div>}</td>
                    <td className="num">{fmt(m.previous, 4)}<div className="meta">{m.previous_period}</div></td>
                    <td className="num">{fmt(m.current, 4)}</td>
                    <td className="num">{fmt(m.calc.usage)} {m.calc.usage !== null && (m.type === "electricity" ? "kWh" : "kL")}
                      {m.calc.warning && <div className="warnbox">{m.calc.warning}</div>}</td>
                    <td className="num">{money(m.calc.lines[0]?.amount)}</td>
                    <td className="num">{m.calc.lines[1] ? money(m.calc.lines[1].amount) : ""}</td>
                    <td className="num"><b>{money(m.calc.total)}</b></td>
                    <td>
                      <div className="thumbs">
                        {m.previous_photo_url && <a href={m.previous_photo_url} target="_blank" title="Previous"><img src={m.previous_photo_url} alt="previous" /></a>}
                        {m.photo_url && <a href={m.photo_url} target="_blank" title="Current"><img src={m.photo_url} alt="current" /></a>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta">
            Tariffs: water {money(t.water_per_kl)}/kL, sewerage {money(t.sewer_per_kl)}/kL on {Math.round(t.sewer_pct * 100)}% of water,
            electricity {money(t.electricity_per_kwh)}/kWh, {t.add_vat ? `plus ${Math.round(t.vat_rate * 100)}% VAT` : "excl. VAT"}.
            Change them under Settings.
          </p>
        </>
      )}
    </>
  );
}
