"use client";
import { useEffect, useState } from "react";
import { api } from "../tenants/ui";

const BILLING_FIELDS = [
  ["company_name", "Company name"], ["reg_no", "Registration no."], ["email", "Email on invoices"], ["phone", "Phone"],
  ["bank_name", "Bank"], ["account_name", "Account name"], ["account_no", "Account no."], ["branch_code", "Branch code"],
  ["due_days", "Days to pay", "number"], ["prefix", "Invoice number prefix"],
];

export function BillingSettings() {
  const [v, setV] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/billing").then(setV).catch((e) => setMsg(e.message)); }, []);
  if (!v) return null;
  const set = (k, x) => setV({ ...v, [k]: x });
  async function save() {
    setMsg("");
    try { setV({ ...(await api("/api/billing", "PUT", v)), next_number: v.next_number }); setMsg("Saved"); }
    catch (e) { setMsg(e.message); }
  }
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <h2>Invoices</h2>
      <div className="form-grid">
        {BILLING_FIELDS.map(([k, label, type]) => (
          <label key={k}>{label}<input type={type || "text"} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></label>
        ))}
        <label>Next invoice number
          <input type="number" value={v.next_number ?? ""} onChange={(e) => set("next_number", e.target.value)} />
          <span className="hint">Can only be changed before the first invoice is issued from the app</span>
        </label>
        <label className="wide">Address<textarea rows={3} value={v.address} onChange={(e) => set("address", e.target.value)} /></label>
        <label className="wide">Footer<textarea rows={2} value={v.footer} onChange={(e) => set("footer", e.target.value)} /></label>
      </div>
      <h3>VAT</h3>
      <div className="form-grid">
        <label>Registered for VAT from
          <input type="date" value={v.vat_registered_from || ""} onChange={(e) => set("vat_registered_from", e.target.value)} />
          <span className="hint">Leave blank until SARS confirms registration</span>
        </label>
        <label>VAT number<input value={v.vat_number || ""} onChange={(e) => set("vat_number", e.target.value)} placeholder="4xxxxxxxxx" /></label>
        <label>VAT rate<input type="number" step="0.01" value={v.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} /></label>
      </div>
      <p className="meta">Until a registration date is entered, documents are titled “Invoice”, carry no VAT and say the company isn&apos;t registered. From that date they become tax invoices with VAT added on top, as the leases set rent exclusive of VAT.</p>
      <div className="row"><button onClick={save}>Save invoice settings</button>{msg && <span className={msg === "Saved" ? "pill ok" : "err"}>{msg}</span>}</div>
    </section>
  );
}

export function UnitsSettings() {
  const [units, setUnits] = useState([]);
  const [msg, setMsg] = useState("");
  const load = () => api("/api/tenants").then((d) => setUnits(d.units)).catch(() => {});
  useEffect(() => { load(); }, []);
  async function patch(id, body) {
    try { await api(`/api/units/${id}`, "PATCH", body); setMsg("Saved"); load(); } catch (e) { setMsg(e.message); }
  }
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <div className="row"><h2>Units</h2>{msg && <span className={msg === "Saved" ? "pill ok" : "err"}>{msg}</span>}</div>
      <table className="tight">
        <thead><tr><th>Unit</th><th>Area (m²)</th><th>Refuse / month (R)</th></tr></thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td><input className="n" defaultValue={u.area_m2 ?? ""} onBlur={(e) => e.target.value !== String(u.area_m2 ?? "") && patch(u.id, { area_m2: e.target.value })} /></td>
              <td><input className="n" defaultValue={u.refuse_monthly ?? ""} onBlur={(e) => e.target.value !== String(u.refuse_monthly ?? "") && patch(u.id, { refuse_monthly: e.target.value })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">Refuse is added to each month&apos;s invoice for the tenant in that unit. Starting values are from the November 2026 invoices.</p>
    </section>
  );
}

export function UsersSettings() {
  const [users, setUsers] = useState([]);
  const [nu, setNu] = useState({ username: "", name: "", role: "reader", password: "" });
  const [msg, setMsg] = useState("");
  const load = () => api("/api/users").then(setUsers).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);
  async function add() {
    setMsg("");
    try { await api("/api/users", "POST", nu); setNu({ username: "", name: "", role: "reader", password: "" }); setMsg("User added"); load(); }
    catch (e) { setMsg(e.message); }
  }
  async function patch(id, body) {
    setMsg("");
    try { await api(`/api/users/${id}`, "PATCH", body); setMsg("Saved"); load(); } catch (e) { setMsg(e.message); }
  }
  function gen() {
    const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*-_";
    const r = crypto.getRandomValues(new Uint32Array(16));
    setNu({ ...nu, password: Array.from(r, (x) => a[x % a.length]).join("") });
  }
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <div className="row"><h2>Users</h2>{msg && <span className={/Saved|added/.test(msg) ? "pill ok" : "err"}>{msg}</span>}</div>
      <p className="meta"><b>Admins</b> see everything and can issue invoices. <b>Meter readers</b> can only capture meter readings. The login set in Vercel (APP_USERNAME) is always an admin.</p>
      {users.length > 0 && (
        <table className="tight">
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Active</th><th>Last sign-in</th><th>Reset password</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td><td>{u.name}</td>
                <td><select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}><option value="admin">Admin</option><option value="reader">Meter reader</option></select></td>
                <td><input type="checkbox" checked={u.active} onChange={(e) => patch(u.id, { active: e.target.checked })} /></td>
                <td className="meta">{u.last_login ? String(u.last_login).slice(0, 10) : "never"}</td>
                <td><input type="password" placeholder="New password" onBlur={(e) => e.target.value && patch(u.id, { password: e.target.value }).then(() => (e.target.value = ""))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Add a user</h3>
      <div className="form-grid">
        <label>Username<input value={nu.username} autoCapitalize="none" onChange={(e) => setNu({ ...nu, username: e.target.value })} placeholder="kirah" /></label>
        <label>Name<input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></label>
        <label>Role
          <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="reader">Meter reader</option><option value="admin">Admin</option></select>
        </label>
        <label>Password
          <div className="pw"><input value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} placeholder="10+ characters" />
            <button type="button" className="ghost small" onClick={gen}>Generate</button></div>
          <span className="hint">Copy it now and give it to them — it isn&apos;t shown again</span>
        </label>
      </div>
      <div><button onClick={add}>Add user</button></div>
    </section>
  );
}
