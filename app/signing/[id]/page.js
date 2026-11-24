"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { api } from "../../tenants/ui";
import { SetupNotes, when } from "../ui";

const PILL = { draft: "", sent: "info", completed: "ok", voided: "", declined: "bad" };
const SIGNER = { waiting: ["Not sent", ""], sent: ["Link sent", "info"], viewed: ["Opened", "info"], signed: ["Signed", "ok"], declined: ["Declined", "bad"] };

export default function SigningRequest({ params }) {
  const { id } = use(params);
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [links, setLinks] = useState({});
  const [voidReason, setVoidReason] = useState("");
  const load = useCallback(() => api(`/api/signing/${id}`).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function act(body, label) {
    setBusy(label); setErr(""); setMsg("");
    try {
      const j = await api(`/api/signing/${id}`, "POST", body);
      if (body.action === "link") {
        setLinks((l) => ({ ...l, [body.signer_id]: j.url }));
        try { await navigator.clipboard.writeText(j.url); setMsg("Link copied. Paste it into WhatsApp or an email to the signer."); } catch { setMsg("Link ready below: copy it and send it to the signer."); }
      } else if (j.sent) setMsg(`Emailed ${j.sent.join(", ")}.`);
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  }

  if (err && !d) return <p className="err">{err}</p>;
  if (!d) return <p className="meta">Loading…</p>;
  const r = d.request;
  const open = r.status === "draft" || r.status === "sent";

  return (
    <>
      <p><Link href="/signing">← Lease signing</Link></p>
      <div className="row" style={{ alignItems: "baseline" }}>
        <h1>{r.title}</h1>
        <span className={`pill ${PILL[r.status]}`}>{r.status_label}</span>
      </div>
      <p className="meta" style={{ marginTop: -8 }}>
        {r.tenant_id && <><Link href={`/tenants/${r.tenant_id}`}>{r.tenant_name}</Link> · </>}{r.page_count} pages · WFC-SIGN-{r.id} · prepared {when(r.created_at)}{r.created_by ? ` by ${r.created_by}` : ""}
      </p>
      {open && <SetupNotes mail={d.mail} drive={d.drive} />}

      <section className="card">
        <div className="row"><h2>Signers</h2>
          {open && d.mail && <button disabled={!!busy} onClick={() => act({ action: "send" }, "send")}>{busy === "send" ? "Sending…" : r.status === "draft" ? "Email everyone their link" : "Email links again to everyone not signed"}</button>}
        </div>
        <ul className="signer-list">
          {d.signers.map((s) => {
            const [label, cls] = SIGNER[s.status] || [s.status, ""];
            return (
              <li key={s.id}>
                <div className="signer-main">
                  <b>{s.name}</b> <span className="meta">{s.party}{s.capacity ? ` · ${s.capacity}` : ""}</span>
                  <div className="meta">{s.email || "no email"}</div>
                  <div className="meta">
                    {s.sent_at && <>Link {when(s.sent_at)} · </>}{s.viewed_at && <>opened {when(s.viewed_at)} · </>}
                    {s.verified_at && <>code confirmed {when(s.verified_at)} · </>}
                    {s.signed_at && <>signed {when(s.signed_at)} at {s.place}{s.ip ? ` (IP ${s.ip})` : ""}</>}
                    {s.decline_reason && <span className="err">Declined: {s.decline_reason}</span>}
                  </div>
                  {links[s.id] && <input className="link-out" readOnly value={links[s.id]} onFocus={(e) => e.target.select()} />}
                </div>
                <div className="signer-act">
                  <span className={`pill ${cls}`}>{label}</span>
                  {open && s.status !== "signed" && (
                    <>
                      {d.mail && s.email && <button className="ghost" disabled={!!busy} onClick={() => act({ action: "resend", signer_id: s.id }, "r" + s.id)}>{busy === "r" + s.id ? "Sending…" : "Email link"}</button>}
                      <button className="ghost" disabled={!!busy} onClick={() => act({ action: "link", signer_id: s.id }, "l" + s.id)}>{busy === "l" + s.id ? "…" : "Copy link"}</button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {open && <p className="meta">Making a new link (email or copy) stops that signer&apos;s earlier link from working. Links last 21 days.</p>}
        {msg && <p className="pill ok" style={{ justifySelf: "start" }}>{msg}</p>}
        {err && <p className="err">{err}</p>}
      </section>

      <section className="card">
        <h2>Documents</h2>
        <div className="row" style={{ justifyContent: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <a className="btn ghost" href={`/api/signing/${r.id}/file`} target="_blank" rel="noreferrer">Lease as sent (PDF)</a>
          {r.signed_file_id && <a className="btn" href={`/api/signing/${r.id}/file?kind=signed`} target="_blank" rel="noreferrer">Signed lease with certificate (PDF)</a>}
        </div>
        <p className="meta" style={{ wordBreak: "break-all" }}>Fingerprint (SHA-256) of the lease as sent: {r.original_sha256}{r.signed_sha256 && <><br />Signed file: {r.signed_sha256}</>}</p>
        {r.seal_error && (
          <p className="err">Everyone signed, but building the signed PDF failed: {r.seal_error}{" "}
            <button className="ghost" disabled={!!busy} onClick={() => act({ action: "retry_seal" }, "seal")}>Try again</button></p>
        )}
        {r.status === "completed" && (
          <p className="meta">
            Google Drive: {r.drive_status === "saved" ? <>saved{r.drive_link && <> · <a href={r.drive_link} target="_blank" rel="noreferrer">open in Drive</a></>}</>
              : r.drive_status === "failed" ? <span className="err">failed: {r.drive_error}</span>
              : "not connected"}
            {r.drive_status !== "saved" && d.drive?.connected && <> <button className="ghost" disabled={!!busy} onClick={() => act({ action: "retry_drive" }, "drive")}>{busy === "drive" ? "Saving…" : "Save to Drive now"}</button></>}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Audit trail</h2>
        <ul className="audit">
          {d.events.map((e, i) => <li key={i}><span className="meta">{when(e.at)}</span> {e.signer_name && <b>{e.signer_name}: </b>}{e.detail || e.kind}{e.ip && <span className="meta"> · IP {e.ip}</span>}</li>)}
        </ul>
      </section>

      {open && (
        <details className="card">
          <summary><b>Cancel this signing request</b></summary>
          <p className="meta">All links stop working. Use this if the lease needs changing: then send the corrected PDF as a new request.</p>
          <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason (optional), e.g. rent amount wrong" />
          <button className="ghost" disabled={!!busy} onClick={() => act({ action: "void", reason: voidReason }, "void")}>Cancel request</button>
        </details>
      )}
    </>
  );
}
