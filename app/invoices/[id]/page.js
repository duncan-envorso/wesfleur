"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { R, api, dateZA } from "../../tenants/ui";

const QUICK = [
  { kind: "arrears", description: "Arrears brought forward" },
  { kind: "arrears", description: "Rent shortfall – increase not billed for " },
  { kind: "other", description: "Operating costs not billed for " },
  { kind: "credit", description: "Credit – " },
];
const toStr = (n) => (n === null || n === undefined ? "" : String(n));

function LineEditor({ lines, setLines }) {
  const set = (i, k, val) => setLines((ls) => ls.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, [k]: val };
    if (k === "quantity" || k === "unit_price") {
      const q = Number(String(n.quantity || 1).replace(",", "."));
      const p = Number(String(n.unit_price).replace(/\s/g, "").replace(",", "."));
      if (n.unit_price !== "" && Number.isFinite(q) && Number.isFinite(p)) n.amount = String(Math.round(q * p * 100) / 100);
    }
    return n;
  }));
  return (
    <div className="scroll">
      <table className="lines">
        <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th><th></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><input value={l.description} onChange={(e) => set(i, "description", e.target.value)} /></td>
              <td className="num"><input className="n" inputMode="decimal" value={toStr(l.quantity)} onChange={(e) => set(i, "quantity", e.target.value)} /></td>
              <td className="num"><input className="n" inputMode="decimal" value={toStr(l.unit_price)} onChange={(e) => set(i, "unit_price", e.target.value)} /></td>
              <td className="num"><input className="n" inputMode="decimal" value={toStr(l.amount)} onChange={(e) => set(i, "amount", e.target.value)} /></td>
              <td><button className="linkish" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove line">×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row wrap" style={{ marginTop: 8 }}>
        {QUICK.map((qk) => (
          <button key={qk.description} className="ghost small-btn" onClick={() => setLines((ls) => [...ls, { ...qk, quantity: "", unit_price: "", amount: "" }])}>
            + {qk.description.replace(/ (for |– )$/, "")}
          </button>
        ))}
        <button className="ghost small-btn" onClick={() => setLines((ls) => [...ls, { kind: "other", description: "", quantity: "", unit_price: "", amount: "" }])}>+ Blank line</button>
      </div>
    </div>
  );
}

export default function InvoicePage({ params }) {
  const { id } = use(params);
  const [inv, setInv] = useState(null);
  const [lines, setLines] = useState([]);
  const [head, setHead] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pdfKey, setPdfKey] = useState(0);

  const load = useCallback(async () => {
    const d = await api(`/api/invoices/${id}`);
    setInv(d);
    setLines(d.lines.map((l) => ({ ...l })));
    setHead({ issue_date: d.issue_date, due_date: d.due_date, notes: d.notes || "" });
    setDirty(false);
    setPdfKey((k) => k + 1);
  }, [id]);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);

  async function run(label, fn) {
    setBusy(label); setErr(""); setMsg("");
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(""); }
  }
  const save = () => run("Saving…", async () => { await api(`/api/invoices/${id}`, "PATCH", { ...head, lines }); await load(); setMsg("Saved"); });
  const refresh = () => run("Refreshing…", async () => {
    if (dirty) await api(`/api/invoices/${id}`, "PATCH", { ...head, lines });
    await api(`/api/invoices/${id}`, "POST", { action: "refresh" }); await load(); setMsg("Rebuilt from the lease and meter readings. Lines you added were kept.");
  });
  const issue = () => run("Issuing…", async () => {
    if (confirm !== "issue") { setConfirm("issue"); return; }
    setConfirm("");
    if (dirty) await api(`/api/invoices/${id}`, "PATCH", { ...head, lines });
    const r = await api(`/api/invoices/${id}`, "POST", { action: "issue" }); await load(); setMsg(`Issued as ${r.number}`);
  });
  const remove = () => run("Deleting…", async () => {
    if (confirm !== "delete") { setConfirm("delete"); return; }
    await api(`/api/invoices/${id}`, "DELETE"); window.location.href = `/invoices`;
  });
  const credit = () => run("Crediting…", async () => {
    if (confirm !== "credit") { setConfirm("credit"); return; }
    setConfirm("");
    const r = await api(`/api/invoices/${id}`, "POST", { action: "credit", reason }); await load(); setMsg(`Credit note ${r.number} issued. Prepare a corrected invoice from the Invoices page.`);
  });

  if (err && !inv) return <p className="err">{err}</p>;
  if (!inv) return <p className="meta">Loading…</p>;
  const draft = inv.status === "draft";
  const sub = lines.reduce((s, l) => s + (Number(String(l.amount).replace(/\s/g, "").replace(",", ".")) || 0), 0);

  return (
    <>
      <p><Link href="/invoices">← Invoices</Link></p>
      <div className="row" style={{ alignItems: "baseline" }}>
        <h1>{inv.kind === "credit" ? "Credit note" : "Invoice"} {inv.number || "(draft)"} · {inv.trading_name}</h1>
        <span className={"pill " + (draft ? "warn" : "ok")}>{draft ? "Draft" : inv.credited_by ? `Credited by ${inv.credited_by}` : "Issued"}</span>
      </div>
      <p className="meta" style={{ marginTop: -6 }}>{inv.unit_name} · period {inv.period}{inv.credit_of_number ? ` · credits ${inv.credit_of_number}` : ""}</p>

      {draft && inv.warnings?.length > 0 && <ul className="alerts">{inv.warnings.map((w, i) => <li key={i} className="medium">{w}</li>)}</ul>}

      <div className="inv-layout">
        <section className="card">
          {draft ? (
            <>
              <div className="form-grid">
                <label>Invoice date<input type="date" value={head.issue_date || ""} onChange={(e) => { setHead({ ...head, issue_date: e.target.value }); setDirty(true); }} /></label>
                <label>Due date<input type="date" value={head.due_date || ""} onChange={(e) => { setHead({ ...head, due_date: e.target.value }); setDirty(true); }} /></label>
              </div>
              <LineEditor lines={lines} setLines={(f) => { setLines(f); setDirty(true); }} />
              <label>Note on the invoice<textarea rows={2} value={head.notes} onChange={(e) => { setHead({ ...head, notes: e.target.value }); setDirty(true); }} /></label>
              <div className="row"><span className="meta">Subtotal</span><b>{R(sub)}</b></div>
              {err && <p className="err">{err}</p>}
              {msg && <p className="pill ok" style={{ justifySelf: "start" }}>{msg}</p>}
              <div className="row wrap">
                <button onClick={save} disabled={!!busy || !dirty}>{busy === "Saving…" ? busy : "Save changes"}</button>
                <button className="ghost" onClick={refresh} disabled={!!busy}>Rebuild from lease & readings</button>
                <button onClick={issue} disabled={!!busy} className={confirm === "issue" ? "danger" : ""}>
                  {confirm === "issue" ? "Tap again to issue — it can't be edited after" : busy === "Issuing…" ? busy : "Issue invoice"}
                </button>
                <button className="ghost" onClick={remove} disabled={!!busy}>{confirm === "delete" ? "Tap again to delete the draft" : "Delete draft"}</button>
              </div>
            </>
          ) : (
            <>
              <table className="tight">
                <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {inv.lines.map((l) => <tr key={l.id}><td>{l.description}</td><td className="num">{l.quantity ?? ""}</td><td className="num">{l.unit_price !== null ? R(l.unit_price) : ""}</td><td className="num">{R(l.amount)}</td></tr>)}
                </tbody>
              </table>
              <div className="facts">
                <div><span className="meta">Subtotal</span><b>{R(inv.subtotal)}</b></div>
                <div><span className="meta">VAT</span><b>{inv.vat_registered ? R(inv.vat) : "Not registered"}</b></div>
                <div><span className="meta">Total</span><b>{R(inv.total)}</b></div>
                <div><span className="meta">Amount due incl. balance</span><b>{R(inv.statement?.due)}</b></div>
              </div>
              <p className="meta">Issued {dateZA(inv.issue_date)}{inv.issued_by ? ` by ${inv.issued_by}` : ""} · due {dateZA(inv.due_date)}</p>
              {err && <p className="err">{err}</p>}
              {msg && <p className="pill ok" style={{ justifySelf: "start" }}>{msg}</p>}
              <div className="row wrap">
                <a className="btn" href={`/api/invoices/${id}/pdf?download=1`}>Download PDF</a>
                {inv.kind === "invoice" && !inv.credited_by && (
                  <>
                    <input placeholder="Reason for credit note" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <button className="ghost" onClick={credit} disabled={!!busy}>{confirm === "credit" ? "Tap again to issue the credit note" : "Credit this invoice"}</button>
                  </>
                )}
              </div>
              <p className="meta">Issued invoices are locked. To correct one, credit it and prepare a new invoice for the month.</p>
            </>
          )}
        </section>
        <section className="card pdf-preview">
          <div className="row"><h2>Preview</h2><a href={`/api/invoices/${id}/pdf`} target="_blank">Open PDF ↗</a></div>
          {dirty && <p className="meta">Save to update the preview.</p>}
          <iframe key={pdfKey} src={`/api/invoices/${id}/pdf#toolbar=0&view=FitH`} title="Invoice preview" />
        </section>
      </div>
    </>
  );
}
