"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api } from "../tenants/ui";
import { SetupNotes, statusPill, when } from "./ui";
import { dataKey, dataLabel } from "@/lib/lease-fields";


export default function SigningPage() {
  return <Suspense fallback={<p className="meta">Loading…</p>}><Signing /></Suspense>;
}

function Signing() {
  const sp = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [showNew, setShowNew] = useState(sp.get("new") === "1");
  const [templates, setTemplates] = useState(null);
  useEffect(() => {
    api("/api/signing").then(setData).catch((e) => setErr(e.message));
    api("/api/lease-templates").then((j) => setTemplates(j.templates)).catch(() => setTemplates([]));
  }, []);

  return (
    <>
      <div className="row" style={{ alignItems: "baseline" }}>
        <div>
          <h1>Lease signing</h1>
          <p className="meta" style={{ marginTop: -8 }}>Send a final lease to tenants to sign online. The signed copy is stored here{data?.drive?.connected ? " and backed up to Google Drive" : ""}.</p>
        </div>
        {!showNew && <button onClick={() => setShowNew(true)}>Send a lease for signing</button>}
      </div>
      {data && <SetupNotes mail={data.mail} drive={data.drive} />}
      {showNew && templates && <NewRequest tenantPreset={sp.get("tenant")} mail={data?.mail} templates={templates.filter((t) => !t.archived)} onCancel={() => setShowNew(false)} />}
      {err && <p className="err">{err}</p>}
      <h2 style={{ margin: "18px 0 8px" }}>Leases sent for signing</h2>
      {data && (data.requests.length === 0
        ? <p className="meta">Nothing sent for signing yet.</p>
        : (
          <div className="scroll">
            <table>
              <thead><tr><th>Lease</th><th>Tenant</th><th>Status</th><th>Signers</th><th>Sent</th><th>Signed</th></tr></thead>
              <tbody>
                {data.requests.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/signing/${r.id}`}><b>{r.title}</b></Link><div className="meta">{r.page_count} pages · WFC-SIGN-{r.id}</div></td>
                    <td>{r.tenant_id ? <Link href={`/tenants/${r.tenant_id}`}>{r.tenant_name}</Link> : "—"}</td>
                    <td>{statusPill(r)}{r.seal_error && <div className="warnbox">Sealing failed: open it to retry</div>}</td>
                    <td>{r.signers.map((s, i) => <div key={i} className="meta">{s.status === "signed" ? "✓" : s.status === "declined" ? "✗" : "○"} {s.name}</div>)}</td>
                    <td>{when(r.sent_at, true)}</td>
                    <td>{when(r.completed_at, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {templates && <Templates templates={templates} />}
    </>
  );
}

function Templates({ templates }) {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function upload(e) {
    e.preventDefault(); setErr("");
    if (!file) return setErr("Choose the lease PDF");
    if (file.size > 4 * 1024 * 1024) return setErr("That PDF is over 4 MB. Export it from Word as a normal (not scanned) PDF");
    setBusy(true);
    try {
      const fd = new FormData(); fd.set("file", file); fd.set("name", name);
      const r = await fetch("/api/lease-templates", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      router.push(`/signing/templates/${j.id}${j.boxes ? "?ready=1" : ""}`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }
  return (
    <section className="card" style={{ marginTop: 18 }}>
      <h2>Lease templates</h2>
      <p className="meta">A template is your standard lease with boxes on it: lease details the app fills in for each tenant, and where each party signs and initials.</p>
      {templates.length > 0 && (
        <ul className="signer-list">
          {templates.map((t) => (
            <li key={t.id}>
              <div className="signer-main"><Link href={`/signing/templates/${t.id}`}><b>{t.name}</b></Link>
                <div className="meta">{t.page_count} pages · {t.data_boxes} details · {t.boxes - t.data_boxes} signing boxes{t.archived ? " · archived" : ""}</div></div>
              <div className="signer-act"><Link className="btn ghost" href={`/signing/templates/${t.id}`}>Edit boxes</Link></div>
            </li>
          ))}
        </ul>
      )}
      <form className="row" style={{ justifyContent: "flex-start", gap: 8, flexWrap: "wrap" }} onSubmit={upload}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name, e.g. Fluxmans retail lease" style={{ minWidth: 260 }} />
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="ghost" disabled={busy}>{busy ? "Uploading…" : "Add template"}</button>
      </form>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function NewRequest({ tenantPreset, mail, templates, onCancel }) {
  const [mode, setMode] = useState(templates.length ? "template" : "upload");
  return (
    <>
      <div className="seg" style={{ margin: "4px 0 10px" }}>
        <button type="button" className={mode === "template" ? "on" : ""} onClick={() => setMode("template")}>From a template</button>
        <button type="button" className={mode === "upload" ? "on" : ""} onClick={() => setMode("upload")}>Upload a finished PDF</button>
      </div>
      {mode === "template"
        ? <FromTemplate tenantPreset={tenantPreset} mail={mail} templates={templates} onCancel={onCancel} />
        : <UploadRequest tenantPreset={tenantPreset} mail={mail} onCancel={onCancel} />}
    </>
  );
}

const ROLE_LABEL = { tenant: "Tenant", landlord: "Landlord", surety: "Other signer" };

function FromTemplate({ tenantPreset, mail, templates, onCancel }) {
  const router = useRouter();
  const [tenants, setTenants] = useState([]);
  const [templateId, setTemplateId] = useState(templates[0] ? String(templates[0].id) : "");
  const [tenantId, setTenantId] = useState(tenantPreset || "");
  const [leaseId, setLeaseId] = useState("");
  const [pre, setPre] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [values, setValues] = useState({});
  const [signers, setSigners] = useState([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [markSigned, setMarkSigned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api("/api/tenants").then((j) => setTenants(j.tenants.filter((t) => t.active))).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (templateId) api(`/api/lease-templates/${templateId}`).then((j) => setTpl(j.template)).catch((e) => setErr(e.message)); }, [templateId]);
  useEffect(() => {
    if (!templateId || !tenantId) { setPre(null); return; }
    api(`/api/lease-templates/${templateId}?tenant=${tenantId}${leaseId ? `&lease=${leaseId}` : ""}`).then((p) => {
      setPre(p); setValues(p.values); setTitle(p.title);
      if (!leaseId && p.lease_id) setLeaseId(String(p.lease_id));
      setSigners(p.roles.map((role) => ({ role, ...p.signers[role] })));
    }).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, tenantId, leaseId]);

  if (!templates.length) return <div className="card"><p>No templates yet. Add one under <b>Lease templates</b> below, place its boxes, then come back.</p></div>;
  const dataFields = (tpl?.fields || []).filter((f) => f.kind === "data");
  // One input per distinct detail, even if it appears in several places in the lease.
  const groups = [];
  for (const f of dataFields) {
    const k = dataKey(f);
    let g = groups.find((x) => x.key === k);
    if (!g) groups.push((g = { key: k, label: f.source === "custom" ? f.label || "Other" : dataLabel(f.source), ids: [], pages: new Set(), long: false }));
    g.ids.push(f.id); g.pages.add(f.page + 1); if (f.h > 0.04) g.long = true;
  }
  const setGroup = (g, val) => setValues((v) => { const n = { ...v }; for (const id of g.ids) n[id] = val; return n; });
  const setS = (i, k, v) => setSigners((a) => a.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  async function make(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await api("/api/lease-templates", "POST", { action: "make", template_id: Number(templateId), tenant_id: Number(tenantId), lease_id: Number(leaseId) || null, values, signers, title, message, mark_lease_signed: markSigned });
      router.push(`/signing/${r.id}`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <form className="card" onSubmit={make}>
      <h2>Make a lease from a template</h2>
      <div className="formgrid">
        <label>Template<select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Tenant
          <select value={tenantId} onChange={(e) => { setTenantId(e.target.value); setLeaseId(""); }} required>
            <option value="">Choose…</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.trading_name}{t.lease?.unit_name ? ` (${t.lease.unit_name})` : ""}</option>)}
          </select>
        </label>
        {pre?.leases?.length > 1 && (
          <label>Use details from lease<select value={leaseId} onChange={(e) => setLeaseId(e.target.value)}>{pre.leases.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
        )}
      </div>
      {pre && (
        <>
          <h3 style={{ margin: "6px 0 0" }}>Details that go into the lease</h3>
          <p className="meta">Filled in from the tenant&apos;s records. Change anything here; the tenant&apos;s records stay as they are.</p>
          {dataFields.length === 0 ? <p className="meta">This template has no lease data boxes.</p> : (
            <div className="formgrid">
              {groups.map((g) => {
                const val = values[g.ids[0]] ?? "";
                const where = `p. ${[...g.pages].join(", ")}`;
                return (
                  <label key={g.key} className={g.long ? "wide" : ""}>{g.label} <span className="meta">({where})</span>
                    {g.long
                      ? <textarea rows={3} value={val} onChange={(e) => setGroup(g, e.target.value)} className={val ? "" : "empty"} />
                      : <input value={val} onChange={(e) => setGroup(g, e.target.value)} className={val ? "" : "empty"} />}
                  </label>
                );
              })}
            </div>
          )}
          {groups.some((g) => !values[g.ids[0]]) && <p className="warnbox">Some details are empty: fill them in, or they&apos;ll stay blank in the lease.</p>}
          <label className="wide">Title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
          <h3 style={{ margin: "6px 0 0" }}>Who signs</h3>
          {signers.map((s, i) => (
            <div key={s.role} className="signer-row">
              <span className="pill info">{ROLE_LABEL[s.role] || s.role}</span>
              <input value={s.name} onChange={(e) => setS(i, "name", e.target.value)} placeholder="Full name" aria-label="Full name" required />
              <input type="email" value={s.email} onChange={(e) => setS(i, "email", e.target.value)} placeholder={mail ? "Email (required)" : "Email (optional)"} aria-label="Email" required={mail} />
              <input value={s.capacity} onChange={(e) => setS(i, "capacity", e.target.value)} placeholder="Signing as" aria-label="Capacity" />
              <span />
            </div>
          ))}
          <label className="wide">Message to the signers (optional)<textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          {leaseId && <label className="check"><input type="checkbox" checked={markSigned} onChange={(e) => setMarkSigned(e.target.checked)} /> Mark that lease as Signed in the app once everyone has signed</label>}
        </>
      )}
      {err && <p className="err">{err}</p>}
      <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
        <button disabled={busy || !pre}>{busy ? "Making the lease…" : "Make the lease"}</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
      <p className="meta">Nothing is sent yet: you can check the lease and its boxes on the next screen.</p>
    </form>
  );
}

function UploadRequest({ tenantPreset, mail, onCancel }) {
  const router = useRouter();
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState(tenantPreset || "");
  const [leaseId, setLeaseId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [markSigned, setMarkSigned] = useState(true);
  const [signers, setSigners] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api("/api/tenants").then((j) => setTenants(j.tenants.filter((t) => t.active))).catch((e) => setErr(e.message)); }, []);
  const tenant = useMemo(() => tenants.find((t) => String(t.id) === String(tenantId)), [tenants, tenantId]);

  // Fill sensible defaults when the tenant changes.
  useEffect(() => {
    if (!tenant) return;
    setLeaseId(tenant.lease?.id ? String(tenant.lease.id) : "");
    setTitle(`Lease agreement - ${tenant.trading_name}${tenant.lease?.unit_name ? ` (${tenant.lease.unit_name})` : ""}`);
    setSigners([
      { party: "tenant", name: tenant.contact_name || "", email: tenant.email || "", capacity: `For ${tenant.legal_name || tenant.trading_name}, duly authorised` },
      { party: "landlord", name: "Kirah Matthews", email: "", capacity: "For Westfleur Centre (Pty) Ltd, director, duly authorised" },
    ]);
  }, [tenant]);

  const setS = (i, k, v) => setSigners((a) => a.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!file) return setErr("Attach the final lease PDF");
    if (file.size > 4 * 1024 * 1024) return setErr("That PDF is over 4 MB. Export it from Word as a normal (not scanned) PDF");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("tenant_id", tenantId);
      fd.set("lease_id", leaseId);
      fd.set("title", title);
      fd.set("message", message);
      fd.set("mark_lease_signed", String(markSigned));
      fd.set("signers", JSON.stringify(signers));
      const r = await fetch("/api/signing", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't create it");
      router.push(`/signing/${j.id}`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Upload a finished lease</h2>
      <div className="formgrid">
        <label>Tenant
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} required>
            <option value="">Choose…</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.trading_name}{t.lease?.unit_name ? ` (${t.lease.unit_name})` : ""}</option>)}
          </select>
        </label>
        <label>Final lease (PDF, up to 4 MB)
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </label>
        <label className="wide">Title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        <label className="wide">Message to the signers (optional)<textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Here is the renewal we discussed. Please sign by 15 January." /></label>
      </div>
      <p className="meta">Export the lease from Word as a PDF once it&apos;s final. On the next screen you can place signature and initial boxes on it; if you don&apos;t, signers initial the foot of every page and sign a page added at the end. Suretyships still need a wet-ink signature.</p>

      {tenant && (
        <>
          <h3 style={{ margin: "4px 0 0" }}>Signers</h3>
          {signers.map((s, i) => (
            <div key={i} className="signer-row">
              <select value={s.party} onChange={(e) => setS(i, "party", e.target.value)} aria-label="Party">
                <option value="tenant">Tenant</option><option value="landlord">Landlord</option><option value="other">Other</option>
              </select>
              <input value={s.name} onChange={(e) => setS(i, "name", e.target.value)} placeholder="Full name" aria-label="Full name" required />
              <input type="email" value={s.email} onChange={(e) => setS(i, "email", e.target.value)} placeholder={mail ? "Email (required)" : "Email (optional)"} aria-label="Email" required={mail} />
              <input value={s.capacity} onChange={(e) => setS(i, "capacity", e.target.value)} placeholder="Signing as, e.g. For ABC (Pty) Ltd, director" aria-label="Capacity" />
              <button type="button" className="linkish" title="Remove" onClick={() => setSigners((a) => a.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="ghost" onClick={() => setSigners((a) => [...a, { party: "other", name: "", email: "", capacity: "" }])}>Add a signer</button>
          {tenant.lease && (
            <label className="check"><input type="checkbox" checked={markSigned} onChange={(e) => setMarkSigned(e.target.checked)} />
              Mark the {tenant.lease.unit_name || ""} lease as Signed in the app once everyone has signed</label>
          )}
        </>
      )}
      {err && <p className="err">{err}</p>}
      <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
        <button disabled={busy || !tenant}>{busy ? "Uploading…" : "Create"}</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
      <p className="meta">Nothing is sent yet: you&apos;ll check it and send it on the next screen.</p>
    </form>
  );
}
