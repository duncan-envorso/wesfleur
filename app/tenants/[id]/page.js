"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { compound, todayIso } from "@/lib/leases";
import { Alerts, Field, LeaseFields, R, StatusPill, api, dateZA, useForm } from "../ui";

const EVENT_KINDS = ["Note", "Payment", "Arrears", "Maintenance", "Notice", "Lease", "Deposit", "Insurance", "Termination"];
const LEASE_KEYS = ["unit_id", "status", "start_date", "end_date", "escalation_pct", "escalation_month", "escalation_day",
  "deposit_required", "deposit_held", "deposit_date", "vat_basis", "renewal_option", "notice_by", "document_url", "notes",
  "opex_amount", "opex_escalation_pct"];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k] ?? ""]));

function TenantDetails({ tenant, onSaved }) {
  const [v, set] = useForm(pick(tenant, ["trading_name", "legal_name", "reg_no", "vat_no", "contact_name", "phone", "email", "postal_address", "surety_name", "notes"]));
  const [msg, setMsg] = useState("");
  async function save() {
    setMsg("");
    try { await api(`/api/tenants/${tenant.id}`, "PATCH", v); setMsg("Saved"); onSaved(); }
    catch (e) { setMsg(e.message); }
  }
  return (
    <section className="card">
      <h2>Tenant details</h2>
      <div className="form-grid">
        <Field label="Trading name" name="trading_name" value={v.trading_name} onChange={set} />
        <Field label="Legal name (on the lease)" name="legal_name" value={v.legal_name} onChange={set} />
        <Field label="Company / CC reg. no." name="reg_no" value={v.reg_no} onChange={set} />
        <Field label="VAT no." name="vat_no" value={v.vat_no} onChange={set} hint="Needed on tax invoices once registered" />
        <Field label="Contact person" name="contact_name" value={v.contact_name} onChange={set} />
        <Field label="Phone" name="phone" type="tel" value={v.phone} onChange={set} />
        <Field label="Email" name="email" type="email" value={v.email} onChange={set} />
        <Field label="Surety" name="surety_name" value={v.surety_name} onChange={set} />
        <Field label="Postal / domicilium address" name="postal_address" type="textarea" value={v.postal_address} onChange={set} wide />
        <Field label="Notes" name="notes" type="textarea" value={v.notes} onChange={set} wide />
      </div>
      <div className="row"><button onClick={save}>Save details</button>{msg && <span className={msg === "Saved" ? "pill ok" : "err"}>{msg}</span>}</div>
    </section>
  );
}

function RentChange({ lease, onSaved }) {
  const s = lease.state;
  const pct = Number(lease.escalation_pct) || 0;
  const suggestion = s.missed.length
    ? { effective_from: s.missed[0], amount: compound(lease.current_rent, pct, 1), reason: `${pct}% annual increase (missed)` }
    : s.nextDate && !s.nextAfterEnd
      ? { effective_from: s.nextDate, amount: s.nextAmount, reason: `${pct}% annual increase` }
      : { effective_from: todayIso(), amount: "", reason: "" };
  const [v, set, setV] = useForm(suggestion);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try { await api(`/api/leases/${lease.id}/rent`, "POST", v); setOpen(false); onSaved(); }
    catch (e) { setErr(e.message); }
  }
  if (!open) {
    return (
      <button className="ghost" onClick={() => { setV(suggestion); setOpen(true); }}>
        {s.missed.length ? `Apply missed ${pct}% increase from ${dateZA(s.missed[0])}` : "Record a rent change"}
      </button>
    );
  }
  return (
    <div className="subcard">
      <div className="form-grid">
        <Field label="New monthly rent (R)" name="amount" type="number" value={v.amount} onChange={set} />
        <Field label="Applies from" name="effective_from" type="date" value={v.effective_from} onChange={set} />
        <Field label="Reason" name="reason" value={v.reason} onChange={set} wide />
      </div>
      {err && <p className="err">{err}</p>}
      <div className="row"><button onClick={save}>Save rent change</button><button className="ghost" onClick={() => setOpen(false)}>Cancel</button></div>
      <p className="meta">This is added to the rent history and becomes the rent billed from that date. If more than one increase was missed, apply them one at a time.</p>
    </div>
  );
}

function LeaseCard({ lease, units, onSaved }) {
  const s = lease.state;
  const [edit, setEdit] = useState(false);
  const [v, set, setV] = useForm(pick(lease, LEASE_KEYS));
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try { await api(`/api/leases/${lease.id}`, "PATCH", v); setEdit(false); onSaved(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <section className={"card" + (s.current ? "" : " muted")}>
      <div className="row">
        <h2>{lease.unit_name || "Unit not confirmed"} · {lease.start_date ? `${dateZA(lease.start_date)} – ${dateZA(lease.end_date)}` : lease.end_date ? `ends ${dateZA(lease.end_date)}` : "no lease dates"}</h2>
        <StatusPill lease={lease} />
      </div>
      <Alerts alerts={s.alerts} />

      <div className="facts">
        <div><span className="meta">Rent / month</span><b>{R(lease.current_rent)}</b><span className="meta">from {dateZA(lease.rent_from)}</span></div>
        <div><span className="meta">Escalation</span><b>{lease.escalation_pct ? `${lease.escalation_pct}% a year` : "—"}</b>
          <span className="meta">{s.anchor ? `each ${dateZA(`2000-${String(s.anchor.m).padStart(2, "0")}-${String(s.anchor.d).padStart(2, "0")}`).replace(" 2000", "")}` : "date not set"}</span></div>
        <div><span className="meta">Next increase</span><b>{s.nextDate && !s.nextAfterEnd ? R(s.nextAmount) : "—"}</b>
          <span className="meta">{s.nextDate && !s.nextAfterEnd ? dateZA(s.nextDate) : s.nextAfterEnd ? "lease ends first" : ""}</span></div>
        <div><span className="meta">Operating costs</span><b>{lease.opex_amount ? R(lease.opex_amount) : "—"}</b>
          <span className="meta">{lease.opex_amount ? `+${lease.opex_escalation_pct || 0}% a year` : "none on the lease"}</span></div>
        <div><span className="meta">Deposit</span><b>{R(lease.deposit_held)}</b>
          <span className="meta">{lease.deposit_required !== null ? `required ${R(lease.deposit_required)}` : "requirement not recorded"}</span></div>
        <div><span className="meta">VAT</span><b>{{ exclusive: "Exclusive", inclusive: "Inclusive", silent: "Silent" }[lease.vat_basis] || "—"}</b>
          <span className="meta">{lease.notice_by ? `renewal notice by ${dateZA(lease.notice_by)}` : lease.renewal_option || ""}</span></div>
      </div>
      {lease.notes && <p className="notes">{lease.notes}</p>}
      {lease.document_url && <p><a href={lease.document_url} target="_blank">Open signed lease ↗</a></p>}

      {s.schedule.length > 0 && (
        <details>
          <summary>Rent schedule</summary>
          <table className="tight">
            <thead><tr><th>From</th><th>To</th><th className="num">Monthly rent</th><th></th></tr></thead>
            <tbody>
              {s.schedule.map((r) => (
                <tr key={r.from}><td>{dateZA(r.from)}</td><td>{dateZA(r.to)}</td><td className="num">{R(r.amount)}</td>
                  <td>{r.missed && <span className="pill bad">not applied</span>}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {lease.history?.length > 0 && (
        <details>
          <summary>Rent history ({lease.history.length})</summary>
          <table className="tight">
            <thead><tr><th>From</th><th className="num">Rent</th><th>Reason</th><th>Recorded</th></tr></thead>
            <tbody>
              {lease.history.map((h) => (
                <tr key={h.id}><td>{dateZA(h.effective_from)}</td><td className="num">{R(h.amount)}</td><td>{h.reason}</td>
                  <td className="meta">{String(h.created_at).slice(0, 10)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <div className="row wrap">
        {lease.status !== "ended" && <RentChange lease={lease} onSaved={onSaved} />}
        <button className="ghost" onClick={() => { setV(pick(lease, LEASE_KEYS)); setEdit(!edit); }}>{edit ? "Close" : "Edit lease terms"}</button>
      </div>
      {edit && (
        <div className="subcard">
          <LeaseFields v={v} set={set} units={units} />
          {err && <p className="err">{err}</p>}
          <button onClick={save}>Save lease</button>
        </div>
      )}
    </section>
  );
}

function NewLease({ tenantId, units, last, onSaved }) {
  const [open, setOpen] = useState(false);
  const [v, set] = useForm({
    status: "renewal", unit_id: last?.unit_id ?? "", start_date: "", end_date: "", current_rent: "", rent_from: "",
    escalation_pct: last?.escalation_pct ?? "", deposit_required: last?.deposit_required ?? "", deposit_held: last?.deposit_held ?? "",
  });
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try { await api("/api/leases", "POST", { ...v, tenant_id: tenantId }); setOpen(false); onSaved(); }
    catch (e) { setErr(e.message); }
  }
  if (!open) return <button className="ghost" onClick={() => setOpen(true)}>Add a lease or renewal</button>;
  return (
    <section className="card">
      <h2>New lease</h2>
      <LeaseFields v={v} set={set} units={units} includeRent />
      {err && <p className="err">{err}</p>}
      <div className="row"><button onClick={save}>Save lease</button><button className="ghost" onClick={() => setOpen(false)}>Cancel</button></div>
      <p className="meta">When a renewal starts, mark the old lease Ended and this one Signed.</p>
    </section>
  );
}

function EventLog({ tenantId, events, onSaved }) {
  const [v, set, setV] = useForm({ event_date: todayIso(), kind: "Note", text: "" });
  const [err, setErr] = useState("");
  async function add() {
    setErr("");
    try { await api(`/api/tenants/${tenantId}/events`, "POST", v); setV({ ...v, text: "" }); onSaved(); }
    catch (e) { setErr(e.message); }
  }
  async function remove(id) {
    if (!confirmDelete()) return;
    await api(`/api/events/${id}`, "DELETE");
    onSaved();
  }
  return (
    <section className="card">
      <h2>History and notes</h2>
      <p className="meta">Amendments, notices, arrears, maintenance, insurance claims, deposit movements — anything you&apos;d want in an audit trail.</p>
      <div className="form-grid">
        <Field label="Date" name="event_date" type="date" value={v.event_date} onChange={set} />
        <Field label="Type" name="kind" value={v.kind} onChange={set}>
          <select value={v.kind} onChange={(e) => set("kind", e.target.value)}>{EVENT_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        </Field>
        <Field label="What happened" name="text" type="textarea" value={v.text} onChange={set} wide />
      </div>
      {err && <p className="err">{err}</p>}
      <div><button onClick={add}>Add to history</button></div>
      {events.length > 0 && (
        <table className="tight">
          <tbody>
            {events.map((e) => (
              <tr key={e.id}><td className="nowrap">{dateZA(e.event_date)}</td><td><span className="pill">{e.kind}</span></td><td>{e.text}</td>
                <td><button className="linkish" onClick={() => remove(e.id)} aria-label="Delete">×</button></td></tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// Two-tap delete without a browser dialog.
let pending = 0;
function confirmDelete() {
  const now = Date.now();
  if (now - pending < 3000) { pending = 0; return true; }
  pending = now;
  return false;
}

export default function TenantPage({ params }) {
  const { id } = use(params);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api(`/api/tenants/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="meta">Loading…</p>;
  const { tenant, leases, events, units } = data;
  const ordered = [...leases].sort((a, b) => (b.state.current - a.state.current) || ((b.start_date || "") > (a.start_date || "") ? 1 : -1));

  return (
    <>
      <p><Link href="/tenants">← All tenants</Link></p>
      <h1>{tenant.trading_name}</h1>
      {tenant.legal_name && tenant.legal_name !== tenant.trading_name && <p className="meta" style={{ marginTop: -8 }}>{tenant.legal_name}{tenant.reg_no ? ` · ${tenant.reg_no}` : ""}</p>}
      <div className="stack">
        {ordered.map((l) => <LeaseCard key={`${l.id}-${l.current_rent}-${l.status}`} lease={l} units={units} onSaved={load} />)}
        <NewLease tenantId={tenant.id} units={units} last={ordered[0]} onSaved={load} />
        <TenantDetails key={tenant.id + JSON.stringify(tenant)} tenant={tenant} onSaved={load} />
        <EventLog tenantId={tenant.id} events={events} onSaved={load} />
      </div>
      <p className="meta">Tap × twice to delete a history entry.</p>
    </>
  );
}
