"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api } from "../tenants/ui";
import { SetupNotes, statusPill, when } from "./ui";


export default function SigningPage() {
  return <Suspense fallback={<p className="meta">Loading…</p>}><Signing /></Suspense>;
}

function Signing() {
  const sp = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [showNew, setShowNew] = useState(sp.get("new") === "1");
  useEffect(() => { api("/api/signing").then(setData).catch((e) => setErr(e.message)); }, []);

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
      {showNew && <NewRequest tenantPreset={sp.get("tenant")} mail={data?.mail} onCancel={() => setShowNew(false)} />}
      {err && <p className="err">{err}</p>}
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
    </>
  );
}

function NewRequest({ tenantPreset, mail, onCancel }) {
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
      <h2>Send a lease for signing</h2>
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
      <p className="meta">Export the lease from Word as a PDF once it&apos;s final. Signers initial every page and sign a signature page added at the end. Suretyships still need a wet-ink signature: print, sign and upload them separately.</p>

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
