"use client";
import { useState } from "react";
import { STATUSES, fmt } from "@/lib/leases";

export const R = (n) => (n === null || n === undefined ? "—" : "R" + fmt(n));
export const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dateZA = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m]} ${y}`;
};

export async function api(url, method = "GET", body) {
  const r = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

export function StatusPill({ lease }) {
  if (!lease) return <span className="pill">Vacant</span>;
  const label = lease.state?.statusLabel || STATUSES[lease.status];
  const cls = { Signed: "ok", Holdover: "bad", "No lease": "bad", "Not signed": "warn", Ended: "", "Renewal (future)": "info" }[label] || "";
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function Alerts({ alerts, compact }) {
  if (!alerts?.length) return compact ? <span className="pill ok">OK</span> : null;
  return (
    <ul className={"alerts" + (compact ? " compact" : "")}>
      {alerts.map((a, i) => <li key={i} className={a.level}>{a.text}</li>)}
    </ul>
  );
}

export function Field({ label, name, value, onChange, type = "text", placeholder, wide, children, hint }) {
  return (
    <label className={wide ? "wide" : ""}>
      {label}
      {children || (type === "textarea"
        ? <textarea rows={3} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(name, e.target.value)} />
        : <input type={type} inputMode={type === "number" ? "decimal" : undefined} step="any" value={value ?? ""} placeholder={placeholder}
            onChange={(e) => onChange(name, e.target.value)} />)}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function useForm(initial) {
  const [v, setV] = useState(initial);
  const set = (k, val) => setV((o) => ({ ...o, [k]: val }));
  return [v, set, setV];
}

// Lease terms form, used for editing and for adding a lease or renewal.
export function LeaseFields({ v, set, units, includeRent }) {
  return (
    <div className="form-grid">
      <Field label="Unit" name="unit_id" value={v.unit_id} onChange={set}>
        <select value={v.unit_id ?? ""} onChange={(e) => set("unit_id", e.target.value)}>
          <option value="">Not confirmed</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.area_m2 ? ` (${u.area_m2} m²)` : ""}</option>)}
        </select>
      </Field>
      <Field label="Lease status" name="status" value={v.status} onChange={set}>
        <select value={v.status} onChange={(e) => set("status", e.target.value)}>
          {Object.entries(STATUSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Start date" name="start_date" type="date" value={v.start_date} onChange={set} />
      <Field label="End date" name="end_date" type="date" value={v.end_date} onChange={set} />
      {includeRent && <Field label="Monthly rent (R, excl. VAT)" name="current_rent" type="number" value={v.current_rent} onChange={set} />}
      {includeRent && <Field label="Rent applies from" name="rent_from" type="date" value={v.rent_from} onChange={set} hint="Defaults to the start date" />}
      <Field label="Escalation % per year" name="escalation_pct" type="number" value={v.escalation_pct} onChange={set} placeholder="7" />
      <Field label="Increase month" name="escalation_month" value={v.escalation_month} onChange={set}
        hint="Leave blank to use the lease start anniversary">
        <select value={v.escalation_month ?? ""} onChange={(e) => set("escalation_month", e.target.value)}>
          <option value="">Lease anniversary</option>
          {MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </Field>
      <Field label="Increase day" name="escalation_day" type="number" value={v.escalation_day} onChange={set} placeholder="1" />
      <Field label="Deposit required (R)" name="deposit_required" type="number" value={v.deposit_required} onChange={set} />
      <Field label="Deposit held (R)" name="deposit_held" type="number" value={v.deposit_held} onChange={set} />
      <Field label="Deposit received on" name="deposit_date" type="date" value={v.deposit_date} onChange={set} />
      <Field label="Rent and VAT" name="vat_basis" value={v.vat_basis} onChange={set}>
        <select value={v.vat_basis ?? ""} onChange={(e) => set("vat_basis", e.target.value)}>
          <option value="">Not recorded</option>
          <option value="exclusive">Lease says exclusive of VAT</option>
          <option value="inclusive">Lease says inclusive of VAT</option>
          <option value="silent">Lease is silent (treated as inclusive)</option>
        </select>
      </Field>
      <Field label="Renewal option" name="renewal_option" value={v.renewal_option} onChange={set} placeholder="e.g. 5 years" />
      <Field label="Renewal notice by" name="notice_by" type="date" value={v.notice_by} onChange={set} />
      <Field label="Link to signed lease" name="document_url" value={v.document_url} onChange={set} placeholder="Google Drive / Dropbox link" wide />
      <Field label="Special terms and notes" name="notes" type="textarea" value={v.notes} onChange={set} wide />
    </div>
  );
}
