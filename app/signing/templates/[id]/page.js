"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import FieldEditor from "../../../pdf/editor";
import { ROLES } from "@/lib/lease-fields";
import { api } from "../../../tenants/ui";

const PEOPLE = ROLES.map((r) => ({ key: r.key, label: r.label, color: r.color }));

export default function TemplateEditor({ params }) {
  const { id } = use(params);
  const [t, setT] = useState(null);
  const [fields, setFields] = useState([]);
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/lease-templates/${id}`).then(({ template }) => {
      setT(template); setFields(template.fields); setName(template.name);
      if (new URLSearchParams(window.location.search).get("ready")) setMsg(`Ready to use: ${template.fields.length} boxes came with this template`);
    }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(extra = {}) {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await api(`/api/lease-templates/${id}`, "PUT", { name, fields, ...extra });
      setDirty(false); setMsg(`Saved · ${r.boxes} boxes`);
      if (extra.archived !== undefined) setT((x) => ({ ...x, archived: extra.archived }));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (err && !t) return <p className="err">{err}</p>;
  if (!t) return <p className="meta">Loading…</p>;

  return (
    <>
      <p><Link href="/signing">← Lease signing</Link></p>
      <div className="row" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input className="title-input" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} aria-label="Template name" />
        <div className="row" style={{ gap: 8 }}>
          {msg && !dirty && <span className="pill ok">{msg}</span>}
          {dirty && <span className="pill warn">Unsaved changes</span>}
          <button disabled={busy || !dirty} onClick={() => save()}>{busy ? "Saving…" : "Save template"}</button>
        </div>
      </div>
      <details className="card help">
        <summary><b>How to set up a template</b> <span className="meta">({t.page_count} pages)</span></summary>
        <ol>
          <li><b>Lease data</b> boxes: put one over each blank in the lease (tenant name, reg no, shop, m², rent, dates, deposit…) and choose what fills it. When you make a lease for a tenant, the app fills these in from the tenant&apos;s records, and you can check and change them first.</li>
          <li><b>Signing boxes</b>: choose <b>For: Tenant</b> or <b>Landlord</b>, then drop <b>Signature</b>, <b>Date signed</b>, <b>Full name</b> and <b>Place</b> boxes on the signing page (e.g. page 53 of the Fluxmans lease). <b>Initials on every page</b> adds an initials box at the foot of each page for that party.</li>
          <li>Tap a box to change or delete it. Save when you&apos;re done. Use a version of the lease with blanks where the details go; it&apos;s best exported from Word as a PDF.</li>
        </ol>
      </details>
      {err && <p className="err">{err}</p>}
      <FieldEditor url={`/api/lease-templates/${id}/file`} fields={fields} onChange={(f) => { setFields(f); setDirty(true); }} whoKey="role" people={PEOPLE} allowData />
      <div className="row" style={{ justifyContent: "flex-start", gap: 10, marginTop: 16 }}>
        <button disabled={busy || !dirty} onClick={() => save()}>Save template</button>
        <button className="ghost" disabled={busy} onClick={() => save({ archived: !t.archived })}>{t.archived ? "Restore template" : "Archive template"}</button>
      </div>
    </>
  );
}
