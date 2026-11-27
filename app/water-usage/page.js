"use client";
import { useEffect, useState } from "react";
import { money } from "@/lib/calc";

const fmt = (n, d = 3) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-ZA", { minimumFractionDigits: d, maximumFractionDigits: d }));
const month = (shift = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + shift); return d.toISOString().slice(0, 7); };
const label = (p) => new Date(`${p}-01T00:00:00`).toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });
const PRESETS = [[3, "3 months"], [6, "6 months"], [12, "12 months"]];

function toCsv(d) {
  const head = ["Tenant", "Meters", ...d.months, "Total kL", "Share", "Water & sewerage (current tariffs)", "Recharged", "Months missing"];
  const rows = d.tenants.map((t) => [t.tenant, t.meters.map((m) => m.name).join(" + "), ...d.months.map((p) => t.months[p] ?? ""),
    t.usage, (t.share * 100).toFixed(1) + "%", t.cost.toFixed(2), t.recharge ? "yes" : "no", t.missing.join(" ")]);
  rows.push(["Total", "", ...d.months.map((p) => d.byMonth[p]), d.totalUsage, "100%", d.totalCost.toFixed(2), "", ""]);
  return [head, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function WaterUsage() {
  const [from, setFrom] = useState(month(-5));
  const [to, setTo] = useState(month(0));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!from || !to) return;
    fetch(`/api/water-usage?from=${from}&to=${to}`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (!r.ok || j.error) setError(j.error || "Could not load"); else { setError(""); setData(j); }
    });
  }, [from, to]);

  const preset = (n) => { setTo(month(0)); setFrom(month(1 - n)); };
  const active = (n) => to === month(0) && from === month(1 - n);

  function download() {
    const blob = new Blob([toCsv(data)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `westfleur-water-by-tenant-${data.from}-to-${data.to}.csv`;
    a.click();
  }

  const top = data?.tenants.find((t) => t.usage > 0);

  return (
    <>
      <h1>Water usage by tenant</h1>
      <div className="bar">
        <label>From <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="segmented">
          {PRESETS.map(([n, l]) => <button key={n} className={active(n) ? "on" : ""} onClick={() => preset(n)}>{l}</button>)}
        </div>
        {data && <button className="ghost" onClick={download}>Download CSV</button>}
        {data && <button className="ghost" onClick={() => window.print()}>Print</button>}
      </div>
      {error && <p className="err">{error}</p>}
      {!data && !error && <p className="meta">Loading…</p>}
      {data && (
        <>
          <div className="summary">
            <div className="stat"><span className="meta">Total water, all tenant meters</span><b>{fmt(data.totalUsage)} kL</b>
              <span className="meta">{data.months.length} month{data.months.length === 1 ? "" : "s"} · {fmt(data.totalUsage / data.months.length)} kL a month on average</span></div>
            <div className="stat"><span className="meta">Recharged to tenants</span><b>{fmt(data.rechargedUsage)} kL</b>
              <span className="meta">excludes the gym and vacant shops</span></div>
            <div className="stat"><span className="meta">Water & sewerage value</span><b>{money(data.totalCost)}</b>
              <span className="meta">at today’s tariffs</span></div>
            {top && <div className="stat"><span className="meta">Highest user</span><b>{top.tenant}</b>
              <span className="meta">{fmt(top.usage)} kL · {(top.share * 100).toFixed(1)}% of the total</span></div>}
          </div>

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  {data.months.map((p) => <th key={p} className="num">{label(p)}</th>)}
                  <th className="num">Total kL</th><th className="num">Share</th><th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.tenants.map((t) => (
                  <tr key={t.tenant}>
                    <td>{t.tenant}
                      <div className="meta">{t.meters.map((m) => m.name).join(" + ")}{!t.recharge && " · not recharged"}</div>
                      {t.missing.length > 0 && <div className="meta">No usage for {t.missing.length === data.months.length ? "any month" : t.missing.map(label).join(", ")}</div>}
                    </td>
                    {data.months.map((p) => <td key={p} className="num">{t.months[p] === undefined ? "—" : fmt(t.months[p], 1)}</td>)}
                    <td className="num"><b>{fmt(t.usage)}</b></td>
                    <td className="num">{(t.share * 100).toFixed(1)}%
                      <div className="progress"><span style={{ width: `${t.share * 100}%` }} /></div></td>
                    <td className="num">{money(t.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Total</b></td>
                  {data.months.map((p) => <td key={p} className="num"><b>{fmt(data.byMonth[p], 1)}</b></td>)}
                  <td className="num"><b>{fmt(data.totalUsage)} kL</b></td>
                  <td className="num">100%</td>
                  <td className="num"><b>{money(data.totalCost)}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="meta">
            Usage each month is the meter reading less the meter’s previous reading, the same as the Meter report. City main meters are
            left out. Tenants are grouped by the name on the meter in Settings, so past months show under today’s name. “—” means no
            usable reading that month (not read, first reading, or lower than the month before). Value uses today’s tariffs
            ({money(data.tariffs.water_per_kl)}/kL water, {money(data.tariffs.sewer_per_kl)}/kL sewerage{data.tariffs.add_vat ? ", incl. VAT" : ""}),
            so it is a guide, not what was invoiced.
          </p>
        </>
      )}
    </>
  );
}
