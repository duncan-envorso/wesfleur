"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { R, api, dateZA } from "../tenants/ui";
import CityBill from "./city-bill";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

export default function Invoices() {
  const [period, setPeriod] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/invoices?period=${period}`));
    } catch (e) { setErr(e.message); }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  async function act(action, label) {
    setBusy(label); setErr(""); setMsg("");
    try {
      const r = await api("/api/invoices", "POST", { action, period });
      setMsg(action === "refresh-all" ? `Rebuilt ${r.refreshed} draft${r.refreshed === 1 ? "" : "s"} from the latest readings and City bill. Lines you added were kept.` : action === "prepare"
        ? `${r.created} draft${r.created === 1 ? "" : "s"} prepared${r.skipped ? ` (${r.skipped} tenant${r.skipped === 1 ? "" : "s"} already invoiced)` : ""}.`
        : `Issued ${r.issued.length}: ${r.issued.join(", ") || "none"}.`);
      await load();
    } catch (e) { setErr(e.message); } finally { setBusy(""); }
  }



  const inv = data?.invoices || [];
  const drafts = inv.filter((i) => i.status === "draft");
  const issued = inv.filter((i) => i.status === "issued" && i.kind === "invoice");
  const warnCount = drafts.reduce((s, d) => s + (d.warnings?.length || 0), 0);

  return (
    <>
      <h1>Invoices</h1>
      <div className="bar">
        <label>Billing month<input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
        <button onClick={() => act("prepare", "Preparing…")} disabled={!!busy}>{busy === "Preparing…" ? busy : "Prepare drafts"}</button>
        <button className="ghost" onClick={() => act("refresh-all", "Rebuilding…")} disabled={!!busy || !drafts.length}
          title="Use after entering or correcting meter readings or the City bill">
          {busy === "Rebuilding…" ? busy : "Rebuild all drafts"}
        </button>
        <button className={confirmAll ? "danger" : "ghost"} disabled={!!busy || !drafts.length}
          onClick={() => { if (!confirmAll) { setConfirmAll(true); return; } setConfirmAll(false); act("issue-all", "Issuing…"); }}>
          {busy === "Issuing…" ? busy : confirmAll
            ? `Tap again to issue ${drafts.length}${warnCount ? ` — ${warnCount} warning${warnCount === 1 ? "" : "s"} not checked` : ""}`
            : `Issue all drafts (${drafts.length})`}
        </button>
        {data && <span className="pill">Next number {data.nextNumber}</span>}
        <span className={"pill" + (data?.vatFrom ? " ok" : "")}>{data?.vatFrom ? `VAT from ${dateZA(data.vatFrom)}` : "Not VAT-registered"}</span>
      </div>
      {msg && <p className="pill ok" style={{ display: "inline-block" }}>{msg}</p>}
      {err && <p className="err">{err}</p>}
      {warnCount > 0 && <p className="warnbox">{warnCount} thing{warnCount === 1 ? "" : "s"} to check on the drafts — open each one marked ⚠ before issuing.</p>}

      <CityBill period={period} onSaved={load} />

      <div className="summary">
        <div className="stat"><span className="meta">Drafts</span><b>{drafts.length}</b><span className="meta">{R(drafts.reduce((s, d) => s + d.total, 0))}</span></div>
        <div className="stat"><span className="meta">Issued this month</span><b>{issued.length}</b><span className="meta">{R(issued.reduce((s, d) => s + d.total, 0))}</span></div>
      </div>

      <div className="scroll">
        <table>
          <thead><tr><th>Unit</th><th>Tenant</th><th>Number</th><th>Date</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {inv.length === 0 && <tr><td colSpan={7} className="meta">No invoices for this month yet. Capture the meter readings, then tap “Prepare drafts”.</td></tr>}
            {inv.map((i) => (
              <tr key={i.id}>
                <td>{i.unit_name || "—"}</td>
                <td><Link href={`/invoices/${i.id}`}><b>{i.trading_name}</b></Link></td>
                <td>{i.number || <span className="meta">draft</span>}{i.kind === "credit" && <div className="meta">credit note</div>}</td>
                <td>{dateZA(i.issue_date)}</td>
                <td className="num">{R(i.total)}</td>
                <td>
                  <span className={"pill " + (i.status === "issued" ? (i.credited_by ? "" : "ok") : "warn")}>
                    {i.status === "issued" ? (i.credited_by ? `credited (${i.credited_by})` : "issued") : "draft"}
                  </span>
                  {i.status === "draft" && i.warnings?.length > 0 && <span className="warnbox" title={i.warnings.join("\n")}> ⚠ {i.warnings.length}</span>}
                </td>
                <td className="nowrap">
                  <Link href={`/invoices/${i.id}`}>{i.status === "draft" ? "Review" : "Open"}</Link>{" · "}
                  <a href={`/api/invoices/${i.id}/pdf`} target="_blank">PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link href="/payments" className="card link-card">
        <div><h2>Payments and balances →</h2><p className="meta">See what each tenant owes this month, and record payments received.</p></div>
      </Link>
    </>
  );
}
