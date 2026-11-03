"use client";
import { useEffect, useState } from "react";

const FIELDS = [
  ["water_per_kl", "Water, R per kL (excl. VAT)"],
  ["sewer_per_kl", "Sewerage, R per kL (excl. VAT)"],
  ["sewer_pct", "Sewerage share of water (0.95 = 95%)"],
  ["electricity_per_kwh", "Electricity, R per kWh (excl. VAT)"],
  ["vat_rate", "VAT rate (0.15 = 15%)"],
];

export default function Settings() {
  const [t, setT] = useState(null);
  const [meters, setMeters] = useState([]);
  const [msg, setMsg] = useState("");
  const [nm, setNm] = useState({ name: "", shop: "", tenant: "", type: "water", meter_no: "" });

  const loadMeters = () => fetch("/api/meters").then((r) => r.json()).then(setMeters);
  useEffect(() => {
    fetch("/api/tariffs").then((r) => r.json()).then(setT);
    loadMeters();
  }, []);

  async function saveTariffs() {
    const r = await fetch("/api/tariffs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(t) });
    setT(await r.json());
    setMsg("Tariffs saved");
  }

  async function patch(id, body) {
    await fetch(`/api/meters/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    loadMeters();
  }

  async function add() {
    if (!nm.name) return;
    await fetch("/api/meters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(nm) });
    setNm({ name: "", shop: "", tenant: "", type: "water", meter_no: "" });
    loadMeters();
  }

  return (
    <>
      <h1>Settings</h1>
      <h2 style={{ margin: "8px 0" }}>City tariffs</h2>
      {t && (
        <div className="bar">
          {FIELDS.map(([k, label]) => (
            <label key={k}>{label}
              <input type="number" step="0.0001" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} />
            </label>
          ))}
          <label>Add VAT to recharges
            <select value={t.add_vat ? "yes" : "no"} onChange={(e) => setT({ ...t, add_vat: e.target.value === "yes" })}>
              <option value="yes">Yes — recover the City&apos;s VAT-inclusive cost</option>
              <option value="no">No — amounts excl. VAT</option>
            </select>
          </label>
          <button onClick={saveTariffs}>Save tariffs</button>
          {msg && <span className="pill ok">{msg}</span>}
        </div>
      )}
      <p className="meta">Defaults are the City of Cape Town 2026/27 commercial tariffs (from 1 July 2026, no water restrictions). Update them each July or if restrictions are declared.</p>

      <h2 style={{ margin: "20px 0 8px" }}>Meters</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Name</th><th>Tenant</th><th>Meter no.</th><th>Type</th><th>City main</th><th>Recharge</th><th>Active</th></tr></thead>
          <tbody>
            {meters.map((m) => (
              <tr key={m.id}>
                <td><input defaultValue={m.name} onBlur={(e) => e.target.value !== m.name && patch(m.id, { name: e.target.value })} /></td>
                <td><input defaultValue={m.tenant || ""} onBlur={(e) => e.target.value !== (m.tenant || "") && patch(m.id, { tenant: e.target.value })} /></td>
                <td><input defaultValue={m.meter_no || ""} onBlur={(e) => e.target.value !== (m.meter_no || "") && patch(m.id, { meter_no: e.target.value })} /></td>
                <td>{m.type}</td>
                <td><input type="checkbox" checked={m.is_main} onChange={(e) => patch(m.id, { is_main: e.target.checked })} /></td>
                <td><input type="checkbox" checked={m.recharge} onChange={(e) => patch(m.id, { recharge: e.target.checked })} /></td>
                <td><input type="checkbox" checked={m.active} onChange={(e) => patch(m.id, { active: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">&quot;City main&quot; is the meter the City bills; the report compares it with the sum of the other water meters. Untick &quot;Recharge&quot; for the gym, common areas and vacant shops — that water is the company&apos;s own cost.</p>

      <h2 style={{ margin: "20px 0 8px" }}>Add a meter</h2>
      <div className="bar">
        <label>Name<input value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} placeholder="Shop 11" /></label>
        <label>Shop<input value={nm.shop} onChange={(e) => setNm({ ...nm, shop: e.target.value })} /></label>
        <label>Tenant<input value={nm.tenant} onChange={(e) => setNm({ ...nm, tenant: e.target.value })} /></label>
        <label>Meter no.<input value={nm.meter_no} onChange={(e) => setNm({ ...nm, meter_no: e.target.value })} /></label>
        <label>Type
          <select value={nm.type} onChange={(e) => setNm({ ...nm, type: e.target.value })}>
            <option value="water">Water</option>
            <option value="electricity">Electricity</option>
          </select>
        </label>
        <button onClick={add}>Add meter</button>
      </div>
    </>
  );
}
