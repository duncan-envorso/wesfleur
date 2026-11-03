"use client";
import { useEffect, useState } from "react";
import { Field, LeaseFields, api, useForm } from "../ui";

export default function NewTenant() {
  const [units, setUnits] = useState([]);
  const [t, setT] = useForm({ trading_name: "", legal_name: "", contact_name: "", phone: "", email: "" });
  const [l, setL] = useForm({ status: "signed", unit_id: "", start_date: "", end_date: "", current_rent: "", rent_from: "", escalation_pct: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("/api/tenants").then((d) => setUnits(d.units)).catch(() => {}); }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { id } = await api("/api/tenants", "POST", { tenant: t, lease: l });
      window.location.href = `/tenants/${id}`;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <h1>Add a tenant</h1>
      <div className="card">
        <h2>Tenant</h2>
        <div className="form-grid">
          <Field label="Trading name *" name="trading_name" value={t.trading_name} onChange={setT} />
          <Field label="Legal name (on the lease)" name="legal_name" value={t.legal_name} onChange={setT} />
          <Field label="Contact person" name="contact_name" value={t.contact_name} onChange={setT} />
          <Field label="Phone" name="phone" type="tel" value={t.phone} onChange={setT} />
          <Field label="Email" name="email" type="email" value={t.email} onChange={setT} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h2>Lease</h2>
        <LeaseFields v={l} set={setL} units={units} includeRent />
      </div>
      {error && <p className="err">{error}</p>}
      <p><button disabled={busy}>{busy ? "Saving…" : "Save tenant"}</button></p>
    </form>
  );
}
